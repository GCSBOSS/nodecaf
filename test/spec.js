/* eslint-env mocha */

const assert = require('assert');

process.env.NODE_ENV = 'testing';

// Address for the tests' local servers to listen.
const LOCAL_HOST = 'http://localhost:80'

const { Readable } = require('stream');

const Nodecaf = require('../lib/main');
const { parse, serialize } = require('../lib/cookie');

describe('Nodecaf', () => {

    describe('constructor', () => {

        it('Should fail when Options is not an object', () => {
            assert.throws( () => new Nodecaf(false), /Options/ );
        });

        it('Should fail when Routes is not an array', () => {
            assert.throws( () => new Nodecaf({ routes: 3 }), /Routes/ );
        });

        it('Should allow registering routes', async () => {
            const app = new Nodecaf({
                conf: { port: 80 },
                routes: [
                    Nodecaf.post('/foo', ({ res }) => res.status(500).end())
                ]
            });
            await app.start();
            const { status } = await fetch(LOCAL_HOST + '/foo', { 
                method: 'POST',
                headers: { 'Connection': 'close' }
            });
            assert.strictEqual(status, 500);
            await app.stop();
        });

        it('Should store any settings sent', () => {
            const app = new Nodecaf({ conf: { key: 'value' } });
            assert.strictEqual(app.conf.key, 'value');
        });

        it('Should fail when startup handler is not a function', () => {
            assert.throws( () => new Nodecaf({ startup: 3 }), /function/ );
        });

        it('Should fail when shutdown handler is not a function', () => {
            assert.throws( () => new Nodecaf({ shutdown: 3 }), /function/ );
        });

        it('Should fail when http port is not a number', () => {
            assert.throws( () => new Nodecaf({ http: '80' }), /number/ );
        });

    });

    describe('#start', () => {

        it('Should prevent starting a running server', async () => {
            const app = new Nodecaf();
            await app.start();
            assert.strictEqual(await app.start(), 'running');
            await app.stop();
        });

        it('Should start the http server when port set in config [conf.port]', async () => {
            const app = new Nodecaf({ conf: { port: 8765 } });
            await app.start();
            const { status } = await fetch('http://127.0.0.1:8765/', {
                headers: { 'Connection': 'close' }
            });
            assert.strictEqual(status, 404);
            await app.stop();
        });

        it('Should start the http server when http option set [opts.http]', async () => {
            const app = new Nodecaf({ http: 8765 });
            await app.start();
            const { status } = await fetch('http://127.0.0.1:8765/', {
                headers: { 'Connection': 'close' }
            });
            assert.strictEqual(status, 404);
            await app.stop();
        });

        it('Should trigger before start event', async () => {
            let done = false;
            const app = new Nodecaf({ startup: () => done = true });
            await app.start();
            assert(done);
            await app.stop();
        });

    });

    describe('#stop', () => {

        it('Should stop the http server', async function(){
            const app = new Nodecaf({ conf: { port: 80 } });
            await app.start();
            await app.stop();
            this.timeout(3000);
            await assert.rejects(fetch(LOCAL_HOST + '/'));
        });

        it('Should trigger after stop event', async () => {
            let done = false;
            const app = new Nodecaf({ shutdown: () => done = true });
            await app.start();
            await app.stop();
            assert(done);
        });

        it('Should not fail when calling close sucessively', async () => {
            const app = new Nodecaf();
            await app.start();
            await app.stop();
            assert.doesNotReject( app.stop() );
        });

    });

    describe('#restart', () => {

        it('Should take down the sever and bring it back up', async function() {
            this.timeout(3000);
            const app = new Nodecaf({ conf: { port: 80 } });
            await app.start();
            const r1 = await fetch(LOCAL_HOST + '/', {
                headers: { 'Connection': 'close' }
            });
            assert.strictEqual(r1.status, 404);
            await app.restart();
            const r2 = await fetch(LOCAL_HOST + '/', {
                headers: { 'Connection': 'close' }
            });
            assert.strictEqual(r2.status, 404);
            await app.stop();
        });

        it('Should reload conf when new object is sent', async () => {
            const app = new Nodecaf();
            await app.start();
            await app.restart({ myKey: 3 });
            assert.strictEqual(app.conf.myKey, 3);
            await app.stop();
        });

    });

    describe('#setup', () => {

        it('Should apply settings on top of existing one', () => {
            const app = new Nodecaf({ conf: { key: 'value' } });
            app.setup({ key: 'value2', key2: 'value' });
            assert.strictEqual(app.conf.key, 'value2');
            assert.strictEqual(app.conf.key2, 'value');
        });

        it('Should load form file when path is sent', () => {
            const fs = require('fs');
            fs.writeFileSync(__dirname + '/a.toml', 'key = "value"', 'utf-8');
            const app = new Nodecaf({ conf: { key: 'valueOld' } });
            app.setup(__dirname + '/a.toml');
            assert.strictEqual(app.conf.key, 'value');
            fs.unlink(__dirname + '/a.toml', Function.prototype);
        });
        
        describe('Conf Layering', () => {
            const { layerConf } = require('../lib/conf');
            const fs = require('fs');

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

            it('Should fail if given file conf type is not supported', () => {
                assert.throws(() => layerConf('./conf.xml'));
            });

            it('Should fail if conf file is not found', () => {
                assert.throws(() => layerConf('./bla.json'));
            });

            it('Should properly load a TOML file and generate an object', () => {
                fs.writeFileSync(__dirname + '/a.toml', 'key = "value"', 'utf-8');
                const conf = layerConf(__dirname + '/a.toml');
                assert.strictEqual(conf.key, 'value');
                fs.unlink(__dirname + '/a.toml', Function.prototype);
            });

            it('Should properly load an JSON file and generate an object', () => {
                fs.writeFileSync(__dirname + '/a.json', '{"key": "value"}', 'utf-8');
                const conf = layerConf(__dirname + '/a.json');
                assert.strictEqual(conf.key, 'value');
                fs.unlink(__dirname + '/a.json', Function.prototype);
            });

        });

    });

    describe('#trigger', () => {

        it('Should trigger route without http server', async () => {
            const app = new Nodecaf({
                routes: [
                    Nodecaf.post('/foo', ({ res }) => res.status(202).end('Test')),
                    Nodecaf.post('/nores', ({ res }) => res.status(204).end())
                ]
            });
            await app.start();
            await app.trigger('post', '/nores');
            const res = await app.trigger('post', '/foo');
            assert.strictEqual(res.status, 202);
            assert.strictEqual(res.body.toString(), 'Test');
            await app.stop();
        });

        it('Should default to response status to 200', async () => {
            const app = new Nodecaf({
                routes: [
                    Nodecaf.post('/foo', ({ res }) => {
                        res.set('X-Test', 'Foo');
                        res.end();
                    }),
                    Nodecaf.post('/bar', ({ res }) => {
                        res.end();
                    })
                ]
            });
            await app.start();
            const r = await app.trigger('post', '/bar', { body: Buffer.from('abc') });
            assert.strictEqual(r.status, 200);
            const res = await app.trigger('post', '/foo',
                { headers: { host: 'what.com' }, body: { foo: 'bar' } });
            assert.strictEqual(res.headers['x-test'], 'Foo');
            await app.stop();
        });

        it('Should properly parse body inputs', async () => {
            const app = new Nodecaf({
                routes: [
                    Nodecaf.post('/raw', async ({ body, res }) => {
                        const input = await body.raw();
                        assert.strictEqual(input.toString(), '12345');
                        res.end();
                    }),

                    Nodecaf.post('/json', async ({ body, res }) => {
                        const input = await body.json();
                        assert.strictEqual(input, 12345);
                        res.end();
                    }),

                    Nodecaf.post('/text', async ({ body, res }) => {
                        const input = await body.text();
                        assert.strictEqual(input, '12345');
                        res.end();
                    }),

                    Nodecaf.post('/urlencoded', async ({ body, res }) => {
                        const input = await body.urlencoded();
                        assert.strictEqual(input['12345'], '');
                        res.end();
                    })
                ]
            });
            await app.start();

            const r1 = await app.trigger('post', '/raw', { body: 12345 });
            assert.strictEqual(r1.status, 200);
            const r2 = await app.trigger('post', '/json',
                { body: 12345, headers: { 'content-type': 'application/json' } });
            assert.strictEqual(r2.status, 200);
            const r3 = await app.trigger('post', '/text',
                { body: 12345, headers: { 'content-type': 'text/css' } });
            assert.strictEqual(r3.status, 200);
            const r4 = await app.trigger('post', '/urlencoded', {
                body: 12345,
                headers: { 'content-type': 'application/x-www-form-urlencoded' }
            });
            assert.strictEqual(r4.status, 200);

            await app.stop();
        });

        it('Should allow streaming data in', async () => {
            const app = new Nodecaf({
                routes: [
                    Nodecaf.post('/stream', ({ body, res }) => {
                        body.on('end', () => res.status(201).end());
                        body.resume();
                    })
                ]
            });
            await app.start();
            const body = Readable.from('foobar');
            const r = await app.trigger('post', '/stream', { body });
            assert.strictEqual(r.status, 201);
            await app.stop();
        });

    });

    describe('#call', () => {

        it('Should call any user func with route handler args', async () => {

            function userFunc({ conf }, arg1){
                assert.strictEqual(arg1, 'foo');
                assert.strictEqual(conf.bar, 'baz');
                assert(this instanceof Nodecaf);
            }

            const app = new Nodecaf({
                conf: { bar: 'baz' },
                startup({ call }){
                    call(userFunc, 'foo');
                }
            });
            await app.start();
            await app.stop();
        });

    });

    describe('#run', () => {

        it('Should run the given app server', async () => {
            const app = await new Nodecaf({
                routes: [ Nodecaf.get('/bar', ({ res }) => res.text('foo')) ]
            }).run();
            const { body } = await app.trigger('get', '/bar');
            assert.strictEqual(body, 'foo');
            await app.stop();
        });

        it('Should inject the given conf object', async () => {
            const app = await new Nodecaf({
                routes: [ Nodecaf.get('/bar', ({ res, conf }) => res.text(conf.key)) ]
            }).run({ conf: { key: 'value' } });

            const { body } = await app.trigger('get', '/bar');
            assert.strictEqual(body, 'value');
            await app.stop();
        });

        it('Should inject multiple conf objects', async () => {
            const app = await new Nodecaf({
                routes: [ Nodecaf.get('/bar', ({ res, conf }) => res.text(conf.name)) ]
            }).run({ conf: [ { key: 'value' }, './package.json' ] });

            const { body } = await app.trigger('get', '/bar');
            assert.strictEqual(body, 'nodecaf');
            await app.stop();
        });

    });


});

describe('Handlers', () => {

    it('Should fail when receiving invalid or duplicated route handlers', () => {
        assert.throws(() => Nodecaf.post('/foobar', undefined), TypeError);
        assert.throws(() => new Nodecaf({
            routes: [
                { method: 'post' }
            ]
        }), /function/);
        assert.throws(() => new Nodecaf({
            routes: [
                Nodecaf.post('/foobaz', Function.prototype),
                Nodecaf.post('/foobaz', Function.prototype)
            ]
        }), /already/);
    });

    it('Should pass all the required args to handler', async () => {

        const route = Nodecaf.get('/foo', function(obj){
            assert(obj.res && obj.method && obj.path && obj.body && obj.ip
                && obj.params && obj.query && obj.conf && obj.log && obj.keep);
            assert(this instanceof Nodecaf);
            obj.res.end();
        });

        const app = new Nodecaf({
            conf: { port: 80 },
            routes: [ route ]
        });
        await app.start();
        const { status } = await fetch(LOCAL_HOST + '/foo', {
            headers: { 'Connection': 'close' }
        });
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should execute \'all\' handler on any non-matched route', async () => {
        const app = new Nodecaf({
            routes: [
                // All should be only run when non-matching regardless of order it was defined
                Nodecaf.all(({ res, path }) => res.end(path)),
                Nodecaf.post('/foo/:bar', ({ res }) => res.end('foo'))
            ]
        });
        await app.start();
        assert.strictEqual((await app.trigger('post', '/foo/bar')).body.toString(), 'foo');
        assert.strictEqual((await app.trigger('get', '/abc')).body.toString(), '/abc');
        await app.stop();
    });

    it('Should fail when trying to use \'all\' twice, or passing a non-function handler', () => {
        assert.throws(() => Nodecaf.all(), /function/);
        assert.throws(() => new Nodecaf({
            routes: [
                { all: true }
            ]
        }), /function/);
        assert.throws(() => new Nodecaf({
            routes: [
                Nodecaf.all(Function.prototype),
                Nodecaf.all(Function.prototype)
            ]
        }), /already/);
    });
    
    it('Should pass all present parameters to handler', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            routes: [
                Nodecaf.get('/fo/:o', Function.prototype),
                Nodecaf.get('/foo/:bar', function({ params, res }){
                    res.badRequest(params.bar !== 'test');
                    res.end();
                })
            ]
        });
        await app.start();
        const { status }  = await fetch(LOCAL_HOST + '/foo/test', {
            headers: { 'Connection': 'close' }
        });
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should properly handle URI encoded params', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            routes: [
                Nodecaf.get('/foo/:bar', function({ params, res }){
                    res.badRequest(params.bar !== 'abc:def');
                    res.end();
                })
            ]
        });
        await app.start();
        const { status }  = await fetch(LOCAL_HOST + '/foo/abc%3Adef', {
            headers: { 'Connection': 'close' }
        });
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should parse URL query string', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            routes: [
                Nodecaf.post('/foobar', ({ query, res }) => {
                    assert.strictEqual(query.foo, 'bar');
                    res.end();
                })
            ]
        });
        await app.start();
        const { status } = await fetch(LOCAL_HOST + '/foobar?foo=bar', { 
            method: 'POST',
            headers: { 'Connection': 'close' }
        });
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should output a 404 when no route is found for a given path', async () => {
        const app = new Nodecaf({ conf: { port: 80 } });
        await app.start();
        const { status } = await fetch(LOCAL_HOST + '/foobar', { 
            method: 'POST',
            headers: { 'Connection': 'close' }
        });
        assert.strictEqual(status, 404);
        await app.stop();
    });

    it('Should stream bytes to client', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            routes: [
                Nodecaf.get('/foo', function({ res }){
                    const s = require('fs').createReadStream('./package.json');
                    s.pipe(res);
                })
            ]
        });
        await app.start();
        const res = await fetch(LOCAL_HOST + '/foo', {
            headers: { 'Connection': 'close' }
        });
        const body = await res.text();
        const o = JSON.parse(body);
        assert.strictEqual(o.name, 'nodecaf');
        await app.stop();
    });

    it('Should parse object as json response [res.json()]', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            routes: [
                Nodecaf.get('/foo', function({ res }){
                    res.json('{"hey":"ho"}');
                })
            ]
        });
        await app.start();
        const { headers } = await fetch(LOCAL_HOST + '/foo', {
            headers: { 'Connection': 'close' }
        });
        assert.strictEqual(headers.get('content-type'), 'application/json');
        await app.stop();
    });

    it('Should set multiple cookies properly', async function(){

        const app = new Nodecaf({
            conf: { port: 80 },
            routes: [
                Nodecaf.get('/foo', function({ res }){
                    res.cookie('test', 'foo');
                    res.cookie('testa', 'bar');
                    res.cookie('testa', 'baz');
                    res.end();
                })
            ]
        });
        await app.start();
        const { headers } = await fetch(LOCAL_HOST + '/foo', {
            headers: { 'Connection': 'close' }
        });
        const cookies = headers.getSetCookie();
        assert(cookies.some(c => c.startsWith('testa=bar')));
        await app.stop();
    });

    it('Should clear cookies', async function(){
        const app = new Nodecaf({
            conf: { port: 80 },
            routes: [
                Nodecaf.get('/foo', function({ res }){
                    res.cookie('testa', 'bar');
                    res.end();
                }),

                Nodecaf.get('/bar', function({ res }){
                    res.clearCookie('testa');
                    res.end();
                })
            ]
        });
        await app.start();
        const res1 = await fetch(LOCAL_HOST + '/foo', {
            headers: { Connection: 'close' }
        });
        // Extract cookie value for next request
        const cookie = res1.headers.getSetCookie()[0].split(';')[0];
        
        const res2 = await fetch(LOCAL_HOST + '/bar', { headers: { 
            Connection: 'close',
            Cookie: cookie 
        } });
        const setCookies = res2.headers.getSetCookie();
        assert(setCookies[0].indexOf('Expire') > -1);
        await app.stop();
    });

    it('Should call any user func with route handler args', async () => {

        function userFunc({ path }, arg1){
            assert.strictEqual(arg1, 'foo');
            assert.strictEqual(path, '/foo');
            assert(this instanceof Nodecaf);
        }

        const app = new Nodecaf({
            conf: { bar: 'baz' },
            routes: [
                Nodecaf.post('/foo', function({ call, res }){
                    call(userFunc, 'foo');
                    res.end();
                })
            ]
        });
        await app.start();
        const { status } = await app.trigger('post', '/foo');
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should keep any user defined value for the lifetime of the request', async () => {

        function userFunc({ myVal, res }){
            res.badRequest(!myVal);
        }

        const app = new Nodecaf({
            conf: { bar: 'baz' },
            autoParseBody: true,
            routes: [
                Nodecaf.post('/foo', function({ keep, call, res, body }){
                    body == 'bar' && keep('myVal', true);
                    call(userFunc);
                    res.end();
                })
            ]
        });
        await app.start();
        const { status } = await app.trigger('post', '/foo', { body: 'bar' });
        assert.strictEqual(status, 200);
        const r = await app.trigger('post', '/foo', { body: 'foo' });
        assert.strictEqual(r.status, 400);
        await app.stop();
    });

    it('Should handle websocket upgrade requests [opts.websocket]', async function(){

        const { WebSocket } = require('ws');
        let done;
        const app = new Nodecaf({
            conf: { port: 80 },
            websocket: true,
            routes: [
                Nodecaf.get('/bar', async ({ websocket }) => {
                    const ws = await websocket();
                    ws.on('message', m => {
                        assert.strictEqual(m.toString(), 'foobar');
                        done = true;
                        ws.close();
                    });
                })
            ]
        });

        await app.start();
        const ws = new WebSocket('ws://localhost:80/bar');
        await new Promise(done => ws.onopen = done);
        ws.send('foobar');
        await app.stop();
        assert(done);
    });

    it('Should handle websocket upgrade requests even on \'all\' handler [opts.websocket]', async function(){

        const { WebSocket } = require('ws');
        let done;
        const app = new Nodecaf({
            conf: { port: 80 },
            websocket: true,
            routes: [
                Nodecaf.all(async ({ websocket }) => {
                    const ws = await websocket();
                    ws.on('message', m => {
                        assert.strictEqual(m.toString(), 'foobar');
                        done = true;
                        ws.close();
                    });
                })
            ]
        });

        await app.start();
        const ws = new WebSocket('ws://localhost:80/bar');
        await new Promise(done => ws.onopen = done);
        ws.send('foobar');
        await app.stop();
        assert(done);
    });

});

describe('Body Parsing', () => {

    it('Should NOT try parsing body when none is sent', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            autoParseBody: true,
            routes: [
                Nodecaf.post('/foobar', ({ body, res }) => {
                    assert.strictEqual(body, undefined);
                    res.end();
                })
            ]
        });
        await app.start();
        const { status } = await fetch(LOCAL_HOST + '/foobar', { 
            method: 'POST',
            headers: { 'Connection': 'close' }
        });
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should parse JSON request body payloads', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            autoParseBody: true,
            routes: [
                Nodecaf.post('/foobar', ({ body, res }) => {
                    assert.strictEqual(body.foo, 'bar');
                    res.end();
                })
            ]
        });
        await app.start();
        const { status } = await fetch(LOCAL_HOST + '/foobar', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Connection': 'close'
            },
            body: JSON.stringify({ foo: 'bar' })
        });
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should send 400 when failed to parse body', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            autoParseBody: true,
            routes: [
                Nodecaf.post('/foobar', Function.prototype)
            ]
        });
        await app.start();
        const { status } = await fetch(LOCAL_HOST + '/foobar', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Connection': 'close'
            },
            body: 'foobar}'
        });

        assert.strictEqual(status, 400);
        await app.stop();
    });

    it('Should parse text request body payloads', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            autoParseBody: true,
            routes: [
                Nodecaf.post('/foobar', ({ body, res }) => {
                    assert.strictEqual(body, '{"foo":"bar"}');
                    res.end();
                })
            ]
        });
        await app.start();
        const { status } = await fetch(LOCAL_HOST + '/foobar', {
            method: 'POST',
            headers: { 
                'Content-Type': 'text/css',
                'Connection': 'close'
            },
            body: JSON.stringify({foo: 'bar'})
        });
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should parse request body without content-type', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            autoParseBody: true,
            routes: [
                Nodecaf.post('/foobar', ({ body, res }) => {
                    assert.strictEqual(body.toString(), '{"foo":"bar"}');
                    res.end();
                })
            ]
        });
        await app.start();
        const { status } = await fetch(LOCAL_HOST + '/foobar', {
            method: 'POST',
            headers: { 'no-auto': true, 'Content-Length': 13, 'Connection': 'close' },
            body: JSON.stringify({foo: 'bar'})
        });
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should not parse binary request body', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            autoParseBody: true,
            routes: [
                Nodecaf.post('/foobar', ({ body, res }) => {
                    assert(body instanceof Buffer);
                    res.end();
                })
            ]
        });
        await app.start();
        const { status } = await fetch(LOCAL_HOST + '/foobar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream', 'Connection': 'close' },
            body: 'fobariummuch'
        });
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should parse URLEncoded request body payloads', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            autoParseBody: true,
            routes: [
                Nodecaf.post('/foobar', ({ body, res }) => {
                    assert.strictEqual(body.foo, 'bar');
                    res.end();
                })
            ]
        });
        await app.start();
        const { status } = await fetch(LOCAL_HOST + '/foobar', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded',
                'Connection': 'close'
            },
            body: 'foo=bar'
        });
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should not parse request body when setup so', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            routes: [
                Nodecaf.post('/foobar', ({ body, res }) => {
                    assert.strictEqual(body.constructor.name, 'IncomingMessage');
                    res.end();
                })
            ]
        });
        await app.start();
        const { status } = await fetch(LOCAL_HOST + '/foobar', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded',
                'Connection': 'close'
            },
            body: 'foo=bar'
        });
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should catch body issues even when called explicitly', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            routes: [
                Nodecaf.post('/foobar', async ({ body, res }) => {
                    const b = await body.parse();
                    assert.strictEqual(b.foo, 'bar');
                    res.end();
                })
            ]
        });
        await app.start();
        const res = await fetch(LOCAL_HOST + '/foobar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Connection': 'close' },
            body: '{sdfs'
        });
        const body = await res.text();
        assert.strictEqual(res.status, 400);
        assert.strictEqual(body, 'Invalid format');
        await app.stop();
    });

    it('Should allow reading chunked body as if it were a complete body, for unorthodox usages', async function(){

        const app = new Nodecaf({
            conf: { port: 80 },
            routes: [
                Nodecaf.post('/chunked', async ({ body, res }) => {
                    const input = await body.raw();
                    const str = input.toString();
                    assert.strictEqual(str, '12345');
                    res.status(201).end();
                })
            ]
        });

        await app.start();
        
        const { PassThrough } = require('stream');
        const stream = new PassThrough();
        
        // Create the request but catch immediate errors to prevent process crash
        const reqPromise = fetch(LOCAL_HOST + '/chunked', {
            method: 'POST',
            body: stream,
            duplex: 'half',
            headers: { 'Connection': 'close' }
        });

        stream.write('123');
        await new Promise(done => setTimeout(done, 500));
        stream.write('45');
        await new Promise(done => setTimeout(done, 500));
        stream.end();

        const res = await reqPromise;
        
        // If fetch failed, we throw to see the error in the test output
        if(res.error) throw res.error;

        assert.strictEqual(res.status, 201);
        await app.stop();
    });

    it('Should respond 408 when body takes too long to finish', async () => {

        const app = new Nodecaf({
            conf: { port: 80 },
            reqBodyTimeout: 600,
            routes: [
                Nodecaf.post('/tto', async ({ body }) => {
                    await body.text();
                })
            ]
        });

        await app.start();

        const { PassThrough } = require('stream');
        const stream = new PassThrough();

        const req = fetch(LOCAL_HOST + '/tto', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain', 'Connection': 'close' },
            body: stream,
            duplex: 'half',
        });
        
        stream.write('a');

        const { status } = await req;

        assert.strictEqual(status, 408);

        stream.destroy();
        await app.stop();
    });

    it('Should abort route when client conneciton is reset while reading req body', async () => {

        let abortedRouted = true;
        let startedRoute = false;
        let abortErrorName = false;

        const app = new Nodecaf({
            conf: { port: 80 },
            routes: [
                Nodecaf.post('/tto', async ({ body }) => {
                    startedRoute = true;
                    await body.text();
                    abortedRouted = false;
                })
            ]
        });

        await app.start();

        const controller = new AbortController();
        const { PassThrough } = require('stream');
        const stream = new PassThrough();

        // Start request but don't await response immediately
        const p = fetch(LOCAL_HOST + '/tto', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain', 'Connection': 'close' },
            body: stream,
            duplex: 'half',
            signal: controller.signal
        }).catch(err => {
            abortErrorName = err.name;
        });

        stream.write('abc');
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Destroy the request (abort)
        controller.abort();

        await p;
        await app.stop();
        assert(abortedRouted);
        assert(startedRoute);
        assert.strictEqual(abortErrorName, 'AbortError');
    });

});

describe('Assertions', () => {

    it('Should throw when condition evaluates to true', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            routes: [
                Nodecaf.get('/foo', function({ res }){
                    assert.throws( () => res.badRequest(true, Buffer.from('abc')) );
                    res.end();
                }),
                Nodecaf.get('/foo2', function({ res }){
                    assert.throws( () => res.unauthorized(true) );
                    res.end();
                }),
                Nodecaf.get('/foo3', function({ res }){
                    assert.throws( () => res.forbidden(true) );
                    res.end();
                }),
                Nodecaf.get('/foo4', function({ res }){
                    assert.throws( () => res.notFound(true) );
                    res.end();
                }),
                Nodecaf.get('/foo5', function({ res }){
                    assert.throws( () => res.conflict(true) );
                    res.end();
                }),
                Nodecaf.get('/foo6', function({ res }){
                    assert.throws( () => res.gone(true) );
                    res.end();
                })
            ]
        });
        await app.start();
        
        const res = await fetch(LOCAL_HOST + '/foo', { headers: { 'Connection': 'close' } });
        await res.text();
        assert.strictEqual(res.status, 400);

        const res2 = await fetch(LOCAL_HOST + '/foo2', { headers: { 'Connection': 'close' } });
        await res2.text();
        assert.strictEqual(res2.status, 401);
        
        const res3 = await fetch(LOCAL_HOST + '/foo3', { headers: { 'Connection': 'close' } });
        await res3.text();
        assert.strictEqual(res3.status, 403);
        
        const res4 = await fetch(LOCAL_HOST + '/foo4', { headers: { 'Connection': 'close' } });
        await res4.text();
        assert.strictEqual(res4.status, 404);
        
        const res5 = await fetch(LOCAL_HOST + '/foo5', { headers: { 'Connection': 'close' } });
        await res5.text();
        assert.strictEqual(res5.status, 409);
        
        const res6 = await fetch(LOCAL_HOST + '/foo6', { headers: { 'Connection': 'close' } });
        await res6.text();
        assert.strictEqual(res6.status, 410);

        await app.stop();
    });

    it('Should do nothing when condition evaluates to false', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            routes: [
                Nodecaf.get('/foo', function({ res }){
                    assert.doesNotThrow( () => res.badRequest(false) );
                    assert.doesNotThrow( () => res.unauthorized(false) );
                    assert.doesNotThrow( () => res.forbidden(false) );
                    assert.doesNotThrow( () => res.notFound(false) );
                    assert.doesNotThrow( () => res.conflict(false) );
                    assert.doesNotThrow( () => res.gone(false) );
                    res.end();
                })
            ]
        });
        await app.start();
        const res = await fetch(LOCAL_HOST + '/foo', { headers: { 'Connection': 'close' } });
        await res.text();
        await app.stop();
    });

    it('Should interpolate %s variables in assertion message', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            routes: [
                Nodecaf.get('/foo', function({ res }){
                    res.badRequest(true, '%sfoo%sbaz%%s', 1, 'bar', 2);
                })
            ]
        });
        await app.start();
        const res = await fetch(LOCAL_HOST + '/foo', { headers: { 'Connection': 'close' } });
        const body = await res.text();
        assert.strictEqual(body, '1foobarbaz%s 2');
        await app.stop();
    });

});

describe('Error Handling', () => {
    const fs = require('fs');

    it('Should handle Error thrown sync on the route', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            routes: [
                Nodecaf.post('/unknown', () => {
                    throw new Error('othererr');
                })
            ]
        });
        await app.start();
        const { status } = await fetch(LOCAL_HOST + '/unknown', { 
            method: 'POST',
            headers: { 'Connection': 'close' }
        });
        assert.strictEqual(status, 500);
        await app.stop();
    });

    it('Should handle Error injected sync on the route', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            routes: [
                Nodecaf.post('/known', ({ res }) => {
                    throw res.error(404, 'abc %s', 'def');
                }),
                Nodecaf.post('/unknown', ({ res }) => {
                    throw res.error(new Error('errfoobar'));
                }),
                Nodecaf.post('/serverfault', ({ res }) => {
                    throw res.error(501, { test: 'foo' });
                })
            ]
        });
        await app.start();
        const { status } = await fetch(LOCAL_HOST + '/known', { 
            method: 'POST',
            headers: { 'Connection': 'close' }
        });
        assert.strictEqual(status, 404);
        const { status: s2 } = await fetch(LOCAL_HOST + '/unknown', { 
            method: 'POST',
            headers: { 'Connection': 'close' }
        });
        assert.strictEqual(s2, 500);
        const { status: s3 } = await fetch(LOCAL_HOST + '/serverfault', { 
            method: 'POST',
            headers: { 'Connection': 'close' }
        });
        assert.strictEqual(s3, 501);
        await app.stop();
    });

    it('Should handle Rejection on async route', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            routes: [
                Nodecaf.post('/async', async () => {
                    // This uses fetch as part of the test logic, coincidentally
                    await fetch('http://nonexistent.localhost/', {
                        headers: { 'Connection': 'close' }
                    });
                })
            ]
        });
        await app.start();
        const { status } = await fetch(LOCAL_HOST + '/async', { 
            method: 'POST',
            headers: { 'Connection': 'close' } 
        });
        assert.strictEqual(status, 500);
        await app.stop();
    });

    it('Should handle Error injected ASYNC on the route', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            routes: [
                Nodecaf.post('/known', ({ res }) => {
                    fs.readdir('.', function(){
                        res.error(404, true);
                    });
                }),
                Nodecaf.post('/unknown', async ({ res }) => {
                    await fs.readdir('.', function(){
                        res.error({ a: 'b' });
                    });
                }),
                Nodecaf.post('/unknown/object', ({ res }) => {
                    res.error(Buffer.from('abc'));
                })
            ]
        });
        await app.start();
        const { status } = await fetch(LOCAL_HOST + '/known', { 
            method: 'POST',
            headers: { 'Connection': 'close' }
        });
        assert.strictEqual(status, 404);
        const { status: s2 } = await fetch(LOCAL_HOST + '/unknown', { 
            method: 'POST',
            headers: { 'Connection': 'close' }
        });
        assert.strictEqual(s2, 500);
        const { status: s3 } = await fetch(LOCAL_HOST + '/unknown/object', { 
            method: 'POST',
            headers: { 'Connection': 'close' }
        });
        assert.strictEqual(s3, 500);
        await app.stop();
    });

});

describe('Logging', () => {
    let log;

    before(function(){
        const app = new Nodecaf();
        log = app.log;
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
        const app = new Nodecaf({ conf: { log: { level: 'error' } } });
        const log = app.log;
        assert(!log.warn());
    });

    it('Should not log anything when conf is FALSE', function(){
        const app = new Nodecaf({ conf: { log: false } });
        const log = app.log;
        assert(!log.debug());
    });

    it('Should only log selected types [only]', function(){
        const app = new Nodecaf({ conf: { log: { only: 'a' } } });
        const log = app.log;
        assert(log.debug({ type: 'a' }));
        assert(!log.debug({ type: 'b' }));
    });

    it('Should not log filtered types [except]', function(){
        const app = new Nodecaf({ conf: { log: { except: [ 'a', 'c' ] } } });
        const log = app.log;
        assert(!log.debug({ type: 'a' }));
        assert(log.debug({ type: 'b' }));
        assert(!log.debug({ type: 'c' }));
    });

    it('Should generate a capture stack trace for errors', function(){
        const entry = log.error({ err: new Error('Test Error') });

        assert(Array.isArray(entry.capture));
        assert(entry.capture.length > 0);
        // The capture should point to this test file (spec.js)
        // and not include internal logger files due to the slice offset
        assert(entry.capture[0].includes('spec.js'));
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

});

describe('Regression', () => {

    it('Should handle errors even when error event has no listeners', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            routes: [
                Nodecaf.post('/bar', () => {
                    throw new Error('errfoobar');
                })
            ]
        });
        await app.start();
        const { status } = await fetch(LOCAL_HOST + '/bar', { 
            method: 'POST',
            headers: { 'Connection': 'close' } 
        });
        assert.strictEqual(status, 500);
        await app.stop();
    });

    it('Should not fail when attempting to close during startup', async () => {
        const app = new Nodecaf();
        const p = app.start();
        await assert.doesNotReject( app.stop() );
        await p;
        await app.stop();
    });

    it('Should not fail when attempting to start during shutdown', async function(){
        this.timeout(3000);
        const app = new Nodecaf({
            async shutdown() {
                await new Promise(done => setTimeout(done, 1200));
            }
        });
        await app.start();
        const p = app.stop();
        await assert.doesNotReject( app.start() );
        await p;
    });

    it('Should read correct package.json for name and version', () => {
        const app = new Nodecaf();
        assert.strictEqual(app._name, 'nodecaf');
    });

    it('Should not modify the very object used as cookie options', async () => {
        const cookieOpts = { maxAge: 68300000 };
        const app = new Nodecaf({
            conf: { port: 80 },
            routes: [
                Nodecaf.get('/foo', function({ res }){
                    res.cookie('test', 'foo', cookieOpts);
                    res.cookie('testa', 'bar', cookieOpts);
                    res.json(cookieOpts);
                })
            ]
        });
        await app.start();
        const res = await fetch(LOCAL_HOST + '/foo', {
            headers: { 'Connection': 'close' }
        });
        const body = await res.json();
        assert.strictEqual(body.maxAge, 68300000);
        await app.stop();
    });

    it('Should NOT send reponse body when assertion has no message', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            routes: [
                Nodecaf.get('/foo', function({ res }){
                    res.unauthorized(true);
                })
            ]
        });
        await app.start();
        const res = await fetch(LOCAL_HOST + '/foo', { headers: { 'Connection': 'close' } });
        const body = await res.text();
        assert(!res.headers.get('content-type'));
        assert.strictEqual(body.length, 0);
        await app.stop();
    });

    it('Should not crash on weird json body', done => {

        (async function(){
            const app = new Nodecaf({
                autoParseBody: true,
                conf: { port: 80 },
                routes: [
                    Nodecaf.post('/foobar', function({ res }){
                        res.end();
                    })
                ]
            });
            await app.start();
            process.on('uncaughtException', done);
            process.on('unhandledRejection', done);
            const { status } = await fetch(LOCAL_HOST + '/foobar', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Connection': 'close'
                },
                body: '{"sdf:'
            });
            assert.strictEqual(status, 400);
            await app.stop();
            done();
        })();
    });

    it('Should keep proper app state when errors happen at startup and shutdown', async () => {
        let app = new Nodecaf({
            startup(){
                throw new Error('foo');
            }
        });
        await assert.rejects(() => app.start(), /foo/);

        app = new Nodecaf({
            shutdown(){
                throw new Error('foo');
            }
        });
        await app.start();
        await assert.rejects(() => app.stop(), /foo/);
    });

    it('Should properly route paths with multiple segments', async function(){
        const app = new Nodecaf({
            conf: { port: 80 },
            routes: [
                Nodecaf.get('/foo/:id', function({ res }){
                    res.text('shortest');
                }),
                Nodecaf.get('/foo/:id/abc', function({ res }){
                    res.text('largest');
                })
            ]
        });
        await app.start();
        const res = await fetch(LOCAL_HOST + '/foo/123/abc', {
            headers: { 'Connection': 'close' }
        });
        const body = await res.text();
        assert.strictEqual(body, 'largest');
        await app.stop();
    });

    it('Should expose up to date global values for each \'call\' execution', async function(){

        function changeGlobalKey(){
            assert(this.global.someKey === 'some value');
            this.global.someKey = 'new value';
        }

        function testGlobalKeyChangedInRoute({ res, someKey }){
            res.badRequest(someKey !== 'new value');
        }

        function testGlobalKeyChanged({ someKey }){
            assert.strictEqual(someKey, 'new value');
        }

        const app = new Nodecaf({

            startup({ global, call }){
                global.someKey = 'some value';
                call(changeGlobalKey);
                call(testGlobalKeyChanged);

                global.someKey = 'some value';
            },

            routes: [
                Nodecaf.get('/foo', function({ res, call }){
                    call(changeGlobalKey);
                    call(testGlobalKeyChangedInRoute);
                    res.end();
                })
            ]
        });
        await app.start();

        const { status } = await app.trigger('get', '/foo');
        assert.strictEqual(status, 200);
        await app.stop();
    });

});

describe('CORS', function(){

    it('Should send permissive CORS headers when setup so [cors]', async () => {
        const app = new Nodecaf({
            conf: { cors: true, port: 80 },
            routes: [
                Nodecaf.get('/foobar', ({ res }) => res.end() )
            ]
        });
        await app.start();

        const res = await fetch(LOCAL_HOST + '/foobar', {
            headers: { 'Origin': 'http://outsider.com', 'Connection': 'close' }
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.headers.get('access-control-allow-origin'), '*');

        const r = await fetch(LOCAL_HOST + '/foobar', {
            method: 'OPTIONS',
            headers: { 'Origin': 'http://outsider.com', 'Connection': 'close' }
        });
        assert.strictEqual(r.headers.get('access-control-allow-methods'),
            'GET,HEAD,PUT,PATCH,POST,DELETE');

        await app.stop();
    });

    it('Should not send CORS headers when setup so [cors]', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            routes: [
                Nodecaf.get('/foobar', ({ res }) => res.end() )
            ]
        });
        await app.start();
        const res = await fetch(LOCAL_HOST + '/foobar', {
            headers: { 'Origin': 'http://outsider.com', 'Connection': 'close' }
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
        await app.stop();
    });

    it('Should handle specific String origin and set Vary header', async () => {
        const app = new Nodecaf({
            conf: { 
                port: 80, 
                cors: { origin: 'http://trusted.com' } 
            },
            routes: [ Nodecaf.get('/cors-string', ({ res }) => res.end()) ]
        });
        await app.start();

        const res = await fetch(LOCAL_HOST + '/cors-string', {
            headers: { 'Origin': 'http://trusted.com', 'Connection': 'close' }
        });

        assert.strictEqual(res.headers.get('access-control-allow-origin'), 'http://trusted.com');
        
        // Fix: Expect 'origin' (lowercase) because setVaryHeader normalizes it
        assert.strictEqual(res.headers.get('vary'), 'origin');

        await app.stop();
    });

    it('Should handle Regex/Array origins and reject mismatches', async () => {
        const app = new Nodecaf({
            conf: { 
                port: 80, 
                // Complex origin logic (Array + Regex)
                cors: { origin: [/foo\.com$/, 'http://exact-match.com'] } 
            },
            routes: [ Nodecaf.get('/cors-regex', ({ res }) => res.end()) ]
        });
        await app.start();

        // 1. Regex Match
        const res1 = await fetch(LOCAL_HOST + '/cors-regex', {
            headers: { 'Origin': 'http://sub.foo.com', 'Connection': 'close' }
        });
        assert.strictEqual(res1.headers.get('access-control-allow-origin'), 'http://sub.foo.com');

        // 2. Exact String in Array Match
        const res2 = await fetch(LOCAL_HOST + '/cors-regex', {
            headers: { 'Origin': 'http://exact-match.com', 'Connection': 'close' }
        });
        assert.strictEqual(res2.headers.get('access-control-allow-origin'), 'http://exact-match.com');

        // 3. Mismatch (Should return 'false' or block access)
        const res3 = await fetch(LOCAL_HOST + '/cors-regex', {
            headers: { 'Origin': 'http://evil.com', 'Connection': 'close' }
        });
        assert.strictEqual(res3.headers.get('access-control-allow-origin'), 'false');

        await app.stop();
    });

    it('Should handle Credentials and Exposed Headers options', async () => {
        const app = new Nodecaf({
            conf: { 
                port: 80, 
                cors: { 
                    credentials: true, 
                    exposedHeaders: ['X-Custom-Header', 'X-Time'] 
                } 
            },
            routes: [ Nodecaf.get('/cors-creds', ({ res }) => res.end()) ]
        });
        await app.start();

        const res = await fetch(LOCAL_HOST + '/cors-creds', {
            headers: { 'Origin': 'http://site.com', 'Connection': 'close' }
        });

        assert.strictEqual(res.headers.get('access-control-allow-credentials'), 'true');
        // Note: fetch might normalize header values (spaces/commas)
        const exposed = res.headers.get('access-control-expose-headers');
        assert(exposed.includes('X-Custom-Header'));
        assert(exposed.includes('X-Time'));

        await app.stop();
    });

    it('Should handle custom Preflight (OPTIONS) configurations', async () => {
        const app = new Nodecaf({
            conf: { 
                port: 80, 
                cors: { 
                    // Custom preflight settings
                    maxAge: 3600,
                    allowedHeaders: ['X-Api-Key'],
                    methods: ['GET', 'POST']
                } 
            },
            routes: [ Nodecaf.get('/cors-opt', ({ res }) => res.end()) ]
        });
        await app.start();

        const res = await fetch(LOCAL_HOST + '/cors-opt', {
            method: 'OPTIONS',
            headers: { 
                'Origin': 'http://site.com',
                'Access-Control-Request-Method': 'POST',
                'Connection': 'close'
            }
        });

        assert.strictEqual(res.status, 204);
        assert.strictEqual(res.headers.get('access-control-max-age'), '3600');
        assert.strictEqual(res.headers.get('access-control-allow-headers'), 'X-Api-Key');
        assert.strictEqual(res.headers.get('access-control-allow-methods'), 'GET,POST');

        await app.stop();
    });

    it('Should properly append to an existing Vary header', async () => {
        const app = new Nodecaf({
            conf: { 
                port: 80, 
                // Force a specific origin so the CORS middleware sets "Vary: Origin"
                cors: { origin: 'http://site.com' } 
            },
            routes: [ 
                Nodecaf.get('/vary-test', ({ res }) => {
                    // 1. Read the current Vary header (set by CORS just moments ago)
                    const existing = res.get('vary') || '';

                    // 2. Append our new value instead of overwriting
                    const next = existing ? existing + ', Accept-Encoding' : 'Accept-Encoding';

                    // 3. Set the combined value
                    res.set('Vary', next);
                    res.end();
                }) 
            ]
        });
        await app.start();

        const res = await fetch(LOCAL_HOST + '/vary-test', {
            headers: { 'Origin': 'http://site.com', 'Connection': 'close' }
        });

        const vary = res.headers.get('vary');
        
        // Assertions will now pass because both values are present
        assert(vary.toLowerCase().includes('accept-encoding'));
        assert(vary.toLowerCase().includes('origin'));

        await app.stop();
    });

});

describe('Cookies', () => {

    it('Should parse HTTP cookies', () => {
        
        // --- Parse Tests ---
        // 1. Happy path
        assert.deepStrictEqual(parse('a=1; b=2'), { a: '1', b: '2' });

        // 2. Backtracking (skipping keys without values)
        assert.deepStrictEqual(parse('secure; foo=bar'), { foo: 'bar' });

        // 3. Duplicate keys (first wins)
        assert.deepStrictEqual(parse('a=1; a=2'), { a: '1' });

        // 4. Quoted values
        assert.deepStrictEqual(parse('a="b"'), { a: 'b' });

        // 5. Decoding
        assert.deepStrictEqual(parse('a=b%20c'), { a: 'b c' });

        // 6. Argument validation
        assert.throws(() => parse(123), TypeError);

        // 7. Trailing attributes/flags 
        // The parser encounters "secure", finds no "=", and breaks gracefully.
        assert.deepStrictEqual(parse('a=1; secure'), { a: '1' });
        
        // Alternatively, trailing spaces or garbage text also trigger this:
        assert.deepStrictEqual(parse('a=1;      '), { a: '1' });
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

describe('Other Features', function(){

    it('Should store data to be accessible to all handlers [app.global]', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            routes: [
                Nodecaf.post('/bar', ({ foo, res }) => {
                    res.text(foo);
                })
            ]
        });
        await app.start();
        app.global.foo = 'foobar';
        const res = await fetch(LOCAL_HOST + '/bar', { 
            method: 'POST',
            headers: { 'Connection': 'close' } 
        });
        const body = await res.text();
        assert.strictEqual(body, 'foobar');
        await app.stop();
    });

    it('Should delay server initialization by given milliseconds [conf.delay]', async function(){
        const app = new Nodecaf({
            conf: { delay: 1500, port: 80 },
            routes: [
                Nodecaf.get('/foobar', ({ res }) => res.end())
            ]
        });
        const ps = app.start();
        await new Promise(done => setTimeout(done, 400));
        await assert.rejects(fetch(LOCAL_HOST + '/foobar', { 
            signal: AbortSignal.timeout(200),
            headers: { 'Connection': 'close' } 
        }));
        await ps;
        const { status } = await fetch(LOCAL_HOST + '/foobar', { headers: { 'Connection': 'close' } });
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should fail when passing non-function server builders [conf.server]', () => {
        assert.throws(() => {
            new Nodecaf({ server: 'not-a-function' });
        }, TypeError);
    });

});
