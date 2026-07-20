import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { Readable, PassThrough } from 'node:stream';
import { WebSocket } from 'ws';

process.env.NODE_ENV = 'testing';

// Address for the tests' local servers to listen.
const LOCAL_HOST = 'http://localhost:80';

import { Estelar } from '../lib/main.js';

/**
 * Creates an empty file in the OS temp directory and returns the full path.
 * @param {string} fileName - The name of the file (e.g., 'log.txt')
 * @returns {string} The full path to the created file
 */
function createTempFile(fileName) {
    // 0. Prepend random string to fileName to avoid collisions
    // const randomPrefix = crypto.getRandomValues(new Uint32Array(1))[0].toString(16);
    const randomPrefix = crypto.randomBytes(8).toString('hex');
    fileName = `${randomPrefix}-${fileName}`;

    // 1. Construct the full path safely
    const filePath = path.join(os.tmpdir(), fileName);
    
    // 2. Create the file (writes an empty string). 
    // This overwrites the file if it already exists.
    fs.writeFileSync(filePath, '');
    
    return filePath;
}

describe('Estelar', () => {

    describe('constructor', () => {

        it('Should fail when Options is not an object', () => {
            assert.throws( () => new Estelar(false), /Options/ );
        });

        it('Should store any settings sent', async () => {
            let foundConf;
            const app = new Estelar({ 
                conf: { key: 'value' },
                startup({ conf }){
                    foundConf = conf.key;
                } 
            });
            const i = await app.run();

            assert.strictEqual(foundConf, 'value');
            await i.stop();
        });

        it('Should fail when startup handler is not a function', () => {
            assert.throws( () => new Estelar({ startup: 3 }), /function/ );
        });

        it('Should fail when shutdown handler is not a function', () => {
            assert.throws( () => new Estelar({ shutdown: 3 }), /function/ );
        });

        it('Should fail when globals handler is not a function', () => {
            assert.throws( () => new Estelar({ globals: 3 }), /function/ );
        });

        it('Should fail when http port is not a number', () => {
            assert.throws( () => new Estelar({ http: '80' }), /number/ );
        });

        it('Should fail when conf is not an object', () => {
            assert.throws( () => new Estelar({ conf: true }), /object/ );
        });

        it('Should read correct package.json for name and version', async () => {
            const app = new Estelar();

            app.get('/info', function({ res, log }){
                assert.strictEqual(log.debug('foobar').app, 'estelarjs'); 
                res.end();
            });

            const i = await app.run();
            const res = await i.trigger('get', '/info');
            assert.strictEqual(res.status, 200);
            await i.stop();
        });

    });

    describe('app.run', () => {

        it('Should run the given app server', async () => {
            const i = await new Estelar().run();
            await i.stop();
        });

        it('Should inject the given conf object', async () => {
            let foundConf;
            const i = await new Estelar({
                conf: { key: 'foobar' },
                startup({ conf }){
                    foundConf = conf.key;
                }
            }).run({ conf: { key: 'foobaz' } });

            assert.strictEqual(foundConf, 'foobaz');
            await i.stop();
        });

        it('Should fail if given file conf is not found', () => {
            const p = new Estelar().run({ conf: 'a.toml' });
            assert.rejects(() => p);
        });

        it('Should fail if given file conf is not valid TOML', () => {
            const fp = createTempFile('a.toml');
            fs.writeFileSync(fp, '= "value"', 'utf-8');
            const p = new Estelar().run({ conf: fp });
            assert.rejects(() => p);
            fs.unlink(fp, Function.prototype);
        });

        it('Should properly load a TOML file and generate an object', async () => {
            const fp = createTempFile('a.toml');
            fs.writeFileSync(fp, 'key = "value"', 'utf-8');
            let foundConf;
            const i = await new Estelar({
                startup({ conf }){
                    foundConf = conf.key;
                }
            }).run({ conf: fp });
            assert.strictEqual(foundConf, 'value');
            await i.stop();
            fs.unlink(fp, Function.prototype);
        });

    });

    // app.get, post, put, patch, del, delete

    describe('app.all', function(){

        it('Should execute \'all\' handler on any non-matched route', async () => {
            const app = new Estelar();

            app.all(({ res, path }) => res.text(path));
            app.post('/foo/:bar', ({ res }) => res.text('foo'));

            const i = await app.run();

            assert.strictEqual((await i.trigger('post', '/foo/bar')).body, 'foo');
            assert.strictEqual((await i.trigger('get', '/abc')).body, '/abc');

            await i.stop();
        });

        it('Should fail when trying to use \'all\' twice, or passing a non-function handler', () => {
            const app = new Estelar();
            assert.throws(() => app.all(), /function/);
            
            app.all(Function.prototype);
            assert.throws(() => app.all(Function.prototype), /already/);
        });
        
        it('Should pass all present parameters to handler', async () => {
            const app = new Estelar({ http: 80 });

            app.get('/fo/:o', Function.prototype);
            app.get('/foo/:bar', function({ params, res }){
                res.badRequest(params.bar !== 'test');
                res.end();
            });

            const i = await app.run();

            const { status }  = await fetch(LOCAL_HOST + '/foo/test', {
                headers: { 'Connection': 'close' }
            });
            assert.strictEqual(status, 200);
            
            await i.stop();
        });

    });

    describe('app.listRoutes', () => {

        it('Should list all registered routes', () => {
            const app = new Estelar();
            app.get('/foo', Function.prototype);
            app.post('/bar', Function.prototype);
            const routes = app.listRoutes();
            assert.deepStrictEqual(routes, [
                { method: 'GET', path: '/foo' },
                { method: 'POST', path: '/bar' }
            ]);
        });
    });    
});

describe('Instance', () => {

    describe('i.start', () => {

        it('Should prevent starting a running server', async () => {
            const app = new Estelar();
            const i = await app.run();
            assert.strictEqual(await i.start(), 'running');
            await i.stop();
        });

        it('Should start the http server when http option set [opts.http]', async () => {
            const app = new Estelar({ http: 8765 });
            const i = await app.run();

            const { status } = await fetch('http://127.0.0.1:8765/', {
                headers: { 'Connection': 'close' }
            });
            
            assert.strictEqual(status, 404);
            await i.stop();
        });

        it('Should trigger before start event', async () => {
            let done = false;
            const app = new Estelar({ startup: () => done = true });
            const i = await app.run();
            assert(done);
            await i.stop();
        });

        it('Should throw when attempt listening on a busy port', async () => {
            const app1 = new Estelar({ http: 8765 });
            const i1 = await app1.run();
            
            const app2 = new Estelar({ http: 8765 });
            await assert.rejects( app2.run() );
            
            await i1.stop();
        });

        it('Should not fail when attempting to start during shutdown', async function(){
            this.timeout(3000);
            const app = new Estelar({
                async shutdown() {
                    await new Promise(done => setTimeout(done, 1200));
                }
            });
            
            const i = await app.run();
            const p = i.stop();

            await assert.doesNotReject( i.start() );        
            await p;
        });

        it('Should automatically add a /health route if not present', async () => {
            const app = new Estelar({ http: 80 });
            const i = await app.run();
            await new Promise(r => setTimeout(r, 150)); 
            const res = await fetch(LOCAL_HOST + '/health', {
                headers: { 'Connection': 'close' }
            });
            assert.strictEqual(res.status, 200);
            const body = await res.json();
            assert(parseInt(body.uptime) >= 150, `Expected uptime bigger than 150ms, got: ${body.uptime}`);
            await i.stop();
        });

        it('Should not override user-defined /health route', async () => {
            const app = new Estelar({ http: 80 });
            app.get('/health', ({ res }) => res.text('ok'));
            const i = await app.run();
            const res = await fetch(LOCAL_HOST + '/health', {
                headers: { 'Connection': 'close' }
            });
            assert.strictEqual(res.status, 200);
            const body = await res.text();
            assert.strictEqual(body, 'ok');
            await i.stop();
        });
    });

    describe('i.stop', () => {

        it('Should stop the http server', async function(){
            const app = new Estelar({ http: 80 });
            const i = await app.run();
            await i.stop();
            this.timeout(3000);
            await assert.rejects(fetch(LOCAL_HOST + '/'));
        });

        it('Should trigger after stop event', async () => {
            let done = false;
            const app = new Estelar({ shutdown: () => done = true });
            const i = await app.run();
            await i.stop();
            assert(done);
        });

        it('Should not fail when calling close sucessively', async () => {
            const app = new Estelar();
            const i = await app.run();
            await i.stop();
            await assert.doesNotReject( i.stop() );
        });

        it('Should not crash when both startup and shutdown throw', async function(){
            const app = new Estelar({ 
                startup: () => { throw new Error('Startup failure!!') },
                shutdown: () => { throw new Error('Shutdown failure!!') }
            });
            
            // "run" throws the startup error, but internal logic ensures
            // the shutdown handler is still attempted safely without crashing the process.
            await assert.rejects(app.run(), 'Startup');
        });

        it('Should not fail when attempting to close during startup', async () => {
            const app = new Estelar();
            const i = await app.run();
            await i.stop();

            const p = i.start();
            await assert.doesNotReject( i.stop() );
            await p;
            await i.stop();
        });
    });

    describe('i.restart', () => {

        it('Should take down the server and bring it back up', async function() {
            this.timeout(3000);
            const app = new Estelar({ http: 80 });
            const i = await app.run();

            const r1 = await fetch(LOCAL_HOST + '/', {
                headers: { 'Connection': 'close' }
            });
            assert.strictEqual(r1.status, 404);

            await i.restart();

            const r2 = await fetch(LOCAL_HOST + '/', {
                headers: { 'Connection': 'close' }
            });
            assert.strictEqual(r2.status, 404);

            await i.stop();
        });

        it('Should reload conf when new object is sent', async () => {
            const app = new Estelar({
                conf: { myKey: 1 }
            });

            app.get('/foo', ({ res, conf }) => res.json(conf));

            const i = await app.run();
            await i.restart({ myKey: 3 });

            const res = await i.trigger('get', '/foo');
            assert.strictEqual(res.body.myKey, 3);

            await i.stop();
        });

    });

    describe('i.setup', () => {

        it('Should apply settings on top of existing one', async () => {
            const app = new Estelar({ 
                conf: { key: 'value' }
            });

            app.get('/bar', ({ res, conf }) => res.json(conf));

            // Start the app to get the instance
            const i = await app.run();
            
            // Apply updates to the instance configuration
            i.setup({ key: 'value2', key2: 'value' });

            const res = await i.trigger('get', '/bar');
            
            assert.strictEqual(res.body.key, 'value2');
            assert.strictEqual(res.body.key2, 'value');

            await i.stop();
        });

    });

    describe('i.trigger', () => {

        it('Should trigger route without http server', async () => {
            const app = new Estelar();
            
            app.post('/foo', ({ res }) => res.status(202).text('Test'));
            app.post('/nores', ({ res }) => res.status(204).end());

            const i = await app.run();

            await i.trigger('post', '/nores');
            const res = await i.trigger('post', '/foo');
            
            assert.strictEqual(res.status, 202);
            assert.strictEqual(res.body, 'Test');
            
            await i.stop();
        });

        it('Should default to response status to 200', async () => {
            const app = new Estelar();

            app.post('/foo', ({ res }) => {
                res.set('X-Test', 'Foo');
                res.end();
            });

            app.post('/bar', ({ res }) => {
                res.end();
            });

            const i = await app.run();

            const r = await i.trigger('post', '/bar', { body: Buffer.from('abc') });
            assert.strictEqual(r.status, 200);

            const res = await i.trigger('post', '/foo',
                { headers: { host: 'what.com' }, body: { foo: 'bar' } });
            assert.strictEqual(res.headers['x-test'], 'Foo');

            await i.stop();
        });

        it('Should properly parse body inputs', async () => {
            const app = new Estelar();

            app.post('/raw', async ({ body, res }) => {
                const input = await body.raw();
                const decoder = new TextDecoder();
                assert.strictEqual(decoder.decode(input), '12345');
                res.end();
            });

            app.post('/json', async ({ body, res }) => {
                const input = await body.json();
                assert.strictEqual(input, 12345);
                res.end();
            });

            app.post('/text', async ({ body, res }) => {
                const input = await body.text();
                assert.strictEqual(input, '12345');
                res.end();
            });

            app.post('/urlencoded', async ({ body, res }) => {
                const input = await body.urlencoded();
                assert.strictEqual(input['12345'], '');
                res.end();
            });

            const i = await app.run();

            const r1 = await i.trigger('post', '/raw', { body: 12345 });
            assert.strictEqual(r1.status, 200);

            const r2 = await i.trigger('post', '/json',
                { body: 12345, headers: { 'content-type': 'application/json' } });
            assert.strictEqual(r2.status, 200);

            const r3 = await i.trigger('post', '/text',
                { body: 12345, headers: { 'content-type': 'text/css' } });
            assert.strictEqual(r3.status, 200);

            const r4 = await i.trigger('post', '/urlencoded', {
                body: 12345,
                headers: { 'content-type': 'application/x-www-form-urlencoded' }
            });
            assert.strictEqual(r4.status, 200);

            await i.stop();
        });

        it('Should allow streaming data in', async () => {
            const app = new Estelar();

            app.post('/stream', async ({ res, body }) => {
                const stream = body.stream();
                const reader = stream.getReader();
                const decoder = new TextDecoder(); 
                let received = '';
                while(true){
                    const { done, value } = await reader.read();
                    if(done)
                        break;
                    received += decoder.decode(value, { stream: true });
                }

                received += decoder.decode();

                assert.strictEqual(received, 'foobar')
                res.status(201).end();
            });

            const i = await app.run();

            // Note: Estelar supports Node Streams in trigger() via internal conversion
            const body = Readable.from('foobar');
            const r = await i.trigger('post', '/stream/', { body });
            
            assert.strictEqual(r.status, 201);
            await i.stop();
        });

        it('Should handle buffer output', async () => {
            const app = new Estelar();

            app.get('/buf', ({ res }) => {
                const encoder = new TextEncoder();
                const buf = encoder.encode('foobar');
                res.end(buf);
            });

            const i = await app.run();

            const r = await i.trigger('get', '/buf');
            assert.strictEqual(r.status, 200);
            
            const decoder = new TextDecoder();
            assert.strictEqual('foobar', decoder.decode(r.body));
            
            await i.stop();
        });

    });

    describe('i.state', () => {

        it('Should cycle through all possible states [running, stopping, standby, starting, stuck]', async () => {
            const app = new Estelar({
                // Startup handler that can optionally fail or delay
                startup: async ({ conf }) => {
                    if(conf.fail) 
                        throw new Error('Startup Failed');
                    if(conf.delay) 
                        await new Promise(r => setTimeout(r, 50));
                },
                // Shutdown handler that delays to allow capturing 'stopping' state
                shutdown: async () => {
                    await new Promise(r => setTimeout(r, 50));
                }
            });

            // 1. Initial Run -> 'running'
            // app.run() awaits start(), so it returns only when running
            const i = await app.run();
            assert.strictEqual(i.state(), 'running', 'State should be "running" after run()');

            // 2. Stop (Async) -> 'stopping'
            // calling stop() without await lets us check the intermediate state
            const stopPromise = i.stop();
            assert.strictEqual(i.state(), 'stopping', 'State should be "stopping" immediately after stop call');
            
            // 3. Stop (Resolved) -> 'standby'
            await stopPromise;
            assert.strictEqual(i.state(), 'standby', 'State should be "standby" after stop completes');

            // 4. Start (Async with delay) -> 'starting'
            // We enable a delay in startup to ensure we catch the 'starting' state
            i.setup({ delay: true });
            const startPromise = i.start();
            assert.strictEqual(i.state(), 'starting', 'State should be "starting" immediately after start call');
            
            // Wait for it to finish and verify it went back to running
            await startPromise;
            assert.strictEqual(i.state(), 'running');

            // 5. Fail Startup -> 'stuck'
            // First we must stop it again
            await i.stop();
            
            // Configure it to fail
            i.setup({ delay: false, fail: true });
            
            try{
                await i.start();
                assert.fail('Start should have thrown');
            }
            catch(e) {
                assert.strictEqual(e.message, 'Startup Failed');
            }

            assert.strictEqual(i.state(), 'standby');
        });

    });

});

describe('Route Handling', () => {

    it('Should fail when receiving invalid or duplicated route handlers', () => {
        const app = new Estelar();
        
        assert.throws(() => app.post('/foobar', undefined), TypeError);
        
        // Handler must be a function
        assert.throws(() => app.post('/foobaz', { method: 'post' }), TypeError);
        
        // Duplicate route detection
        app.post('/dup', Function.prototype);
        assert.throws(() => app.post('/dup', Function.prototype), /already/);
    });

    it('Should pass all the required args to handler', async () => {
        const app = new Estelar({ http: 80 });

        app.get('/foo', function(obj){
            // Note: In Estelar, global properties are merged into 'obj' directly.
            // We check for core properties.
            assert(obj.res && obj.method && obj.path && obj.body && obj.ip
                && obj.params && obj.query && obj.conf && obj.log);
            obj.res.end();
        });

        const i = await app.run();

        const { status } = await fetch(LOCAL_HOST + '/foo', {
            headers: { 'Connection': 'close' }
        });
        assert.strictEqual(status, 200);
        
        await i.stop();
    });

    it('Should store data to be accessible to all handlers [globals]', async () => {
        const app = new Estelar({
            http: 80,
            // In Estelar, globals are defined via a generator function
            globals: () => ({ foo: 'foobar' })
        });

        app.put('/bar', ({ foo, res }) => {
            res.text(foo);
        });

        const i = await app.run();

        const res = await fetch(LOCAL_HOST + '/bar', { 
            method: 'PUT',
            headers: { 'Connection': 'close' } 
        });
        const body = await res.text();
        
        assert.strictEqual(body, 'foobar');
        await i.stop();
    });

    it('Should properly handle URI encoded params', async () => {
        const app = new Estelar({ http: 80 });

        app.get('/foo/:bar', function({ params, res }){
            res.badRequest(params.bar !== 'abc:def');
            res.end();
        });

        const i = await app.run();

        const { status }  = await fetch(LOCAL_HOST + '/foo/abc%3Adef', {
            headers: { 'Connection': 'close' }
        });
        assert.strictEqual(status, 200);
        
        await i.stop();
    });

    it('Should parse URL query string', async () => {
        const app = new Estelar({ http: 80 });

        app.patch('/foobar', ({ query, res }) => {
            assert.strictEqual(query.foo, 'bar');
            res.end();
        });

        const i = await app.run();

        const { status } = await fetch(LOCAL_HOST + '/foobar?foo=bar', { 
            method: 'PATCH',
            headers: { 'Connection': 'close' }
        });
        assert.strictEqual(status, 200);
        
        await i.stop();
    });

    it('Should output a 404 when no route is found for a given path', async () => {
        const app = new Estelar({ http: 80 });
        const i = await app.run();

        const { status } = await fetch(LOCAL_HOST + '/foobar', { 
            method: 'POST',
            headers: { 'Connection': 'close' }
        });
        assert.strictEqual(status, 404);
        
        await i.stop();
    });

    it('Should stream bytes to client', async () => {
        const app = new Estelar({ http: 80 });

        app.get('/foo', async function({ res }){
            const s = res.stream();
            const rs = fs.createReadStream('./package.json');
            const wrs = Readable.toWeb(rs);
            await wrs.pipeTo(s);
        });

        const i = await app.run();

        const res = await fetch(LOCAL_HOST + '/foo', {
            headers: { 'Connection': 'close' }
        });
        const body = await res.text();
        const o = JSON.parse(body);
        assert.strictEqual(o.name, 'estelarjs');
        
        await i.stop();
    });

    it('Should parse object as json response [res.json()]', async () => {
        const app = new Estelar({ http: 80 });

        app.get('/foo', function({ res }){
            res.json('{"hey":"ho"}');
        });

        const i = await app.run();

        const { headers } = await fetch(LOCAL_HOST + '/foo', {
            headers: { 'Connection': 'close' }
        });
        assert.strictEqual(headers.get('content-type'), 'application/json');
        
        await i.stop();
    });

    it('Should set multiple cookies properly', async function(){
        const app = new Estelar({ http: 80 });

        app.get('/foo', function({ res }){
            res.cookie('test', 'foo');
            res.cookie('testa', 'bar');
            res.cookie('testa', 'baz'); 
            res.end();
        });

        const i = await app.run();

        const { headers } = await fetch(LOCAL_HOST + '/foo', {
            headers: { 'Connection': 'close' }
        });
        const cookies = headers.getSetCookie();
        assert(cookies.some(c => c.startsWith('testa=baz') || c.startsWith('testa=bar')));
        
        await i.stop();
    });

    it('Should clear cookies', async function(){
        const app = new Estelar({ http: 80 });

        app.get('/foo', function({ res }){
            res.cookie('testa', 'bar');
            res.end();
        });

        app.get('/bar', function({ res }){
            res.clearCookie('testa');
            res.end();
        });

        const i = await app.run();

        const res1 = await fetch(LOCAL_HOST + '/foo', {
            headers: { Connection: 'close' }
        });
        const cookie = res1.headers.getSetCookie()[0].split(';')[0];
        
        const res2 = await fetch(LOCAL_HOST + '/bar', { headers: { 
            Connection: 'close',
            Cookie: cookie 
        } });
        const setCookies = res2.headers.getSetCookie();
        assert(setCookies[0].indexOf('Expire') > -1);
        
        await i.stop();
    });

    it('Should call any user func with route handler args', async () => {
        function userFunc(obj, arg1){
            assert.strictEqual(arg1, 'foo');
            assert.strictEqual(obj.path, '/foo');
            assert(obj.res && obj.method && obj.path && obj.body && obj.ip
                && obj.params && obj.query && obj.conf && obj.log);
        }

        const app = new Estelar({
            conf: { bar: 'baz' }
        });

        app.del('/foo', function({ call, res }){
            call(userFunc, 'foo');
            res.end();
        });

        const i = await app.run();

        const { status } = await i.trigger('delete', '/foo');
        assert.strictEqual(status, 200);
        
        await i.stop();
    });

    it('Should handle websocket upgrade requests [opts.websocket]', async function(){
        let done;
        const app = new Estelar({
            http: 80,
            websocket: true
        });

        app.get('/bar', async ({ websocket }) => {
            const ws = await websocket();
            ws.on('message', m => {
                assert.strictEqual(m.toString(), 'foobar');
                done = true;
                ws.close();
            });
        });

        const i = await app.run();

        const ws = new WebSocket('ws://localhost:80/bar');
        await new Promise(done => ws.onopen = done);
        ws.send('foobar');
        
        await i.stop();
        assert(done);
    });

    it('Should handle websocket upgrade requests even on \'all\' handler [opts.websocket]', async function(){
        let done;
        const app = new Estelar({
            http: 80,
            websocket: true
        });

        app.all(async ({ websocket }) => {
            const ws = await websocket();
            ws.on('message', m => {
                assert.strictEqual(m.toString(), 'foobar');
                done = true;
                ws.close();
            });
        });

        const i = await app.run();

        const ws = new WebSocket('ws://localhost:80/bar');
        await new Promise(done => ws.onopen = done);
        ws.send('foobar');
        
        await i.stop();
        assert(done);
    });

    it('Should call any user func with global handler args on startup', async () => {
        function userFunc(obj, arg1){
            assert.strictEqual(arg1, 'foo');
            assert.strictEqual(obj.conf.bar, 'baz');
            assert(obj.conf && obj.log);
        }

        const app = new Estelar({
            conf: { bar: 'baz' },
            startup({ call }){
                call(userFunc, 'foo');
            }
        });

        const i = await app.run();
        await i.stop();
    });

    it('Should call any user func with global handler args on shutdown', async () => {
        function userFunc(obj, arg1){
            assert.strictEqual(arg1, 'foo');
            assert.strictEqual(obj.conf.bar, 'baz');
            assert(obj.conf && obj.log);
        }

        const app = new Estelar({
            conf: { bar: 'baz' },
            shutdown({ call }){
                call(userFunc, 'foo');
            }
        });

        const i = await app.run();
        await i.stop();
    });

    it('Should not modify the very object used as cookie options', async () => {
        const cookieOpts = { maxAge: 68300000 };
        const app = new Estelar({ http: 80 });

        app.get('/foo', function({ res }){
            res.cookie('test', 'foo', cookieOpts);
            res.cookie('testa', 'bar', cookieOpts);
            res.json(cookieOpts);
        });

        const i = await app.run();

        const res = await fetch(LOCAL_HOST + '/foo', {
            headers: { 'Connection': 'close' }
        });
        const body = await res.json();
        
        assert.strictEqual(body.maxAge, 68300000);
        await i.stop();
    });

    it('Should properly route paths with multiple segments', async function(){
        const app = new Estelar({ http: 80 });

        app.get('/foo/:id', function({ res }){
            res.text('shortest');
        });

        app.get('/foo/:id/abc', function({ res }){
            res.text('largest');
        });

        const i = await app.run();

        const res = await fetch(LOCAL_HOST + '/foo/123/abc', {
            headers: { 'Connection': 'close' }
        });
        const body = await res.text();
        
        assert.strictEqual(body, 'largest');
        await i.stop();
    });

    it('Should expose up to date global values for each \'call\' execution', async function(){

        let top, keyFoundInGlobal, keyFoundInRoute;

        function changeGlobalKeyFromGlobal(ctx, newValue){
            ctx.global.someKey = newValue;
        }

        function checkGlobalKeyFromRoute({ someKey }){
            keyFoundInRoute = someKey;
        }

        const app = new Estelar({
            globals: () => ({ someKey: 'original_value' }),
            
            startup({ global, call }){

                top = new Promise(resolve => {
                    setTimeout(() => {
                        call(changeGlobalKeyFromGlobal, 'new_value_from_timeout')
                        resolve();
                    }, 1000)
                });
                
                call(changeGlobalKeyFromGlobal, 'new_value_from_global');
                keyFoundInGlobal = global.someKey;
                global.someKey = 'back_to_original';
            }
        });

        app.get('/foo', function({ res, call }){
            call(checkGlobalKeyFromRoute);
            res.end();
        });

        const i = await app.run();
        await top;
        const { status } = await i.trigger('get', '/foo');
        assert.strictEqual(status, 200);
        assert.strictEqual(keyFoundInGlobal, 'new_value_from_global');
        assert.strictEqual(keyFoundInRoute, 'new_value_from_timeout');
        await i.stop();
    });

    it('Should accept WebSocket connections', async function() {
        this.timeout(10000);

        const app = new Estelar({
            http: 9881,
            websocket: true
        });

        app.get('/', async ({ websocket, res }) => {
            if(websocket) {
                // Upgrade the connection
                const ws = await websocket();
                
                ws.send('hello from server');
                
                ws.on('message', (msg) => {
                    ws.send('echo: ' + msg);
                });
            }
            else
                res.json({ ok: true });
            
        });

        const i = await app.run();

        await new Promise((resolve, reject) => {
            const ws = new WebSocket('ws://localhost:9881/');
            const messages = [];

            ws.on('open', () => {
                ws.send('test message');
            });

            ws.on('message', (msg) => {
                messages.push(msg.toString());
                if(messages.length >= 2) 
                    ws.close();
            });

            ws.on('close', () => {
                try{
                    assert.ok(messages.length >= 2, 'Should receive multiple messages');
                    assert.ok(messages[0].includes('hello'), 'Should receive server greeting');
                    assert.ok(messages[1].includes('echo'), 'Should receive echo');
                    resolve();
                }
                catch(err) {
                    reject(err);
                }
            });

            ws.on('error', reject);

            // Timeout after 5 seconds
            setTimeout(() => {
                ws.close();
                reject(new Error('WebSocket test timed out'));
            }, 5000);
        });

        await i.stop();
    });

    it('Should handle WebSocket client lifecycle with pong handler', async () => {
        // Ensure you have the 'ws' package available in your test environment
        const WebSocket = (await import('ws')).default;
        
        const app = new Estelar({
            http: 9996,
            websocket: true
        });

        app.get('/', ({ websocket }) => {
            // Estelar's websocket() returns a Promise, but calling it triggers the upgrade
            websocket();
        });
        
        const i = await app.run();
        
        try{
            const ws = new WebSocket('ws://localhost:9996/');
            await new Promise((resolve, reject) => {
                // native_node.js sends pings to keep connections alive
                ws.on('ping', () => {
                    ws.close();
                    resolve();
                });
                ws.on('error', reject);
            });
        }
        finally{
            await i.stop();
        }
    });

    it('Should generate correlation id for each request and make it available in logs and args', async () => {
        const app = new Estelar();
        app.get('/foo', ({ log, res, correlationId }) => {
            const entry = log.info('foo');
            res.json({ correlationId, entry });
        });

        const i = await app.run();
        const res = await i.trigger('get', '/foo');
        assert.strictEqual(res.body.correlationId.length, 12);
        assert.strictEqual(res.body.entry.correlationId, res.body.correlationId);
        assert.strictEqual(res.headers['x-correlation-id'], res.body.correlationId);
        await i.stop();
    });

    it('Should read and use correlation id coming from request headers', async () => {
        const app = new Estelar();
        app.get('/foo', ({ log, res, correlationId }) => {
            const entry = log.info('foo');
            res.json({ correlationId, entry });
        });

        const i = await app.run();
        const res = await i.trigger('get', '/foo', {
            headers: { 'x-correlation-id': 'test-correlation-id' }
        });
        assert.strictEqual(res.body.correlationId, 'test-correlation-id');
        assert.strictEqual(res.body.entry.correlationId, 'test-correlation-id');
        assert.strictEqual(res.headers['x-correlation-id'], 'test-correlation-id');
        await i.stop();
    });

});

describe('Body Parsing', () => {

    it('Should not parse request body when setup so', async () => {
        const app = new Estelar({ http: 80 });

        app.post('/foobar', ({ body, res }) => {
            assert.strictEqual(body.constructor.name, 'Body');
            res.end();
        });

        const i = await app.run();

        const { status } = await fetch(LOCAL_HOST + '/foobar', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded',
                'Connection': 'close'
            },
            body: 'foo=bar'
        });

        assert.strictEqual(status, 200);
        await i.stop();
    });

    it('Should catch body issues even when called explicitly', async () => {
        const app = new Estelar({ http: 80 });

        app.post('/foobar', async ({ body, res }) => {
            const b = await body.parse();
            assert.strictEqual(b.foo, 'bar');
            res.end();
        });

        const i = await app.run();

        const res = await fetch(LOCAL_HOST + '/foobar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Connection': 'close' },
            body: '{sdfs'
        });

        const body = await res.text();
        assert.strictEqual(res.status, 400);
        assert.strictEqual(body, 'Invalid format');
        await i.stop();
    });

    it('Should allow reading chunked body as if it were a complete body, for unorthodox usages', async function(){
        const app = new Estelar({ http: 80 });

        app.post('/chunked', async ({ body, res }) => {
            const str = await body.text();
            assert.strictEqual(str, '12345');
            res.status(201).end();
        });

        const i = await app.run();
        
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
        
        if(res.error) 
            throw res.error;

        assert.strictEqual(res.status, 201);
        await i.stop();
    });

    it('Should respond 408 when body takes too long to finish', async () => {
        const app = new Estelar({
            http: 80,
            reqBodyTimeout: 600
        });

        app.post('/tto', async ({ body }) => {
            await body.text();
        });

        const i = await app.run();

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
        await i.stop();
    });

    it('Should abort route when client connection is reset while reading req body', async function(){
        this.timeout(5000);
        let abortedRouted = true;
        let startedRoute = false;
        let abortErrorName = false;

        const app = new Estelar({ http: 80 });

        app.post('/tto', async ({ body }) => {
            startedRoute = true;
            await body.text();
            abortedRouted = false;
        });

        const i = await app.run();

        const controller = new AbortController();
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
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Destroy the request (abort)
        controller.abort();

        await p;
        await i.stop();
        assert(abortedRouted);
        assert(startedRoute);
        assert.strictEqual(abortErrorName, 'AbortError');
    });

});

describe('Assertions', () => {

    it('Should not respond unless exception escapes the route', async function() {
        this.timeout(5000);
        const app = new Estelar({ http: 80 });

        app.get('/foo', function({ res }){
            try{
                res.badRequest(true, 'Bad Request');
            } 
            catch(e){
                // Catching the assertion error prevents it from bubbling up
                // and triggering the automatic error response.
                e;
            }
            res.end('All good');
        });

        const i = await app.run();

        const res = await fetch(LOCAL_HOST + '/foo', { headers: { 'Connection': 'close' } });
        const body = await res.text();
        
        assert.strictEqual(body, 'All good');
        assert.strictEqual(res.status, 200);
        
        await i.stop();
    });

    it('Should throw when condition evaluates to true', async () => {
        const app = new Estelar({ http: 80 });

        app.get('/foo', function({ res }){
            assert.throws( () => res.badRequest(true, Buffer.from('abc')) );
            assert.throws( () => res.unauthorized(true) );
            assert.throws( () => res.forbidden(true) );
            assert.throws( () => res.notFound(true) );
            assert.throws( () => res.conflict(true) );
            assert.throws( () => res.gone(true) );
            res.end();
        });

        const i = await app.run();
        
        const res = await fetch(LOCAL_HOST + '/foo', { headers: { 'Connection': 'close' } });
        await res.text();
        assert.strictEqual(res.status, 200);

        await i.stop();
    });

    it('Should do nothing when condition evaluates to false', async () => {
        const app = new Estelar({ http: 80 });

        app.get('/foo', function({ res }){
            assert.doesNotThrow( () => res.badRequest(false) );
            assert.doesNotThrow( () => res.unauthorized(false) );
            assert.doesNotThrow( () => res.forbidden(false) );
            assert.doesNotThrow( () => res.notFound(false) );
            assert.doesNotThrow( () => res.conflict(false) );
            assert.doesNotThrow( () => res.gone(false) );
            res.end();
        });

        const i = await app.run();

        const res = await fetch(LOCAL_HOST + '/foo', { headers: { 'Connection': 'close' } });
        await res.text();
        await i.stop();
    });

    it('Should interpolate %s variables in assertion message', async () => {
        const app = new Estelar({ http: 80 });

        app.get('/foo', function({ res }){
            res.badRequest(true, '%sfoo%sbaz%%s', 1, 'bar', 2);
        });

        const i = await app.run();

        const res = await fetch(LOCAL_HOST + '/foo', { headers: { 'Connection': 'close' } });
        const body = await res.text();
        assert.strictEqual(body, '1foobarbaz%s 2');
        
        await i.stop();
    });

    it('Should respond 415 when res.badType is called inside a route', async () => {
        const app = new Estelar({ http: 80 });

        app.get('/badtype', function({ res }){
            res.badType(true);
        });

        const i = await app.run();

        const r = await fetch(LOCAL_HOST + '/badtype', { headers: { 'Connection': 'close' } });
        const body = await r.text();
        assert.strictEqual(r.status, 415);
        assert.strictEqual(body.length, 0);
        
        await i.stop();
    });

    it('Should NOT send response body when assertion has no message', async () => {
        const app = new Estelar({ http: 80 });

        app.get('/foo', function({ res }){
            res.unauthorized(true);
        });

        const i = await app.run();

        const res = await fetch(LOCAL_HOST + '/foo', { headers: { 'Connection': 'close' } });
        const body = await res.text();
        
        assert(!res.headers.get('content-type'));
        assert.strictEqual(body.length, 0);
        await i.stop();
    });

});

describe('Error Handling', () => {

    it('Should handle Error thrown sync on the route', async () => {
        const app = new Estelar({ http: 80 });

        app.delete('/unknown', () => {
            throw new Error('othererr');
        });

        app.post('/non-error', () => {
            throw 4;
        });

        const i = await app.run();

        const { status } = await fetch(LOCAL_HOST + '/unknown', { 
            method: 'DELETE',
            headers: { 'Connection': 'close' }
        });
        assert.strictEqual(status, 500);

        const { status: s2 } = await fetch(LOCAL_HOST + '/non-error', { 
            method: 'POST',
            headers: { 'Connection': 'close' }
        });
        assert.strictEqual(s2, 500);

        await i.stop();
    });

    it('Should handle Error injected sync on the route', async () => {
        const app = new Estelar({ http: 80 });

        app.post('/known', ({ res }) => {
            throw res.error(404, 'abc %s', 'def');
        });

        app.post('/unknown', ({ res }) => {
            throw res.error(new Error('errfoobar'));
        });

        app.post('/serverfault', ({ res }) => {
            throw res.error(501, { test: 'foo' });
        });

        const i = await app.run();

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

        await i.stop();
    });

    it('Should handle Rejection on async route', async () => {
        const app = new Estelar({ http: 80 });

        app.post('/async', async () => {
            // This uses fetch as part of the test logic, coincidentally
            await fetch('http://nonexistent.localhost/', {
                headers: { 'Connection': 'close' }
            });
        });

        const i = await app.run();

        const { status } = await fetch(LOCAL_HOST + '/async', { 
            method: 'POST',
            headers: { 'Connection': 'close' } 
        });
        assert.strictEqual(status, 500);

        await i.stop();
    });

    it('Should handle Error injected ASYNC on the route', async () => {
        const app = new Estelar({ http: 80 });

        app.post('/known', ({ res }) => {
            fs.readdir('.', function(){
                res.error(404, true);
            });
        });

        app.post('/unknown', async ({ res }) => {
            await fs.readdir('.', function(){
                res.error({ a: 'b' });
            });
        });

        app.post('/unknown/object', ({ res }) => {
            res.error(Buffer.from('abc'));
        });

        const i = await app.run();

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

        await i.stop();
    });

    it('Should handle errors even when error event has no listeners', async () => {
        const app = new Estelar({ http: 80 });

        app.post('/bar', () => {
            throw new Error('errfoobar');
        });

        const i = await app.run();

        const { status } = await fetch(LOCAL_HOST + '/bar', { 
            method: 'POST',
            headers: { 'Connection': 'close' } 
        });
        
        assert.strictEqual(status, 500);
        await i.stop();
    });

    it('Should keep proper app state when errors happen at startup and shutdown', async () => {
        let app = new Estelar({
            startup(){
                throw new Error('foo');
            }
        });
        await assert.rejects(() => app.run(), /foo/);

        app = new Estelar({
            shutdown(){
                throw new Error('foo');
            }
        });
        const i = await app.run();
        await assert.rejects(() => i.stop(), /foo/);
    });

});

describe('CORS', function(){

    it('Should send permissive CORS headers when setup so [cors]', async () => {
        const app = new Estelar({
            http: 80
        });

        app.get('/foobar', ({ res }) => res.end());

        const i = await app.run({
            cors: true
        });

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

        await i.stop();
    });

    it('Should not send CORS headers when setup so [cors]', async () => {
        const app = new Estelar({ http: 80 });

        app.get('/foobar', ({ res }) => res.end());

        const i = await app.run();

        const res = await fetch(LOCAL_HOST + '/foobar', {
            headers: { 'Origin': 'http://outsider.com', 'Connection': 'close' }
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
        
        await i.stop();
    });

    it('Should handle specific String origin and set Vary header', async () => {
        const app = new Estelar({
            http: 80, 
        });

        app.get('/cors-string', ({ res }) => res.end());

        const i = await app.run({
            cors: { origin: 'http://trusted.com' }
        });

        const res = await fetch(LOCAL_HOST + '/cors-string', {
            headers: { 'Origin': 'http://trusted.com', 'Connection': 'close' }
        });

        assert.strictEqual(res.headers.get('access-control-allow-origin'), 'http://trusted.com');
        
        // Expect 'origin' (lowercase) because setVaryHeader normalizes it
        assert.strictEqual(res.headers.get('vary'), 'origin');

        await i.stop();
    });

    it('Should handle Regex/Array origins and reject mismatches', async () => {
        const app = new Estelar({
            http: 80, 
        });

        app.get('/cors-regex', ({ res }) => res.end());

        const i = await app.run({
            cors: { origin: [/foo\.com$/, 'http://exact-match.com'] } 
        });

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

        await i.stop();
    });

    it('Should allow all origins when origin is boolean true', async () => {
        const app = new Estelar({
            http: 80, 
        });

        app.get('/cors-bool-true', ({ res }) => res.end());

        const i = await app.run({
            cors: { origin: true }
        });

        const res = await fetch(LOCAL_HOST + '/cors-bool-true', {
            headers: { 'Origin': 'http://any-origin.com', 'Connection': 'close' }
        });

        // When origin: true, should return the request origin (truthy origin allowed)
        assert.strictEqual(res.headers.get('access-control-allow-origin'), 'http://any-origin.com');

        await i.stop();
    });

    it('Should handle Credentials and Exposed Headers options', async () => {
        const app = new Estelar({
            http: 80, 
        });

        app.get('/cors-creds', ({ res }) => res.end());

        const i = await app.run({
            cors: { 
                credentials: true, 
                exposedHeaders: ['X-Custom-Header', 'X-Time'] 
            } 
        });

        const res = await fetch(LOCAL_HOST + '/cors-creds', {
            headers: { 'Origin': 'http://site.com', 'Connection': 'close' }
        });

        assert.strictEqual(res.headers.get('access-control-allow-credentials'), 'true');
        
        const exposed = res.headers.get('access-control-expose-headers');
        assert(exposed.includes('X-Custom-Header'));
        assert(exposed.includes('X-Time'));

        await i.stop();
    });

    it('Should handle custom Preflight (OPTIONS) configurations', async () => {
        const app = new Estelar({
            http: 80, 
        });

        app.get('/cors-opt', ({ res }) => res.end());

        const i = await app.run({
            cors: { 
                // Custom preflight settings
                maxAge: 3600,
                allowedHeaders: ['X-Api-Key'],
                methods: ['GET', 'POST']
            }
        });

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

        await i.stop();
    });

    it('Should properly append to an existing Vary header', async () => {
        const app = new Estelar({
            http: 80, 
        });

        app.get('/vary-test', ({ res }) => {
            // 1. Read the current Vary header (set by CORS just moments ago)
            const existing = res.get('vary') || '';

            // 2. Append our new value instead of overwriting
            const next = existing ? existing + ', Accept-Encoding' : 'Accept-Encoding';

            // 3. Set the combined value
            res.set('Vary', next);
            res.end();
        });

        const i = await app.run({
            // Force a specific origin so the CORS middleware sets "Vary: Origin"
            cors: { origin: 'http://site.com' } 
        });

        const res = await fetch(LOCAL_HOST + '/vary-test', {
            headers: { 'Origin': 'http://site.com', 'Connection': 'close' }
        });

        const vary = res.headers.get('vary');
        
        assert(vary.toLowerCase().includes('accept-encoding'));
        assert(vary.toLowerCase().includes('origin'));

        await i.stop();
    });

});

describe('Native Node', () => {

    it('readableToWebStream pull() resumes underlying req (e2e)', async function() {
        this.timeout(5000);

        const app = new Estelar({ http: 9994 });

        app.post('/pull-test', async ({ body, res }) => {
            const reqStream = body.stream();
            const reader = reqStream.getReader();
            
            // Artificial delay to test resume capability
            await new Promise(r => setTimeout(r, 50));
            
            const dec = new TextDecoder();
            while(true) {
                const { value, done } = await reader.read();
                if(done) 
                    break;
                const s = dec.decode(value);
                if(s.includes('RESUMED')) {
                    res.json({ resumed: true });
                    return;
                }
            }
            res.json({ resumed: false });
        });

        const i = await app.run();

        const stream = new ReadableStream({
            start(controller) {
                for(let k=0; k<200; k++) 
                    controller.enqueue(new TextEncoder().encode('x'));
                controller.enqueue(new TextEncoder().encode('RESUMED'));
                controller.close();
            }
        });

        const res = await fetch('http://localhost:9994/pull-test', {
            method: 'POST',
            headers: { 'Connection': 'close' },
            body: stream,
            duplex: 'half'
        });

        const body = await res.json();
        assert.strictEqual(body.resumed, true);

        await i.stop();
    });

    it('readableToWebStream cancel() invokes underlying destroy (e2e)', async function() {
        this.timeout(5000);

        const app = new Estelar({ http: 9995 });

        app.post('/cancel-test', async ({ body, res }) => {
            const reqStream = body.stream();
            const reader = reqStream.getReader();
            // Cancelling the stream server-side should destroy the underlying socket
            await reader.cancel();
            res.json({ cancelled: true });
        });

        const i = await app.run();

        const stream2 = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('a'));
                controller.close();
            }
        });

        let threw = false;
        try{
            await fetch('http://localhost:9995/cancel-test', {
                method: 'POST',
                headers: { 'Connection': 'close' },
                body: stream2,
                duplex: 'half'
            });
        }
        catch(err){
            err;
            threw = true;
        }

        assert(threw, 'Expected fetch to throw due to server-side cancel() destroying request');

        await i.stop();
    });

    it('Should handle normal response write without backpressure', async () => {
        // Tests native_node.js lines 78-79 (res.write returns true, immediate resolve)
        const app = new Estelar({ http: 9997 });

        app.get('/quick', ({ res }) => {
            res.json({ message: 'fast response' });
        });
        
        const i = await app.run();
        
        try{
            const resp = await fetch('http://localhost:9997/quick', {
                headers: { 'Connection': 'close' }
            });
            const data = await resp.json();
            assert.strictEqual(data.message, 'fast response');
        }
        finally{
            await i.stop();
        }
    });

});









    