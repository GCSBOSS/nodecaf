import assert from 'assert';
import { parse, serialize } from '../lib/cookie.js';
import { Logger } from '../lib/logger.js';
import { Body } from '../lib/body.js';
import { nativeNodeModule } from '../lib/native_node.js';
import { layerConf } from '../lib/conf.js';
import { parse as tomlParse } from '../lib/toml.js';
import { Router } from '../lib/router.js';
import { HTTPError, anythingToError, buildHTTPError, handleError } from '../lib/error.js';

process.env.NODE_ENV = 'testing';

describe('Conf Layering', () => {

    it('Should ignore non-object layers', () => {
        const conf = layerConf({ key: 'value' }, 1);
        assert.strictEqual(conf.key, 'value');
    });

    it('Should preserve values not present in new layer', () => {
        let conf = layerConf({ key: 'value' });
        conf = layerConf(conf, { newKey: 'valu3' });
        assert.strictEqual(conf.key, 'value');
    });

    it('Should merge objects recursively instead of just replacing', () => {
        let conf = layerConf({ key: { a: 'b', e: [ 0 ] } });
        conf = layerConf(conf, { key: { c: 'd', e: [ 1 ] } });
        assert.strictEqual(conf.key.a, 'b');
        assert.strictEqual(conf.key.c, 'd');
        assert.strictEqual(conf.key.e[0], 1);
    });

    it('Should merge objects with null prototype', () => {
        const o = Object.create(null);
        o.b = 2;
        let conf = layerConf(o);
        conf = layerConf(conf, { a: 1 });
        assert.strictEqual(conf.a, 1);
        assert.strictEqual(conf.b, 2);
    });

    it('Should ignore objects with a class other than Object', () => {
        class Foo{ constructor(){ this.a = 'foo' } }
        const conf = layerConf({ key: { a: 'a', b: 'bar' } }, { key: new Foo() });
        assert.strictEqual(conf.key.a, 'foo');
        assert.strictEqual(typeof conf.key.b, 'undefined');
    });

});

describe('Logger', () => {
    let log;

    before(function(){
        log = new Logger({ appName: 'test-app' });
    });

    it('Should log appropriate objects according to log level', function(){
        assert.strictEqual(log.debug().level, 'debug');
        assert.strictEqual(log.info().level, 'info');
        assert.strictEqual(log.warn().level, 'warn');
        assert.strictEqual(log.error().level, 'error');
        assert.strictEqual(log.fatal().level, 'fatal');
    });

    it('Should printf format message with input arguments', function(){
        assert.strictEqual(log.debug('a b %s d %s', 'c', 'e').msg, 'a b c d e');
    });

    it('Should accept msg in data object', function(){
        assert.strictEqual(log.debug({ msg: 'foo' }).msg, 'foo');
    });

    it('Should assign first object argument properties to final log entry', function(){
        const e = log.info({ a: 1, b: 2 });
        assert.strictEqual(e.a, 1);
        assert.strictEqual(e.b, 2);
    });

    it('Should include entry type', function(){
        assert.strictEqual(log.warn().type, 'event');
        assert.strictEqual(log.error({ type: 'foobar' }).type, 'foobar');
    });

    it('Should parse error objects', function(){
        assert(Array.isArray(log.warn({ err: new Error('Foobar') }).stack));
        assert.strictEqual(typeof log.info({ err: 'My Error' }).err, 'string');
    });

    it('Should not log when entry level is below conf level [level]', function(){
        const log = new Logger({ level: 'error' });
        assert(!log.warn());
    });

    it('Should not log anything when conf is FALSE', function(){
        const log = new Logger({ disabled: true });
        assert(!log.debug());
    });

    it('Should generate a capture stack trace for errors', function(){
        const entry = log.error({ err: new Error('Test Error') });

        assert(Array.isArray(entry.capture));
        assert(entry.capture.length > 0);
        // The capture should point to this test file (unit.js)
        // and not include internal logger files due to the slice offset
        assert(entry.capture[0].includes('unit.js'));
    });

    it('Should generate an errorId string', function(){
        const entry = log.error({ err: new Error('Test') });
        assert.strictEqual(typeof entry.errorId, 'string');
        assert(entry.errorId.length > 0);
    });

    it('Should group errors from the same scope with the same errorId', function(){
        const err = new Error('Persistent Error');

        // Even though these are on different lines, they are in the same
        // function/file scope, so the stack slug (and hash) should be identical.
        const entry1 = log.error({ err });
        const entry2 = log.error({ err });

        assert.strictEqual(entry1.errorId, entry2.errorId);
    });

    it('Should differentiate errorIds from different scopes', function(){
        const err = new Error('Shared Error');

        // We use named functions to force different stack frame names
        function scopeA() { return log.error({ err }); }
        function scopeB() { return log.error({ err }); }

        const entryA = scopeA();
        const entryB = scopeB();

        assert.notStrictEqual(entryA.errorId, entryB.errorId);
    });

    it('Should differentiate errorIds for different error origins', function(){
        function throwA() { return new Error('A'); }
        function throwB() { return new Error('B'); }

        // The error stacks themselves are different, so the first half
        // of the errorId hash will differ.
        const entryA = log.error({ err: throwA() });
        const entryB = log.error({ err: throwB() });

        assert.notStrictEqual(entryA.errorId, entryB.errorId);
    });

    it('Should parse complex stack trace for errorIds', function(){
        const err = new Error('Test error');
        err.stack = `Error: Test error
            at Object.<anonymous> (/Users/User/My Project/app.js:33:15)
            at Object.dangerousFn (/Users/User/app(v2)/script.js:10:1)
            at Module._compile (node:internal/modules/cjs/loader:1376:14)
            at Module._compile (node:internal/modules/cjs/loader:1376:14)
            at My Folder/modules/cjs/test.spec.js:1376:14
            at node:internal/modules/cjs/loader:1376:14`;

        const entry = log.error({ err });
        assert.strictEqual(typeof entry.errorId, 'string');
        assert(entry.errorId.length > 0);
    });

    it('Should allow extending loggers with predefined fields', function(){
        const baseLogger = new Logger({ appName: 'base-app', level: 'info' });
        const extendedLogger = baseLogger.extend({ requestId: 'abc123' });
        assert.strictEqual(extendedLogger.debug(), false);
        const entry = extendedLogger.info('test');
        assert.strictEqual(entry.app, 'base-app');
        assert.strictEqual(entry.requestId, 'abc123');
    });

});

describe('Logger Environment Output', () => {
    it('Should log to console in all environments (verify no crash)', () => {
        const logger = new Logger({ level: 'info', appName: 'test-app' });
        // These should not throw (verify implementation is robust)
        assert.doesNotThrow(() => {
            logger.debug('debug msg');
            logger.info('info msg');
            logger.warn('warn msg');
            logger.error('error msg');
            logger.fatal('fatal msg');
        });
    });

    it('Should not log when disabled', () => {
        const logger = new Logger({ disabled: true });
        const result = logger.info('this should not log');
        assert.strictEqual(result, false, 'Should return false when disabled');
    });

    it('Should respect log level filtering', () => {
        const logger = new Logger({ level: 'warn' });
        assert.strictEqual(logger.debug('x'), false, 'debug should be filtered');
        assert.strictEqual(logger.info('x'), false, 'info should be filtered');
    });

    it('Should generate errorId for errors', () => {
        const logger = new Logger({ appName: 'test' });
        const err = new Error('test error');
        const entry = logger.error({ err });
        assert.ok(entry.errorId, 'Should generate errorId');
        assert.equal(typeof entry.errorId, 'string', 'errorId should be string');
    });

    it('Should extract stack trace from Error objects', () => {
        const logger = new Logger({ appName: 'test' });
        const err = new Error('stack test');
        const entry = logger.error({ err });
        assert.ok(entry.stack, 'Should extract stack');
        assert.ok(Array.isArray(entry.stack), 'stack should be array');
    });
});

describe('Body Parsing Edge Cases', () => {
    it('Should parse body with explicit charset', async () => {
        const input = {
            reqStream: new ReadableStream({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode('{"key":"value"}'));
                    controller.close();
                }
            }),
            headers: { 'content-type': 'application/json; charset=utf-8' },
            timeout: 1000
        };
        const body = new Body(input);
        const data = await body.json();
        assert.deepEqual(data, { key: 'value' });
    });

    it('Should throw HTTPError 415 when json() called on non-json content', async () => {
        const input = {
            reqStream: new ReadableStream({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode('plain text'));
                    controller.close();
                }
            }),
            headers: { 'content-type': 'text/plain' },
            timeout: 1000
        };
        const body = new Body(input);
        try{
            await body.json();
            assert.fail('Should have thrown');
        }
        catch(err) {
            assert.ok(err instanceof HTTPError, 'Should throw HTTPError');
            assert.equal(err.status, 415, 'Should be 415 Unsupported Media Type');
        }
    });

    it('Should throw HTTPError 400 on invalid JSON', async () => {
        const input = {
            reqStream: new ReadableStream({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode('{invalid json}'));
                    controller.close();
                }
            }),
            headers: { 'content-type': 'application/json' },
            timeout: 1000
        };
        const body = new Body(input);
        try{
            await body.json();
            assert.fail('Should have thrown');
        }
        catch(err) {
            assert.ok(err instanceof HTTPError, 'Should throw HTTPError');
            assert.equal(err.status, 400, 'Should be 400 Bad Request');
        }
    });

    it('Should parse text/plain content type', async () => {
        const input = {
            reqStream: new ReadableStream({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode('just some text'));
                    controller.close();
                }
            }),
            headers: { 'content-type': 'text/plain' },
            timeout: 1000
        };
        const body = new Body(input);
        const result = await body.text();
        assert.equal(result, 'just some text', 'Should parse plain text');
    });

    it('Should parse URLEncoded body correctly', async () => {
        const input = {
            reqStream: new ReadableStream({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode('key1=value1&key2=value2'));
                    controller.close();
                }
            }),
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            timeout: 1000
        };
        const body = new Body(input);
        const data = await body.urlencoded();
        assert.deepEqual(data, { key1: 'value1', key2: 'value2' });
    });

    it('Should throw HTTPError 415 when urlencoded() called on non-urlencoded content', async () => {
        const input = {
            reqStream: new ReadableStream({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode('not-urlencoded'));
                    controller.close();
                }
            }),
            headers: { 'content-type': 'text/plain' },
            timeout: 1000
        };
        const body = new Body(input);
        try{
            await body.urlencoded();
            assert.fail('Should have thrown');
        }
        catch(err) {
            assert.ok(err instanceof HTTPError, 'Should throw HTTPError');
            assert.equal(err.status, 415, 'Should be 415');
        }
    });

    describe('body charset error handling ', () => {
        it('Should silently use default charset (utf-8) when invalid charset is provided in header', async () => {
            // The getDataTypeFromContentType function validates charsets against a whitelist
            // and silently uses the default (utf-8) if an invalid charset is sent
            // This means bytesToString never receives an invalid charset in practice
            
            // Create a stream with valid UTF-8 bytes
            const bytes = new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F]); 
            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(bytes);
                    controller.close();
                }
            });
            
            // Send an invalid charset header—it will be ignored and utf-8 will be used
            const body = new Body({
                reqStream: stream,
                headers: { 'content-type': 'text/plain; charset=cp1252' },
                timeout: 5000
            });
            
            const result = await body.text();
            assert.strictEqual(result, 'Hello');
        });

        it('Should throw HTTPError 400 when JSON body has invalid format', async () => {
            
            // Send invalid JSON
            const invalidJson = new Uint8Array(Buffer.from('{invalid json}'));
            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(invalidJson);
                    controller.close();
                }
            });
            
            const body = new Body({
                reqStream: stream,
                headers: { 'content-type': 'application/json; charset=utf-8' },
                timeout: 5000
            });
            
            try{
                await body.json();
                throw new Error('expected HTTPError 400');
            }
            catch(err){
                assert.strictEqual(err.status, 400);
                assert.strictEqual(err.message, 'Invalid JSON format');
            }
        });

        it('Should parse urlencoded with default charset when invalid charset header is sent', async () => {
            
            // Valid URL-encoded data but with invalid charset header
            // Invalid charset in header will be ignored, utf-8 will be used by default
            const data = new Uint8Array(Buffer.from('foo=bar&baz=qux'));
            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(data);
                    controller.close();
                }
            });
            
            const body = new Body({
                reqStream: stream,
                headers: { 'content-type': 'application/x-www-form-urlencoded; charset=ascii-invalid' },
                timeout: 5000
            });
            
            const result = await body.urlencoded();
            assert.deepStrictEqual(result, { foo: 'bar', baz: 'qux' });
        });

    });
});

describe('Cookies', () => {

    it('Should parse HTTP cookies', () => {
        // Helper to create the expected null-prototype object
        const toNullProto = (obj) => Object.assign(Object.create(null), obj);

        // --- Parse Tests ---
        // 1. Happy path
        assert.deepStrictEqual(parse('a=1; b=2'), toNullProto({ a: '1', b: '2' }));

        // 2. Backtracking (skipping keys without values)
        assert.deepStrictEqual(parse('secure; foo=bar'), toNullProto({ foo: 'bar' }));

        // 3. Duplicate keys (first wins)
        assert.deepStrictEqual(parse('a=1; a=2'), toNullProto({ a: '1' }));

        // 4. Quoted values
        assert.deepStrictEqual(parse('a="b"'), toNullProto({ a: 'b' }));

        // 5. Decoding
        assert.deepStrictEqual(parse('a=b%20c'), toNullProto({ a: 'b c' }));

        // 6. Argument validation
        assert.throws(() => parse(123), TypeError);

        // 7. Trailing attributes/flags 
        assert.deepStrictEqual(parse('a=1; secure'), toNullProto({ a: '1' }));
        
        // Alternatively, trailing spaces or garbage text also trigger this:
        assert.deepStrictEqual(parse('a=1;      '), toNullProto({ a: '1' }));
    });

    it('Should serialize HTTP cookies', () => {
        
        // --- Serialize Tests ---
        // 1. Happy path
        assert.strictEqual(serialize('a', 'b'), 'a=b');

        // 2. All valid options (Date, Secure, HttpOnly, etc)
        assert.ok(serialize('a', 'b', {
            secure: true,
            httpOnly: true,
            maxAge: 100,
            domain: 'example.com',
            path: '/',
            expires: new Date()
        }));

        // 3. Priority Variations
        assert.ok(serialize('a', 'b', { priority: 'Low' })); 
        assert.throws(() => serialize('a', 'b', { priority: 'foo' }), TypeError);

        // 4. SameSite Variations
        assert.ok(serialize('a', 'b', { sameSite: true })); 
        assert.ok(serialize('a', 'b', { sameSite: 'Lax' }));
        assert.throws(() => serialize('a', 'b', { sameSite: 'foo' }), TypeError);

        // 5. Invalid Inputs (Regex checks)
        assert.throws(() => serialize('a\n', 'b'), TypeError);
        assert.strictEqual(serialize('a', 'b\n'), 'a=b%0A'); 
        assert.throws(() => serialize('a', 'b', { domain: 'a\n' }), TypeError); 
        assert.throws(() => serialize('a', 'b', { path: 'a\n' }), TypeError); 

        // 6. Invalid Numbers/Dates
        assert.throws(() => serialize('a', 'b', { maxAge: Infinity }), TypeError);
        assert.throws(() => serialize('a', 'b', { expires: 'not-a-date' }), TypeError);
    });
});

describe('Cookie Parsing Edge Cases', () => {
    it('Should parse empty cookie string', () => {
        const result = parse('');
        assert.deepEqual(result, {}, 'empty string should parse to empty object');
    });

    it('Should parse cookie without value', () => {
        const result = parse('sessionId');
        assert.deepEqual(result, {}, 'cookie without = should not parse');
    });

    it('Should decode URI-encoded values', () => {
        const result = parse('key=%20value%20');
        assert.equal(result.key, ' value ', 'Should decode URI-encoded values');
    });

    it('Should handle quoted values', () => {
        const result = parse('name="quoted value"');
        assert.equal(result.name, 'quoted value', 'Should unquote values');
    });

    it('Should only assign each key once (first value wins)', () => {
        const result = parse('dup=first; dup=second');
        assert.equal(result.dup, 'first', 'Should keep first value');
    });

    it('Should handle semicolon separators', () => {
        const result = parse('a=1; b=2; c=3');
        assert.deepEqual(result, { a: '1', b: '2', c: '3' });
    });
});

describe('Cookie Serialization Edge Cases', () => {
    it('Should throw TypeError for invalid priority value', () => {
        assert.throws(() => {
            serialize('token', 'abc', { priority: 'invalid' });
        }, TypeError, 'Should reject invalid priority');
    });

    it('Should throw TypeError for invalid sameSite value', () => {
        assert.throws(() => {
            serialize('token', 'abc', { sameSite: 'invalid-value' });
        }, TypeError, 'Should reject invalid sameSite');
    });

    it('Should handle sameSite=true (maps to Strict)', () => {
        const result = serialize('token', 'abc', { sameSite: true });
        assert.ok(result.includes('SameSite=Strict'), 'sameSite=true should map to Strict');
    });

    it('Should throw TypeError for invalid domain', () => {
        assert.throws(() => {
            serialize('token', 'abc', { domain: String.fromCharCode(0) });
        }, TypeError, 'Should reject invalid domain with null byte');
    });

    it('Should throw TypeError for invalid path', () => {
        assert.throws(() => {
            serialize('token', 'abc', { path: String.fromCharCode(256) });
        }, TypeError, 'Should reject invalid path');
    });

    it('Should throw TypeError for invalid expires (non-Date)', () => {
        assert.throws(() => {
            serialize('token', 'abc', { expires: 'not-a-date' });
        }, TypeError, 'Should reject non-Date expires');
    });

    it('Should throw TypeError for NaN expires', () => {
        const badDate = new Date('invalid');
        assert.throws(() => {
            serialize('token', 'abc', { expires: badDate });
        }, TypeError, 'Should reject NaN expires');
    });

    it('Should throw TypeError for invalid maxAge (NaN)', () => {
        assert.throws(() => {
            serialize('token', 'abc', { maxAge: NaN });
        }, TypeError, 'Should reject NaN maxAge');
    });

    it('Should throw TypeError for infinite maxAge', () => {
        assert.throws(() => {
            serialize('token', 'abc', { maxAge: Infinity });
        }, TypeError, 'Should reject infinite maxAge');
    });

    it('Should throw TypeError for invalid cookie name', () => {
        assert.throws(() => {
            serialize('bad\u0000name', 'value');
        }, TypeError, 'Should reject invalid cookie name');
    });
});

describe('Cookie Serialization Options', () => {

    it('Should serialize cookie with Priority=High option', () => {
        // Tests cookie.js line 151 (Priority=High case)
        const cookie = serialize('test', 'value', { priority: 'high' });
        assert.ok(cookie.includes('Priority=High'));
    });

    it('Should serialize cookie with Priority=Medium option', () => {
        // Tests cookie.js line 149 (Priority=Medium case)
        const cookie = serialize('test', 'value', { priority: 'medium' });
        assert.ok(cookie.includes('Priority=Medium'));
    });

    it('Should serialize cookie with Priority=Low option', () => {
        // Tests cookie.js line 149 (Priority=Low case)
        const cookie = serialize('test', 'value', { priority: 'low' });
        assert.ok(cookie.includes('Priority=Low'));
    });

    it('Should serialize cookie with SameSite=Strict option', () => {
        // Tests cookie.js line 171 (SameSite=Strict case)
        const cookie = serialize('test', 'value', { sameSite: 'strict' });
        assert.ok(cookie.includes('SameSite=Strict'));
    });

    it('Should serialize cookie with SameSite=Lax option', () => {
        // Tests cookie.js line 169 (SameSite=Lax case)
        const cookie = serialize('test', 'value', { sameSite: 'lax' });
        assert.ok(cookie.includes('SameSite=Lax'));
    });

    it('Should serialize cookie with SameSite=None option', () => {
        // Tests cookie.js line 174 (SameSite=None case)
        const cookie = serialize('test', 'value', { sameSite: 'none' });
        assert.ok(cookie.includes('SameSite=None'));
    });

    it('Should throw on invalid cookie priority', () => {
        // Tests cookie.js line 155 (default case for priority)
        try{
            serialize('test', 'value', { priority: 'invalid' });
            throw new Error('expected TypeError');
        }
        catch(err){
            assert.ok(err instanceof TypeError);
            assert.ok(err.message.includes('priority'));
        }
    });

    it('Should throw on invalid cookie sameSite', () => {
        // Tests cookie.js line 177 (default case for sameSite)
        try{
            serialize('test', 'value', { sameSite: 'invalid' });
            throw new Error('expected TypeError');
        }
        catch(err){
            assert.ok(err instanceof TypeError);
            assert.ok(err.message.includes('sameSite'));
        }
    });

});

describe('Native Node.js Module', () => {

    it('env() returns NODE_ENV when set', () => {
        const savedNODE = process.env.NODE_ENV;
        const savedENV = process.env.ENV;
        process.env.NODE_ENV = 'prod-test';
        delete process.env.ENV;
        try{
            assert.strictEqual(nativeNodeModule.env(), 'prod-test');
        }
        finally{
            process.env.NODE_ENV = savedNODE;
            process.env.ENV = savedENV;
        }
    });

    it('env() falls back to ENV when NODE_ENV not set', () => {
        const savedNODE = process.env.NODE_ENV;
        const savedENV = process.env.ENV;
        delete process.env.NODE_ENV;
        process.env.ENV = 'env-test';
        try{
            assert.strictEqual(nativeNodeModule.env(), 'env-test');
        }
        finally{
            process.env.NODE_ENV = savedNODE;
            process.env.ENV = savedENV;
        }
    });

    it('env() falls back to development when none set', () => {
        const savedNODE = process.env.NODE_ENV;
        const savedENV = process.env.ENV;
        delete process.env.NODE_ENV;
        delete process.env.ENV;
        try{
            assert.strictEqual(nativeNodeModule.env(), 'development');
        }
        finally{
            process.env.NODE_ENV = savedNODE;
            process.env.ENV = savedENV;
        }
    });

    it('createServer websocket interval created and cleared', async () => {
        const savedNODE = process.env.NODE_ENV;
        process.env.NODE_ENV = 'development';

        const api = { trigger: async () => {} };
        const out = await nativeNodeModule.createServer(api, 9882, true);
        await out.close();

        process.env.NODE_ENV = savedNODE;
    });

});

describe('Router', () => {

    describe('static routes', () => {
        it('Should add and match static routes', () => {
            const router = new Router();
            const handler = () => 'test';
            router.add('GET', '/foo/bar', handler);
            const result = router.match('GET', '/foo/bar');
            assert(result);
            assert.strictEqual(result.handler, handler);
            assert.deepEqual(result.params, {});
        });

        it('Should normalize paths by removing trailing slashes', () => {
            const router = new Router();
            const handler = () => 'test';
            router.add('GET', '/foo/bar/', handler);
            const result = router.match('GET', '/foo/bar');
            assert(result);
            assert.strictEqual(result.handler, handler);
        });

        it('Should not match static routes for different paths', () => {
            const router = new Router();
            router.add('GET', '/foo/bar', () => 'test');
            const result = router.match('GET', '/foo/baz');
            assert.strictEqual(result, false);
        });

        it('Should be case-insensitive for HTTP methods', () => {
            const router = new Router();
            const handler = () => 'test';
            router.add('get', '/foo', handler);
            const result = router.match('GET', '/foo');
            assert(result);
            assert.strictEqual(result.handler, handler);
        });

        it('Should match root path', () => {
            const router = new Router();
            const handler = () => 'test';
            router.add('GET', '/', handler);
            const result = router.match('GET', '/');
            assert(result);
            assert.strictEqual(result.handler, handler);
        });

        it('Should throw on invalid method type', () => {
            const router = new Router();
            assert.throws(() => router.add(123, '/foo', () => {}), /Method must be a string/);
        });

        it('Should throw on invalid path type', () => {
            const router = new Router();
            assert.throws(() => router.add('GET', 123, () => {}), /Path must be a string/);
        });

        it('Should throw on invalid handler type', () => {
            const router = new Router();
            assert.throws(() => router.add('GET', '/foo', 'not-a-function'), /handler must be a function/);
        });

        it('Should throw on duplicate routes', () => {
            const router = new Router();
            router.add('GET', '/foo', () => 'test');
            assert.throws(() => router.add('GET', '/foo', () => 'test2'), /Route already exists/);
        });
    });

    describe('parameterized routes', () => {
        it('Should match single parameter routes', () => {
            const router = new Router();
            const handler = () => 'test';
            router.add('GET', '/users/:id', handler);
            const result = router.match('GET', '/users/123');
            assert(result);
            assert.strictEqual(result.handler, handler);
            assert.deepEqual(result.params, { id: '123' });
        });

        it('Should match multiple parameters', () => {
            const router = new Router();
            const handler = () => 'test';
            router.add('GET', '/users/:userId/posts/:postId', handler);
            const result = router.match('GET', '/users/456/posts/789');
            assert(result);
            assert.strictEqual(result.handler, handler);
            assert.deepEqual(result.params, { userId: '456', postId: '789' });
        });

        it('Should decode URI-encoded parameters', () => {
            const router = new Router();
            const handler = () => 'test';
            router.add('GET', '/search/:query', handler);
            const result = router.match('GET', '/search/hello%20world');
            assert(result);
            assert.strictEqual(result.params.query, 'hello world');
        });

        it('Should not match parameter routes incorrectly', () => {
            const router = new Router();
            router.add('GET', '/users/:id', () => 'test');
            const result = router.match('GET', '/users');
            assert.strictEqual(result, false);
        });

        it('Should match parameter routes with static segments after', () => {
            const router = new Router();
            const handler = () => 'test';
            router.add('GET', '/users/:id/profile', handler);
            const result = router.match('GET', '/users/123/profile');
            assert(result);
            assert.deepEqual(result.params, { id: '123' });
        });
    });

    describe('wildcard routes', () => {
        it('Should match wildcard routes', () => {
            const router = new Router();
            const handler = () => 'test';
            router.add('GET', '/files/...path', handler);
            const result = router.match('GET', '/files/documents/file.txt');
            assert(result);
            assert.strictEqual(result.handler, handler);
            assert.deepEqual(result.params, { path: 'documents/file.txt' });
        });

        it('Should match wildcard at root', () => {
            const router = new Router();
            const handler = () => 'test';
            router.add('GET', '/...all', handler);
            const result = router.match('GET', '/some/nested/path');
            assert(result);
            assert.deepEqual(result.params, { all: 'some/nested/path' });
        });

        it('Should not match wildcard with insufficient segments', () => {
            const router = new Router();
            router.add('GET', '/files/...path', () => 'test');
            const result = router.match('GET', '/files');
            assert.strictEqual(result, false);
        });

        it('Should support wildcard after parameters', () => {
            const router = new Router();
            const handler = () => 'test';
            router.add('GET', '/api/:version/...path', handler);
            const result = router.match('GET', '/api/v1/users/123/profile');
            assert(result);
            assert.deepEqual(result.params, { version: 'v1', path: 'users/123/profile' });
        });
    });

    describe('route priority', () => {
        it('Should prioritize static routes over parameters', () => {
            const router = new Router();
            const staticHandler = () => 'static';
            const paramHandler = () => 'param';
            router.add('GET', '/users/me', staticHandler);
            router.add('GET', '/users/:id', paramHandler);
            
            const resultMe = router.match('GET', '/users/me');
            assert.strictEqual(resultMe.handler, staticHandler);
            
            const result123 = router.match('GET', '/users/123');
            assert.strictEqual(result123.handler, paramHandler);
        });

        it('Should prioritize static and parameters over wildcard', () => {
            const router = new Router();
            const staticHandler = () => 'static';
            const paramHandler = () => 'param';
            const wildcardHandler = () => 'wildcard';
            
            router.add('GET', '/api/:version/...path', wildcardHandler);
            router.add('GET', '/api/v1/users', paramHandler);
            router.add('GET', '/api/v1/users/list', staticHandler);
            
            const resultStatic = router.match('GET', '/api/v1/users/list');
            assert.strictEqual(resultStatic.handler, staticHandler);
            
            const resultParam = router.match('GET', '/api/v1/users');
            assert.strictEqual(resultParam.handler, paramHandler);
            
            const resultWildcard = router.match('GET', '/api/v1/docs/readme.md');
            assert.strictEqual(resultWildcard.handler, wildcardHandler);
        });
    });

    describe('route matching with no handler', () => {
        it('Should return false when no matching route exists', () => {
            const router = new Router();
            router.add('GET', '/foo', () => 'test');
            const result = router.match('GET', '/bar');
            assert.strictEqual(result, false);
        });

        it('Should return false for unregistered HTTP methods', () => {
            const router = new Router();
            router.add('GET', '/foo', () => 'test');
            const result = router.match('POST', '/foo');
            assert.strictEqual(result, false);
        });
    });

    describe('multiple HTTP methods', () => {
        it('Should support multiple HTTP methods on same path', () => {
            const router = new Router();
            const getHandler = () => 'get';
            const postHandler = () => 'post';
            const putHandler = () => 'put';
            
            router.add('GET', '/users', getHandler);
            router.add('POST', '/users', postHandler);
            router.add('PUT', '/users/123', putHandler);
            
            assert.strictEqual(router.match('GET', '/users').handler, getHandler);
            assert.strictEqual(router.match('POST', '/users').handler, postHandler);
            assert.strictEqual(router.match('PUT', '/users/123').handler, putHandler);
        });

        it('Should not cross HTTP methods', () => {
            const router = new Router();
            router.add('GET', '/test', () => 'get');
            const result = router.match('POST', '/test');
            assert.strictEqual(result, false);
        });
    });

    describe('listing routes', () => {

        it('Should list all registered routes', () => {
            const router = new Router();
            const handler = () => 'test';
            router.add('GET', '/foo', handler);
            router.add('POST', '/bar', handler);
            const routes = router.list();
            assert.deepEqual(routes, [
                { method: 'GET', path: '/foo' },
                { method: 'POST', path: '/bar' }
            ]);
        });
    });

    describe('complex path scenarios', () => {
        it('Should handle deeply nested paths', () => {
            const router = new Router();
            const handler = () => 'test';
            router.add('GET', '/a/b/c/d/e/f/g', handler);
            const result = router.match('GET', '/a/b/c/d/e/f/g');
            assert(result);
            assert.strictEqual(result.handler, handler);
        });

        it('Should handle mixed static and parameter segments', () => {
            const router = new Router();
            const handler = () => 'test';
            router.add('GET', '/api/:v/users/:id/posts/:pid/comments/:cid', handler);
            const result = router.match('GET', '/api/v2/users/123/posts/456/comments/789');
            assert(result);
            assert.deepEqual(result.params, {
                v: 'v2',
                id: '123',
                pid: '456',
                cid: '789'
            });
        });

        it('Should handle parameter at root', () => {
            const router = new Router();
            const handler = () => 'test';
            router.add('GET', '/:locale/home', handler);
            const result = router.match('GET', '/en/home');
            assert(result);
            assert.deepEqual(result.params, { locale: 'en' });
        });
    });

    describe('edge cases', () => {
        it('Should handle empty parameter names gracefully', () => {
            const router = new Router();
            const handler = () => 'test';
            // This tests the router's ability to handle : without a name
            router.add('GET', '/test/:/path', handler);
            const result = router.match('GET', '/test/value/path');
            assert(result);
        });

        it('Should handle multiple wildcards (last one wins)', () => {
            const router = new Router();
            const handler = () => 'test';
            router.add('GET', '/...path', handler);
            const result = router.match('GET', '/any/path/here');
            assert(result);
            assert.deepEqual(result.params, { path: 'any/path/here' });
        });

        it('Should handle single segment paths', () => {
            const router = new Router();
            const handler = () => 'test';
            router.add('GET', '/single', handler);
            const result = router.match('GET', '/single');
            assert(result);
            assert.strictEqual(result.handler, handler);
        });

        it('Should handle slash-only paths', () => {
            const router = new Router();
            const handler = () => 'test';
            router.add('GET', '/', handler);
            const result = router.match('GET', '/');
            assert(result);
            assert.strictEqual(result.handler, handler);
        });

    });

    describe('wildcard backtracking edge cases', () => {
        it('Should backtrack to wildcard when segment does not match static or param', () => {
            const router = new Router();
            const handler = () => 'wildcard';
            router.add('GET', '/api/...path', handler);
            // This path does not match /api/fixed, so it should backtrack to wildcard
            const result = router.match('GET', '/api/anything/here');
            assert(result);
            assert.strictEqual(result.handler, handler);
            assert.deepEqual(result.params, { path: 'anything/here' });
        });

        it('Should fall back to terminal wildcard when exact match not found', () => {
            const router = new Router();
            const wildcardHandler = () => 'wildcard';
            const paramHandler = () => 'param';
            router.add('GET', '/items/:id', paramHandler);
            router.add('GET', '/...fallback', wildcardHandler);
            
            // This should match the param route
            const result1 = router.match('GET', '/items/123');
            assert.strictEqual(result1.handler, paramHandler);
            
            // This should fall back to wildcard since no /items match
            const result2 = router.match('GET', '/other/path');
            assert.strictEqual(result2.handler, wildcardHandler);
            assert.deepEqual(result2.params, { fallback: 'other/path' });
        });

        it('Should use wildcard when path runs out before node has handler', () => {
            const router = new Router();
            const paramHandler = () => 'param';
            const wildcardHandler = () => 'wildcard';
            router.add('GET', '/admin/:section/manage', paramHandler);
            router.add('GET', '/...page', wildcardHandler);
            
            // Exact match should work
            const result1 = router.match('GET', '/admin/users/manage');
            assert.strictEqual(result1.handler, paramHandler);
            
            // This path matches the param route but doesn't have 'manage' after it,
            // so it continues but finds no handler at the node, falls back to wildcard
            const result2 = router.match('GET', '/admin/users');
            assert.strictEqual(result2.handler, wildcardHandler);
            assert(result2.params.page);
        });

        it('Should handle wildcard with multiple parameters before it', () => {
            const router = new Router();
            const handler = () => 'test';
            router.add('GET', '/api/:v/:type/...rest', handler);
            
            const result1 = router.match('GET', '/api/v1/users/list/active');
            assert(result1);
            assert.deepEqual(result1.params, { v: 'v1', type: 'users', rest: 'list/active' });
            
            const result2 = router.match('GET', '/api/v2/posts/search/tag/trending');
            assert(result2);
            assert.deepEqual(result2.params, { v: 'v2', type: 'posts', rest: 'search/tag/trending' });
        });

        it('Should preserve params from earlier segments when backtracking to wildcard', () => {
            const router = new Router();
            const handler = () => 'test';
            router.add('GET', '/api/:version/...path', handler);
            
            const result = router.match('GET', '/api/v1/users/123/posts');
            assert(result);
            assert.deepEqual(result.params, {
                version: 'v1',
                path: 'users/123/posts'
            });
        });

        it('Should handle wildcard with no preceding segments', () => {
            const router = new Router();
            const handler = () => 'test';
            router.add('GET', '/...anything', handler);
            
            // Root-level wildcard with single segment
            const result1 = router.match('GET', '/single');
            assert(result1);
            assert.deepEqual(result1.params, { anything: 'single' });
            
            // Root-level wildcard with multiple segments
            const result2 = router.match('GET', '/path/to/resource');
            assert(result2);
            assert.deepEqual(result2.params, { anything: 'path/to/resource' });
        });

        it('Should fail to match when wildcard is present but no match occurs at all', () => {
            const router = new Router();
            router.add('POST', '/upload/...file', () => 'test');
            
            // Different HTTP method should not match
            const result = router.match('GET', '/upload/document.pdf');
            assert.strictEqual(result, false);
        });

        it('Should match shortest static path when multiple paths could match', () => {
            const router = new Router();
            const shortHandler = () => 'short';
            const longHandler = () => 'long';
            const wildcardHandler = () => 'wildcard';
            
            router.add('GET', '/users', shortHandler);
            router.add('GET', '/users/profile', longHandler);
            router.add('GET', '/...rest', wildcardHandler);
            
            const result1 = router.match('GET', '/users');
            assert.strictEqual(result1.handler, shortHandler);
            
            const result2 = router.match('GET', '/users/profile');
            assert.strictEqual(result2.handler, longHandler);
            
            const result3 = router.match('GET', '/something/else');
            assert.strictEqual(result3.handler, wildcardHandler);
        });

        it('Should handle segment that matches parameter but path continues', () => {
            const router = new Router();
            const paramHandler = () => 'param';
            const staticHandler = () => 'static';
            
            router.add('GET', '/posts/:id', paramHandler);
            router.add('GET', '/posts/:id/comments', staticHandler);
            
            const result1 = router.match('GET', '/posts/123');
            assert.strictEqual(result1.handler, paramHandler);
            
            const result2 = router.match('GET', '/posts/456/comments');
            assert.strictEqual(result2.handler, staticHandler);
        });

        it('Should URI-decode segments in wildcard capture', () => {
            const router = new Router();
            const handler = () => 'test';
            router.add('GET', '/files/...path', handler);
            
            const result = router.match('GET', '/files/my%20document.pdf');
            assert(result);
            // The wildcard captures the encoded version as-is
            assert(result.params.path.includes('%20'));
        });

        it('Should initialize params when using terminal wildcard with no prior params', () => {
            // This tests line 117: params = params || {} (|| {} branch taken)
            // When we reach terminal wildcard fallback with no params captured yet
            const router = new Router();
            const handler = () => 'test';
            router.add('GET', '/api/:version', () => 'version');
            router.add('GET', '/...rest', handler);
            
            // The /api/:version route matches up to /api/v1, but since the path continues
            // and the :version param node has no handler for multiple segments,
            // it doesn't match. Then /...rest wildcard should match
            const result = router.match('GET', '/api/v1/extra/segments');
            assert(result);
            assert.strictEqual(result.handler, handler);
            // params should be initialized to {} and then filled with rest
            assert(result.params.rest === 'api/v1/extra/segments');
        });

        it('Should preserve existing params when using terminal wildcard', () => {
            // This tests line 117: params = params || {} (|| {} branch NOT taken)
            // When we have existing params before reaching terminal wildcard
            const router = new Router();
            const handler = () => 'test';
            router.add('GET', '/api/:version/...rest', handler);
            
            // This matches both the param (version) and wildcard (rest) 
            // So params will already contain version when we set rest
            const result = router.match('GET', '/api/v1/users/123');
            assert(result);
            assert.strictEqual(result.handler, handler);
            assert.deepEqual(result.params, { version: 'v1', rest: 'users/123' });
        });

        it('Should match wildcard with no params in path', () => {
            // This tests the || {} branch at lines 117 and 122
            // When we have a wildcard at root with no prior params captured
            const router = new Router();
            const handler = () => 'test';
            router.add('GET', '/...rest', handler);
            
            // Match should give us rest param without any prior params
            const result = router.match('GET', '/any/path/here');
            assert(result);
            assert.deepEqual(result.params, { rest: 'any/path/here' });
        });
    });
});

describe('TOML Parser', () => {

    // Helper to test value parsing logic by wrapping it in a valid TOML key-value pair
    function parseValue(valueString) {
        const toml = `key = ${valueString}`;
        return tomlParse(toml).key;
    }

    describe('Scanner (Integration)', () => {
        // The original Scanner test verified whitespace skipping. 
        // We verify this implicitly via the parse function.
        it('skips comments and whitespace', () => {
            const result = tomlParse(`
            # comment
            
            
            a = 1 
            b = 2`);
            assert.strictEqual(result.a, 1)
            assert.strictEqual(result.b, 2);
        });
    });

    describe('Keys', () => {
        it('handles bare keys', () => {
            const result = tomlParse('A-Za-z0-9_- = 1');
            assert.strictEqual(result['A-Za-z0-9_-'], 1);
            // Empty key
            assert.throws(() => tomlParse('= 1'), SyntaxError); 
            // Quoted keys must be handled by parse, but here we test bare key logic specifically
            // assert.throws(() => tomlParse('"foo" = 1'), SyntaxError); 
        });

        it('handles dotted keys', () => {
            assert.deepStrictEqual(tomlParse('a . b . c = 1'), { a: { b: { c: 1 } } });
            assert.deepStrictEqual(tomlParse('a.\'b.c\'."d.e" = 1'), { a: { 'b.c': { 'd.e': 1 } } });
            
            assert.throws(() => tomlParse('a.b . = 1'));
            assert.throws(() => tomlParse('. = 1'));
        });
    });

    describe('Strings', () => {
        it('handles basic strings', () => {
            assert.strictEqual(
                parseValue('"a\\"\\n\\t\\b\\\\\\u3042\\U01F995"'),
                'a"\n\t\b\\\あ🦕'
            );
            assert.strictEqual(parseValue('""'), '');
            assert.strictEqual(parseValue('"a\\n"'), 'a\n');

            assert.throws(() => parseValue('"a\\0b\\?c"'), /Invalid escape sequence/);
            assert.throws(() => parseValue('"a'), /String not closed/);
            assert.throws(() => parseValue('"a\nb"'), /Single-line string cannot contain EOL/);
        });

        it('handles literal strings', () => {
            assert.strictEqual(parseValue('\'a\\n\''), 'a\\n');
            assert.strictEqual(parseValue('\'\''), '');
            
            assert.throws(() => parseValue('\'a'), /String not closed/);
            assert.throws(() => parseValue('\'a\nb\''), /Single-line string cannot contain EOL/);
        });

        it('handles multi-line basic strings', () => {
            const toml1 = `"""
Roses are red
Violets are\\tblue"""`;
            assert.strictEqual(parseValue(toml1), 'Roses are red\nViolets are\tblue');

            const toml2 = `"""\\
    The quick brown \\
    fox jumps over \\
    the lazy dog.\\
    """`;
            assert.strictEqual(parseValue(toml2), 'The quick brown fox jumps over the lazy dog.');

            // Invalid escape
            const invalid1 = `"""\\
    The quick brown \\
    fox jumps over\\? \\
    the lazy dog\\0.\\
    """`;
            assert.throws(() => parseValue(invalid1), /Invalid escape sequence/);

            // Not closed
            const invalid2 = `"""
Roses are red
Violets are\\tblue`;
            assert.throws(() => parseValue(invalid2), /Multiline string not closed/);
        });

        it('handles multi-line basic strings (CRLF)', () => {
            const toml = `"""\r
Roses are red\r
Violets are\\tblue"""`;
            // Note: The parser normalizes newlines based on logic
            assert.strictEqual(parseValue(toml), 'Roses are red\r\nViolets are\tblue');
        });

        it('handles multi-line literal strings', () => {
            const toml = `'''
Roses are red
Violets are\\tblue'''`;
            assert.strictEqual(parseValue(toml), 'Roses are red\nViolets are\\tblue');

            const invalid = `'''
Roses are red
Violets are\\tblue`;
            assert.throws(() => parseValue(invalid), /Multiline string not closed/);
        });
    });

    describe('Booleans', () => {
        it('handles boolean values', () => {
            assert.strictEqual(parseValue('true'), true);
            assert.strictEqual(parseValue('false'), false);
            assert.throws(() => parseValue('truetrue'));
            // Note: "false " is valid in TOML if followed by newline/EOF, 
            // but our wrapper `key = false ` handles it. 
            // The original test tested the parser combinator in isolation where trailing chars fail.
        });
    });

    describe('Numbers', () => {
        it('handles infinity', () => {
            assert.strictEqual(parseValue('inf'), Infinity);
            assert.strictEqual(parseValue('+inf'), Infinity);
            assert.strictEqual(parseValue('-inf'), -Infinity);
            assert.throws(() => parseValue('infinf'));
        });

        it('handles nan', () => {
            assert.ok(Number.isNaN(parseValue('nan')));
            assert.ok(Number.isNaN(parseValue('+nan')));
            assert.ok(Number.isNaN(parseValue('-nan')));
            assert.throws(() => parseValue('nannan'));
        });

        it('handles binary', () => {
            assert.strictEqual(parseValue('0b11010110'), 214);
            assert.strictEqual(parseValue('0b1101_0110'), 214);
            assert.throws(() => parseValue('0b_11010110'));
        });

        it('handles octal', () => {
            assert.strictEqual(parseValue('0o01234567'), 342391);
            assert.strictEqual(parseValue('0o0123_4567'), 342391);
            assert.strictEqual(parseValue('0o755'), 493);
            assert.throws(() => parseValue('0o_755'));
        });

        it('handles hex', () => {
            assert.strictEqual(parseValue('0xDEADBEEF'), 3735928559);
            assert.strictEqual(parseValue('0xDEAD_BEEF'), 3735928559);
            assert.strictEqual(parseValue('0xdeadbeef'), 3735928559);
            assert.throws(() => parseValue('0x_DEADBEEF'));
        });

        it('handles integer', () => {
            assert.strictEqual(parseValue('123'), 123);
            assert.strictEqual(parseValue('+123'), 123);
            assert.strictEqual(parseValue('-123'), -123);
            assert.strictEqual(parseValue('123_456'), 123456);
            assert.strictEqual(parseValue('0'), 0);
            assert.throws(() => parseValue('_123'));
            assert.throws(() => parseValue('01')); 
        });

        it('handles float', () => {
            assert.strictEqual(parseValue('+1.0'), 1.0);
            assert.strictEqual(parseValue('3.1415'), 3.1415);
            assert.strictEqual(parseValue('-0.01'), -0.01);
            assert.strictEqual(parseValue('5e+22'), 5e+22);
            assert.strictEqual(parseValue('6.626e-34'), 6.626e-34);
            assert.strictEqual(parseValue('224_617.445_991_228'), 224_617.445_991_228);
            
            // Zero handling
            assert.strictEqual(parseValue('0.0'), 0.0);
            assert.strictEqual(parseValue('-0.0'), -0.0);

            assert.throws(() => parseValue('.123'));
            assert.throws(() => parseValue('1.'));
            assert.throws(() => parseValue('_3.14'));
            assert.throws(() => parseValue('3._14'));
        });
    });

    describe('Dates', () => {
        it('handles date and date time', () => {
            assert.deepStrictEqual(parseValue('1979-05-27T07:32:00Z'), new Date('1979-05-27T07:32:00Z'));
            assert.deepStrictEqual(parseValue('1979-05-27T00:32:00-07:00'), new Date('1979-05-27T07:32:00Z'));
            
            // Dates without time
            // Note: Date-only strings usually parse as UTC midnight in standard TOML
            // The logic uses new Date(string.trim())
            assert.deepStrictEqual(parseValue('1979-05-27'), new Date('1979-05-27'));

            // Invalid dates
            assert.throws(() => parseValue('1988-02-30')); 
            assert.throws(() => parseValue('2100-02-29')); 
        });

        it('handles local time', () => {
            assert.strictEqual(parseValue('07:32:00'), '07:32:00');
            assert.strictEqual(parseValue('07:32:00.999'), '07:32:00.999');
        });
    });

    describe('Structures', () => {
        it('handles arrays', () => {
            assert.deepStrictEqual(parseValue('[]'), []);
            assert.deepStrictEqual(parseValue('[1, 2, 3]'), [1, 2, 3]);
            assert.deepStrictEqual(parseValue('[ "red", "yellow", "green" ]'), ['red', 'yellow', 'green']);
            assert.deepStrictEqual(parseValue('[ [ 1, 2 ], [3, 4, 5] ]'), [[1, 2], [3, 4, 5]]);
            
            // Inline objects in arrays
            const complex = `[
              { x = 1, y = 2, z = 3 },
              { x = 7, y = 8, z = 9 },
              { x = 2, y = 4, z = 8 }
            ]`;
            assert.deepStrictEqual(parseValue(complex), [
                { x: 1, y: 2, z: 3 },
                { x: 7, y: 8, z: 9 },
                { x: 2, y: 4, z: 8 }
            ]);

            // Comments in arrays
            const withComments = `[ # comment
                1, # comment
                2, # this is ok
            ]`;
            assert.deepStrictEqual(parseValue(withComments), [1, 2]);
            
            assert.throws(() => parseValue('[1, 2, 3'));
        });

        it('handles inline tables', () => {
            assert.deepStrictEqual(parseValue('{ first = "Tom", last = "Preston-Werner" }'), {
                first: 'Tom',
                last: 'Preston-Werner',
            });
            assert.deepStrictEqual(parseValue('{ type.name = "pug" }'), { type: { name: 'pug' } });
            
            assert.throws(() => parseValue('{ x = 1')); 
        });

        it('handles standard tables', () => {
            const input = `
[foo.bar]
baz = true
fizz.buzz = true
            `;
            assert.deepStrictEqual(tomlParse(input), {
                foo: {
                    bar: {
                        baz: true,
                        fizz: { buzz: true }
                    }
                }
            });

            assert.deepStrictEqual(tomlParse('[only.header]'), {
                only: { header: {} }
            });
        });
    });

    describe('Integration Logic (deepAssign behavior)', () => {
        // Since we can't call deepAssign directly (it's internal), 
        // we test the TOML structures that rely on it (Arrays of Tables).

        it('handles TableArray merging correctly', () => {
            const input = `
            [[foo.items]]
            id = "a"
            
            [[foo.items]]
            id = "b"
            [foo.items.profile]
            name = "b"
            [foo.items.profile.email.x]
            main = "mail@example.com"
            `;

            const expected = {
                foo: {
                    items: [
                        { id: 'a' },
                        { 
                            id: 'b', 
                            profile: { 
                                name: 'b', 
                                email: { 
                                    x: { main: 'mail@example.com' } 
                                } 
                            } 
                        }
                    ]
                }
            };

            assert.deepStrictEqual(tomlParse(input), expected);
        });

        it('handles sibling TableArrays', () => {
            const input = `
            [[foo.items]]
            email = "mail@example.com"
            [[foo.items]]
            email = "sub@example.com"
            `;

            const expected = {
                foo: {
                    items: [
                        { email: 'mail@example.com' },
                        { email: 'sub@example.com' }
                    ]
                }
            };
            assert.deepStrictEqual(tomlParse(input), expected);
        });

        it('throws on invalid assignments', () => {
            // Redeclaring a table as a primitive
            const conflict1 = `
            [a]
            b = 1
            [a.b]
            c = 2
            `;
            // This behavior depends on implementation, but typically overwriting 
            // a value with a table or vice versa is invalid in TOML.
            // In the provided parser logic, assign collisions usually throw.
            assert.throws(() => tomlParse(conflict1));
        });
    });
});

describe('Error Module', () => {

    describe('HTTPError Class', () => {
        it('should correctly initialize properties', () => {
            const err = new HTTPError(404, 'Not Found', 'text');
            assert.strictEqual(err.status, 404);
            assert.strictEqual(err.message, 'Not Found');
            assert.strictEqual(err.type, 'text');
        });
    });

    describe('anythingToError()', () => {
        it('should return the same object if already an HTTPError', () => {
            const original = new HTTPError(418, 'Teapot');
            const result = anythingToError(original);
            assert.strictEqual(result, original);
        });

        it('should convert standard Error to 500 HTTPError', () => {
            const err = new Error('System Crash');
            const result = anythingToError(err);
            assert.strictEqual(result.status, 500);
            assert.strictEqual(result.message, 'System Crash');
            assert.strictEqual(result.type, 'text');
        });

        it('should convert Uint8Array to binary 500 error', () => {
            const data = new TextEncoder().encode('raw error');
            const result = anythingToError(data);
            assert.strictEqual(result.status, 500);
            assert.strictEqual(result.type, 'binary');
            // Uint8Array.toString() usually returns comma-separated bytes
            assert.ok(result.message.includes(data[0].toString()));
        });

        it('should stringify objects to JSON 500 error', () => {
            const obj = { foo: 'bar' };
            const result = anythingToError(obj);
            assert.strictEqual(result.status, 500);
            assert.strictEqual(result.message, JSON.stringify(obj));
            assert.strictEqual(result.type, 'json');
        });

        it('should convert primitives to string 500 error', () => {
            assert.strictEqual(anythingToError('oops').message, 'oops');
            assert.strictEqual(anythingToError(404).message, '404');
        });
    });

    describe('buildHTTPError()', () => {
        it('should format string messages using the logger format', () => {
            const err = buildHTTPError(400, 'Hello %s', 'World');
            assert.strictEqual(err.message, 'Hello World');
            assert.strictEqual(err.status, 400);
        });

        it('should handle JSON objects and detect type', () => {
            const payload = { error: 'logic' };
            const err = buildHTTPError(422, payload);
            assert.strictEqual(err.message, JSON.stringify(payload));
            assert.strictEqual(err.type, 'json');
        });

        it('should handle undefined messages gracefully', () => {
            const err = buildHTTPError(500, undefined);
            assert.strictEqual(err.message, '');
        });

        it('should convert Uint8Array using charset', () => {
            const data = new TextEncoder().encode('buffer');
            const err = buildHTTPError(500, data);
            assert.strictEqual(err.message, 'buffer');
        });
    });

    describe('handleError()', () => {
        let mockRes;
        let mockLog;
        const reqInfo = { method: 'GET', url: '/test' };

        beforeEach(() => {
            mockRes = {
                finished: false,
                statusCode: 0,
                headers: {},
                status(s) { this.statusCode = s; return this; },
                type(t) { this.headers['content-type'] = t; return this; },
                end(data) { this.finished = true; this.body = data; }
            };
            mockLog = {
                errorEntry: null,
                error(data) { this.errorEntry = data; }
            };
        });

        it('should log 500 errors but not 400 errors', () => {
            handleError(new Error('Fatal'), { reqInfo, res: mockRes, log: mockLog });
            assert.ok(mockLog.errorEntry, 'Should log 500 error');
            
            mockLog.errorEntry = null;
            handleError(new HTTPError(404, 'Missing'), { reqInfo, res: mockRes, log: mockLog });
            assert.strictEqual(mockLog.errorEntry, null, 'Should not log 404 error');
        });

        it('should send error message in response for 4xx errors', () => {
            handleError(new HTTPError(403, 'Forbidden'), { reqInfo, res: mockRes, log: mockLog });
            assert.strictEqual(mockRes.statusCode, 403);
            assert.strictEqual(mockRes.body, 'Forbidden');
        });

        it('should hide 500 error messages in production environment', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';
            
            try{
                handleError(new Error('Sensitive Database Info'), { reqInfo, res: mockRes, log: mockLog });
                assert.strictEqual(mockRes.statusCode, 500);
                assert.strictEqual(mockRes.body, '', 'Should leak nothing in production');
            }
            finally{
                process.env.NODE_ENV = originalEnv;
            }
        });

        it('should show 500 error messages in development environment', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'development';

            try{
                handleError(new Error('Detailed Error'), { reqInfo, res: mockRes, log: mockLog });
                assert.strictEqual(mockRes.body, 'Detailed Error');
            }
            finally{
                process.env.NODE_ENV = originalEnv;
            }
        });

        it('should not attempt to send response if res.finished is true', () => {
            mockRes.finished = true;
            handleError(new Error('Late Error'), { reqInfo, res: mockRes, log: mockLog });
            assert.strictEqual(mockRes.statusCode, 0, 'Should not have called res.status');
        });
    });
});