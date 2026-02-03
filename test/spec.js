/* eslint-env mocha */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { Readable, PassThrough } from 'node:stream';
import { WebSocket } from 'ws';
import { spawn } from 'node:child_process';
import * as http from 'node:http';
import { nativeNodeModule } from '../lib/native_node.js';

process.env.NODE_ENV = 'testing';

// Address for the tests' local servers to listen.
const LOCAL_HOST = 'http://localhost:80';

import { Nodecaf } from '../lib/main.js';
import { parse, serialize } from '../lib/cookie.js';
import { layerConf } from '../lib/conf.js';
import { Body } from '../lib/body.js';
import { Logger } from '../lib/logger.js';
import { HTTPError } from '../lib/error.js';

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

/**
 * Creates a temporary directory in the OS temp directory and returns its path.
 * @returns {string} The full path to the created temporary directory
 */
function createTempDir(){
    // const dirPath = path.join(os.tmpdir(), 'nodecaf-test-' + crypto.getRandomValues(new Uint32Array(1))[0].toString(16));
    const dirPath = path.join(os.tmpdir(), 'nodecaf-test-' + crypto.randomBytes(8).toString('hex'));
    fs.mkdirSync(dirPath);
    return dirPath;
}

/**
 * Runs a test application in a child process and return stdout for inspection.
 * @param {string} appCode - The JavaScript code of the application to run.
 * @param {object} [opts] - Options for running the test app.
 * @param {number} [opts.timeout] - Maximum time (ms) to wait for app to complete.
 * @param {string} [opts.cwd] - Current working directory for the child process.
 * @returns {Promise<string>} Resolves with the stdout output of the app.
 */
function runTestApp(appCode, opts){
    // Prepend Nodecaf import to the app code
    appCode = `import { Nodecaf } from 'file:///${path.resolve('./lib/main.js').replace(/\\/g, '/')}';\n` + appCode;

    return new Promise((resolve, reject) => {
        const proc = spawn('node', ['--input-type=module', '-e', appCode], {
            cwd: opts?.cwd || createTempDir(),
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let output = '';
        const timeout = opts?.timeout ? setTimeout(() => {
            proc.kill();
            reject(new Error('Test app timed out'));
        }, opts.timeout) : null;
        proc.stdout.on('data', (data) => {
            output += data.toString();
        });
        proc.stderr.on('data', (data) => {
            output += data.toString();
        });
        proc.on('close', () => {
            if(timeout) 
                clearTimeout(timeout);
            resolve(output);
        });
        proc.on('error', (err) => {
            if(timeout) 
                clearTimeout(timeout);
            reject(err);
        });
    });
}

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
                http: 80,
                routes: [
                    Nodecaf.post('/foo', ({ res }) => res.status(200).end())
                ]
            });
            await app.start();
            const { status } = await fetch(LOCAL_HOST + '/foo', { 
                method: 'POST',
                headers: { 'Connection': 'close' }
            });
            assert.strictEqual(status, 200);
            await app.stop();
        });

        it('Should store any settings sent', async () => {
            const app = new Nodecaf({ 
                conf: { key: 'value' },
                routes: [
                    Nodecaf.get('/bar', ({ res, conf }) => { res.text(conf.key) })
                ] 
            });
            const res = await app.trigger('get', '/bar');
            assert.strictEqual(res.body, 'value');
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

        it('Should use default name and version when package info not found', async () => {
            const stdout = await runTestApp(`
                const app = new Nodecaf();
                // await app.start();
                const entry = app.log.info('test');
                // await app.stop();
                // process.exit(0);
            `);
            assert(stdout.includes('"app":"Untitled"'), `Expected "Untitled" in output, got: ${stdout}`);
        });

    });

    describe('#start', () => {

        it('Should prevent starting a running server', async () => {
            const app = new Nodecaf();
            await app.start();
            assert.strictEqual(await app.start(), 'running');
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

        it('Should throw when attempt listening on a busy port', async () => {
            const app1 = new Nodecaf({ http: 8765 });
            await app1.start();
            const app2 = new Nodecaf({ http: 8765 });
            await assert.rejects( app2.start() );
            await app1.stop();
        });

    });

    describe('#stop', () => {

        it('Should stop the http server', async function(){
            const app = new Nodecaf({ http: 80 });
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

        it('Should not crash when both startup and shutdown throw', async function(){
            const app = new Nodecaf({ 
                startup: () => { throw new Error('Startup failure!!') },
                shutdown: () => { throw new Error('Shutdown failure!!') }
            });
            await assert.rejects(app.start());
            assert(app.state(), 'standby')
        });

    });

    describe('#restart', () => {

        it('Should take down the sever and bring it back up', async function() {
            this.timeout(3000);
            const app = new Nodecaf({ http: 80 });
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
            const app = new Nodecaf({
                conf: { myKey: 1 },
                routes: [
                    Nodecaf.get('/foo', ({ res, conf }) => res.json(conf))
                ]
            });
            await app.start();
            await app.restart({ myKey: 3 });
            const res = await app.trigger('get', '/foo');
            assert.strictEqual(res.body.myKey, 3);
            await app.stop();
        });

    });

    describe('#setup', () => {

        it('Should apply settings on top of existing one', async () => {
            const app = new Nodecaf({ 
                conf: { key: 'value' },
                routes: [
                    Nodecaf.get('/bar', ({ res, conf }) => res.json(conf))
                ]
            });
            app.setup({ key: 'value2', key2: 'value' });
            const res = await app.trigger('get', '/bar');
            assert.strictEqual(res.body.key, 'value2');
            assert.strictEqual(res.body.key2, 'value');
        });

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

    });

    describe('#trigger', () => {

        it('Should trigger route without http server', async () => {
            const app = new Nodecaf({
                routes: [
                    Nodecaf.post('/foo', ({ res }) => res.status(202).text('Test')),
                    Nodecaf.post('/nores', ({ res }) => res.status(204).end())
                ]
            });
            await app.start();
            await app.trigger('post', '/nores');
            const res = await app.trigger('post', '/foo');
            assert.strictEqual(res.status, 202);
            assert.strictEqual(res.body, 'Test');
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
                        const decoder = new TextDecoder();
                        assert.strictEqual(decoder.decode(input), '12345');
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
                    Nodecaf.post('/stream', async ({ res, body }) => {
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
                    })
                ]
            });
            await app.start();
            const body = Readable.from('foobar');
            const r = await app.trigger('post', '/stream/', { body });
            assert.strictEqual(r.status, 201);
            await app.stop();
        });

        it('Should handle buffer output', async () => {
            const app = new Nodecaf({
                routes: [
                    Nodecaf.get('/buf', ({ res }) => {
                        const encoder = new TextEncoder();
                        const buf = encoder.encode('foobar');
                        res.end(buf);
                    })
                ]
            });
            await app.start();
            const r = await app.trigger('get', '/buf');
            assert.strictEqual(r.status, 200);
            const decoder = new TextDecoder();
            assert.strictEqual('foobar', decoder.decode(r.body));
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
        
        it('Should fail if given file conf type is not supported', () => {
            const p = new Nodecaf().run({ conf: [ 'conf.xml' ] });
            assert.rejects(() => p);
        });

        it('Should fail if conf file is not found', () => {
            const p = new Nodecaf().run({ conf: [ 'bla.json' ] });
            assert.rejects(() => p);
        });

        it('Should properly load a TOML file and generate an object', async () => {
            const fp = createTempFile('a.toml');
            fs.writeFileSync(fp, 'key = "value"', 'utf-8');

            const app = await new Nodecaf({
                routes: [ 
                    Nodecaf.get('/bar', ({ res, conf }) => res.json(conf)) 
                ]
            }).run({ conf: [ fp ] });

            const { body } = await app.trigger('get', '/bar');
            assert.strictEqual(body.key, 'value');
            await app.stop();
            fs.unlink(fp, Function.prototype);
        });

        it('Should properly load an JSON file and generate an object', async () => {
            const fp = createTempFile('a.json');
            fs.writeFileSync(fp, '{"key": "value"}', 'utf-8');
            const app = await new Nodecaf({
                routes: [ 
                    Nodecaf.get('/bar', ({ res, conf }) => res.json(conf)) 
                ]
            }).run({ conf: [ fp ] });

            const { body } = await app.trigger('get', '/bar');
            assert.strictEqual(body.key, 'value');
            await app.stop();
            fs.unlink(fp, Function.prototype);
        });

    });


});

describe('Handlers', () => {

    it('Should fail when receiving invalid or duplicated route handlers', () => {
        assert.throws(() => Nodecaf.post('/foobar', undefined), TypeError);
        assert.throws(() => new Nodecaf({
            routes: [
                { method: 'post', path: '/foobaz'}
            ]
        }), /function/);
        assert.throws(() => new Nodecaf({
            routes: [
                { method: 'post' }
            ]
        }), /string/);
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
                && obj.params && obj.query && obj.conf && obj.log);
            obj.res.end();
        });

        const app = new Nodecaf({
            http: 80,
            routes: [ route ]
        });
        await app.start();
        const { status } = await fetch(LOCAL_HOST + '/foo', {
            headers: { 'Connection': 'close' }
        });
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should store data to be accessible to all handlers [app.global]', async () => {
        const app = new Nodecaf({
            http: 80,
            routes: [
                Nodecaf.put('/bar', ({ foo, res }) => {
                    res.text(foo);
                })
            ],
            startup({ global }) {
                global.foo = 'foobar';
            }
        });
        await app.start();
        const res = await fetch(LOCAL_HOST + '/bar', { 
            method: 'PUT',
            headers: { 'Connection': 'close' } 
        });
        const body = await res.text();
        assert.strictEqual(body, 'foobar');
        await app.stop();
    });

    it('Should execute \'all\' handler on any non-matched route', async () => {
        const app = new Nodecaf({
            routes: [
                // All should be only run when non-matching regardless of order it was defined
                Nodecaf.all(({ res, path }) => res.text(path)),
                Nodecaf.post('/foo/:bar', ({ res }) => res.text('foo'))
            ]
        });
        await app.start();
        assert.strictEqual((await app.trigger('post', '/foo/bar')).body, 'foo');
        assert.strictEqual((await app.trigger('get', '/abc')).body, '/abc');
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
            http: 80,
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
            http: 80,
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
            http: 80,
            routes: [
                Nodecaf.patch('/foobar', ({ query, res }) => {
                    assert.strictEqual(query.foo, 'bar');
                    res.end();
                })
            ]
        });
        await app.start();
        const { status } = await fetch(LOCAL_HOST + '/foobar?foo=bar', { 
            method: 'PATCH',
            headers: { 'Connection': 'close' }
        });
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should output a 404 when no route is found for a given path', async () => {
        const app = new Nodecaf({ http: 80 });
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
            http: 80,
            routes: [
                Nodecaf.get('/foo', async function({ res }){
                    const s = res.stream();
                    const rs = fs.createReadStream('./package.json');
                    const wrs = Readable.toWeb(rs);
                    await wrs.pipeTo(s);
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
            http: 80,
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
            http: 80,
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
            http: 80,
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

        function userFunc(obj, arg1){
            assert.strictEqual(arg1, 'foo');
            assert.strictEqual(obj.path, '/foo');
            assert(obj.res && obj.method && obj.path && obj.body && obj.ip
                && obj.params && obj.query && obj.conf && obj.log);
        }

        const app = new Nodecaf({
            conf: { bar: 'baz' },
            routes: [
                Nodecaf.del('/foo', function({ call, res }){
                    call(userFunc, 'foo');
                    res.end();
                })
            ]
        });
        await app.start();
        const { status } = await app.trigger('delete', '/foo');
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should handle websocket upgrade requests [opts.websocket]', async function(){

        let done;
        const app = new Nodecaf({
            http: 80,
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
        let done;
        const app = new Nodecaf({
            http: 80,
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

    it('Should call any user func with global handler args on startup', async () => {

        function userFunc(obj, arg1){
            assert.strictEqual(arg1, 'foo');
            assert.strictEqual(obj.conf.bar, 'baz');
            assert(obj.conf && obj.log);
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

    it('Should call any user func with global handler args on shutdown', async () => {

        function userFunc(obj, arg1){
            assert.strictEqual(arg1, 'foo');
            assert.strictEqual(obj.conf.bar, 'baz');
            assert(obj.conf && obj.log);
        }

        const app = new Nodecaf({
            conf: { bar: 'baz' },
            shutdown({ call }){
                call(userFunc, 'foo');
            }
        });
        await app.start();
        await app.stop();
    });

});

describe('Body Parsing', () => {

    it('Should NOT try parsing body when none is sent', async () => {
        const app = new Nodecaf({
            http: 80,
            autoParseBody: true,
            routes: [
                Nodecaf.post('/foobar', ({ body, res }) => {
                    assert.strictEqual(body.length, 0);
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
            http: 80,
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
            http: 80,
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
            http: 80,
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
            http: 80,
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
            http: 80,
            autoParseBody: true,
            routes: [
                Nodecaf.post('/foobar', ({ body, res }) => {
                    assert(body instanceof Uint8Array);
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
            http: 80,
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
            http: 80,
            routes: [
                Nodecaf.post('/foobar', ({ body, res }) => {
                    assert.strictEqual(body.constructor.name, 'Body');
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
            http: 80,
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
            http: 80,
            routes: [
                Nodecaf.post('/chunked', async ({ body, res }) => {
                    const str = await body.text();
                    assert.strictEqual(str, '12345');
                    res.status(201).end();
                })
            ]
        });

        await app.start();
        
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
        if(res.error) 
            throw res.error;

        assert.strictEqual(res.status, 201);
        await app.stop();
    });

    it('Should respond 408 when body takes too long to finish', async () => {

        const app = new Nodecaf({
            http: 80,
            reqBodyTimeout: 600,
            routes: [
                Nodecaf.post('/tto', async ({ body }) => {
                    await body.text();
                })
            ]
        });

        await app.start();

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

    it('Should abort route when client conneciton is reset while reading req body', async function(){
        this.timeout(5000);
        let abortedRouted = true;
        let startedRoute = false;
        let abortErrorName = false;

        const app = new Nodecaf({
            http: 80,
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
        await app.stop();
        assert(abortedRouted);
        assert(startedRoute);
        assert.strictEqual(abortErrorName, 'AbortError');
    });

});

describe('Assertions', () => {

    it('Should not respond unless exception escapes the route', async function() {
        this.timeout(5000);
        const app = new Nodecaf({
            http: 80,
            routes: [
                Nodecaf.get('/foo', function({ res }){
                    try{
                        res.badRequest(true, 'Bad Request');
                    } 
                    catch(e){
                        e
                    }
                    res.end('All good');
                })
            ]
        });
        await app.start();
        const res = await fetch(LOCAL_HOST + '/foo', { headers: { 'Connection': 'close' } });
        const body = await res.text();
        assert.strictEqual(body, 'All good');
        assert.strictEqual(res.status, 200);
        await app.stop();
    });

    it('Should throw when condition evaluates to true', async () => {
        const app = new Nodecaf({
            http: 80,
            routes: [
                Nodecaf.get('/foo', function({ res }){
                    assert.throws( () => res.badRequest(true, Buffer.from('abc')) );
                    assert.throws( () => res.unauthorized(true) );
                    assert.throws( () => res.forbidden(true) );
                    assert.throws( () => res.notFound(true) );
                    assert.throws( () => res.conflict(true) );
                    assert.throws( () => res.gone(true) );
                    res.end();
                })
            ]
        });
        await app.start();
        
        const res = await fetch(LOCAL_HOST + '/foo', { headers: { 'Connection': 'close' } });
        await res.text();
        assert.strictEqual(res.status, 200);

        await app.stop();
    });

    it('Should do nothing when condition evaluates to false', async () => {
        const app = new Nodecaf({
            http: 80,
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
            http: 80,
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

    it('Should respond 415 when res.badType is called inside a route', async () => {
        const app = new Nodecaf({
            http: 80,
            routes: [
                Nodecaf.get('/badtype', function({ res }){
                    res.badType(true);
                })
            ]
        });
        await app.start();
        const r = await fetch(LOCAL_HOST + '/badtype', { headers: { 'Connection': 'close' } });
        const body = await r.text();
        assert.strictEqual(r.status, 415);
        assert.strictEqual(body.length, 0);
        await app.stop();
    });

});

describe('Error Handling', () => {

    it('Should handle Error thrown sync on the route', async () => {
        const app = new Nodecaf({
            http: 80,
            routes: [
                Nodecaf.delete('/unknown', () => {
                    throw new Error('othererr');
                }),
                Nodecaf.post('/non-error', () => {
                    throw 4;
                })
            ]
        });
        await app.start();
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
        await app.stop();
    });

    it('Should handle Error injected sync on the route', async () => {
        const app = new Nodecaf({
            http: 80,
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
            http: 80,
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
            http: 80,
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
            http: 80,
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
        const entry = app.log.info('Test log');
        assert.strictEqual(entry.app, 'nodecaf');
    });

    it('Should not modify the very object used as cookie options', async () => {
        const cookieOpts = { maxAge: 68300000 };
        const app = new Nodecaf({
            http: 80,
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
            http: 80,
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
                http: 80,
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
            http: 80,
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
            http: 80,
            conf: { cors: true },
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
            http: 80,
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
            http: 80, 
            conf: { 
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
            http: 80, 
            conf: { 
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

    it('Should allow all origins when origin is boolean true', async () => {
        const app = new Nodecaf({
            http: 80, 
            conf: { 
                cors: { origin: true }
            },
            routes: [ Nodecaf.get('/cors-bool-true', ({ res }) => res.end()) ]
        });
        await app.start();

        const res = await fetch(LOCAL_HOST + '/cors-bool-true', {
            headers: { 'Origin': 'http://any-origin.com', 'Connection': 'close' }
        });

        // When origin: true, should return the request origin (truthy origin allowed)
        assert.strictEqual(res.headers.get('access-control-allow-origin'), 'http://any-origin.com');

        await app.stop();
    });

    it('Should handle Credentials and Exposed Headers options', async () => {
        const app = new Nodecaf({
            http: 80, 
            conf: { 
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
            http: 80, 
            conf: { 
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
            http: 80, 
            conf: { 
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
        // warn and above should proceed (though console.log is global)
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


describe('Server Lifecycle (Start/Stop)', () => {
    it('Should start server and respond to HTTP requests', function(done) {
        this.timeout(5000);

        const serverScript = `
        import { Nodecaf } from './lib/main.js';
        const app = new Nodecaf({
          http: 9876,
          routes: [
            Nodecaf.get('/', async ({ res }) => res.json({ ok: true, version: 1 }))
          ]
        });
        await app.start();
        console.log('SERVER_READY');

        // Auto-shutdown after 3 seconds
        setTimeout(async () => {
          await app.stop();
          process.exit(0);
        }, 3000);
      `;

        const child = spawn('node', ['--input-type=module', '--eval', serverScript], {
            cwd: process.cwd(),
            stdio: ['inherit', 'pipe', 'inherit']
        });

        let serverReady = false;
        let requestCompleted = false;

        child.stdout.on('data', (data) => {
            const output = data.toString();
            if(output.includes('SERVER_READY') && !serverReady) {
                serverReady = true;
          
                // Make HTTP request
                setTimeout(() => {
                    const req = http.get('http://localhost:9876/', { timeout: 1000 }, (res) => {
                        let body = '';
                        res.on('data', (chunk) => body += chunk);
                        res.on('end', () => {
                            try{
                                const data = JSON.parse(body);
                                if(data.ok && data.version === 1) 
                                    requestCompleted = true;
                  
                            }
                            catch(e) {
                                e
                                // ignore parse errors
                            }
                        });
                    });
                    req.on('error', () => {
                        // ignore connection errors
                    });
                }, 100);
            }
        });

        child.on('close', (code) => {
            assert.ok(serverReady, 'server should have started');
            assert.ok(requestCompleted, 'server should respond to HTTP requests');
            assert.equal(code, 0, 'server should exit cleanly');
            done();
        });

        child.on('error', (err) => done(err));
    });
});

describe('Startup Handler Execution', () => {
    it('Should execute startup handler before server is ready', function(done) {
        this.timeout(5000);

        const serverScript = `
        import { Nodecaf } from './lib/main.js';
        const app = new Nodecaf({
          http: 9879,
          startup: async ({ log, conf }) => {
            console.log('STARTUP_HANDLER_CALLED');
          },
          routes: [Nodecaf.get('/', async ({ res }) => res.json({ ok: true }))]
        });
        await app.run();
      `;

        const child = spawn('node', ['--input-type=module', '--eval', serverScript], {
            cwd: process.cwd(),
            stdio: ['inherit', 'pipe', 'inherit']
        });

        let startupCalled = false;
        const timeout = setTimeout(() => {
            if(!startupCalled) {
                child.kill();
                done(new Error('Startup handler not called within timeout'));
            }
        }, 3000);

        child.stdout.on('data', (data) => {
            const output = data.toString();
            if(output.includes('STARTUP_HANDLER_CALLED')) {
                startupCalled = true;
                clearTimeout(timeout);
                child.kill();
                done();
            }
        });

        child.on('error', (err) => {
            clearTimeout(timeout);
            done(err);
        });
    });
});

describe('Configuration Reload on restart()', () => {
    it('Should reload configuration with restart()', function(done) {
        this.timeout(5000);

        const serverScript = `
        import { Nodecaf } from './lib/main.js';
        const app = new Nodecaf({
          http: 9880,
          conf: { version: '1.0' },
          routes: [Nodecaf.get('/', async ({ conf, res }) => res.json(conf))]
        });
        await app.start();
        console.log('STARTED');

        // Simulate config reload
        setTimeout(async () => {
          await app.restart({ version: '2.0' });
          console.log('RESTARTED');
          process.exit(0);
        }, 500);
      `;

        const child = spawn('node', ['--input-type=module', '--eval', serverScript], {
            cwd: process.cwd(),
            stdio: ['inherit', 'pipe', 'inherit']
        });

        let restarted = false;
        const timeout = setTimeout(() => {
            if(!restarted) {
                child.kill();
                done(new Error('Restart not completed'));
            }
        }, 3000);

        child.stdout.on('data', (data) => {
            const output = data.toString();
            if(output.includes('RESTARTED')) {
                restarted = true;
                clearTimeout(timeout);
                done();
            }
        });

        child.on('error', (err) => {
            clearTimeout(timeout);
            done(err);
        });
    });
});

describe('In-Memory WebSocket Server', () => {
    let app;

    afterEach(async () => {
        if(app) 
            try{
                await app.stop();
            }
            catch(e) {
                e
                // ignore
            }
      
    });

    it('Should accept WebSocket connections', async function() {
        this.timeout(10000);

        app = new Nodecaf({
            http: 9881,
            websocket: true,
            routes: [
                Nodecaf.get('/', async ({ websocket, res }) => {
                    if(websocket) {
                        const ws = await websocket();
                        ws.send('hello from server');
                        ws.on('message', (msg) => {
                            ws.send('echo: ' + msg);
                        });
                    }
                    else
                        res.json({ ok: true });
                    
                })
            ]
        });

        await app.start();

        return new Promise((resolve, reject) => {
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
    });
});



describe('native_node adapter', () => {

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

    it('setupGlobalHandlers registers handlers and cleanup works', (done) => {
        const realExit = process.exit;
        const realSetTimeout = global.setTimeout;
        const exitCalls = [];
        process.exit = (code) => exitCalls.push(code);
        global.setTimeout = (fn) => fn();

        let termCalled = false;
        let dieCalled = false;
        let dieErr = null;

        const cleanup = nativeNodeModule.setupGlobalHandlers(() => { termCalled = true; }, (err) => { dieCalled = true; dieErr = err; });

        // Trigger termination handler (call the last-installed handler directly)
        const sigs = process.listeners('SIGINT');
        if(sigs.length) 
            sigs[sigs.length - 1]();
        // Trigger die handler (call the last-installed handler directly)
        const dies = process.listeners('uncaughtException');
        if(dies.length) 
            dies[dies.length - 1](new Error('boom'));

        // cleanup removes listeners
        cleanup();

        // Restore
        process.exit = realExit;
        global.setTimeout = realSetTimeout;

        try{
            assert.ok(termCalled, 'termination callback should be called');
            assert.ok(dieCalled, 'die callback should be called');
            assert.ok(dieErr && dieErr.message === 'boom');
            assert.ok(exitCalls.includes(0) || exitCalls.includes(1));
            done();
        }
        catch(err){
            done(err);
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

    // This test wont work on windows since likstening to signals is not supported
    // it.skip('main.run term handler stops app gracefully on SIGINT', function(done) {
        
    //     const appCode = `
    //         import { Nodecaf } from 'file:///${path.resolve('./lib/main.js').replace(/\\/g, '/')}';
    //         const app = new Nodecaf({
    //             http: 9876,
    //             routes: [Nodecaf.get('/', ({ res }) => res.text('ok'))],
    //             shutdown(){ console.log('Shutdown called'); }
    //         });

    //         await app.run();
    //     `;

    //     const proc = spawn('node', ['-e', appCode], { stdio: ['ignore', 'pipe', 'pipe'] });

    //     let output = '';
    //     let shutdownCalled = false;
    //     let serverStarted = false;

    //     const handleData = (data) => {
    //         output += data.toString();
    //         console.log('Child Output:', data.toString());

    //         if(output.includes('has started') && !serverStarted) {
    //             serverStarted = true;
    //             console.log('Startup complete, sending SIGINT...');
    //             proc.kill('SIGINT');
    //         }

    //         if(output.includes('Shutdown called') && !shutdownCalled) {
    //             console.log('Shutdown handler has run, means it was stopped!');
    //             shutdownCalled = true;
    //         }
    //     };

    //     proc.stdout.on('data', handleData);
    //     proc.stderr.on('data', handleData);

    //     proc.on('close', (code, signal) => {
    //         console.log(`Process exited with code: ${code}, signal: ${signal}`);
    //         assert(shutdownCalled, 'Shutdown handler was not called on SIGINT');
    //         assert(code === 0, `Process exited with non-zero code: ${code}`);
    //         done();            
    //     });
    // });

    it('main.run die handler logs fatal error on uncaughtException', function() {
        this.timeout(10000);

        const appCode = `
import { Nodecaf } from 'file:///${path.resolve('./lib/main.js').replace(/\\/g, '/')}';
const app = new Nodecaf({
    http: 9877,
    routes: [Nodecaf.get('/', ({ res }) => res.text('ok'))]
});

await app.run();

// Trigger an uncaught exception (die handler should be invoked)
process.nextTick(() => {
    throw new Error('simulated crash');
});

// Keep alive briefly
setInterval(() => {}, 1000);
`;

        const proc = spawn('node', ['--input-type=module', '-e', appCode], {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let output = '';
        let procExited = false;

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                if(!procExited) 
                    proc.kill('SIGKILL');
                reject(new Error('Test timed out'));
            }, 8000);

            proc.stdout.on('data', (data) => {
                output += data.toString();
            });

            proc.stderr.on('data', (data) => {
                output += data.toString();
            });

            proc.on('close', () => {
                procExited = true;
                clearTimeout(timeout);
                try{
                    // Die handler calls log.fatal with { err, type: 'crash' }
                    // In production env (testing), this outputs JSON to stdout
                    assert(output.includes('crash'), `Expected "crash" type in output, got: ${output}`);
                    assert(output.includes('simulated crash'), `Expected error message in output, got: ${output}`);
                    resolve();
                }
                catch(err) {
                    reject(err);
                }
            });

            proc.on('error', reject);
        });
    });

    it('readableToWebStream pull() resumes underlying req (e2e)', async function() {
        this.timeout(5000);

        const app = new Nodecaf({
            http: 9994,
            routes: [
                Nodecaf.post('/pull-test', async ({ body, res }) => {
                    const reqStream = body.stream();
                    const reader = reqStream.getReader();
                    await new Promise(r => setTimeout(r, 50));
                    const dec = new TextDecoder();
                    while(true) {
                        const { value, done } = await reader.read();
                        if(done) 
                            break;
                        const s = dec.decode(value);
                        if(s.includes('RESUMED'))
                            return res.json({ resumed: true });
                    }
                    return res.json({ resumed: false });
                })
            ]
        });

        await app.start();

        const stream = new ReadableStream({
            start(controller) {
                for(let i=0;i<200;i++) 
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

        await app.stop();
    });

    it('readableToWebStream cancel() invokes underlying destroy (e2e)', async function() {
        this.timeout(5000);

        const app = new Nodecaf({
            http: 9995,
            routes: [
                Nodecaf.post('/cancel-test', async ({ body, res }) => {
                    const reqStream = body.stream();
                    const reader = reqStream.getReader();
                    await reader.cancel();
                    return res.json({ cancelled: true });
                })
            ]
        });

        await app.start();

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
            err
            threw = true;
        }

        assert(threw, 'Expected fetch to throw due to server-side cancel() destroying request');

        await app.stop();
    });

});

describe('body charset error handling (e2e)', () => {
    it('Should silently use default charset (utf-8) when invalid charset is provided in header', async () => {
        // The getDataTypeFromContentType function validates charsets against a whitelist
        // and silently uses the default (utf-8) if an invalid charset is sent
        // This means bytesToString never receives an invalid charset in practice
        const { Body } = await import('../lib/body.js');
        
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
        const { Body } = await import('../lib/body.js');
        
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
        const { Body } = await import('../lib/body.js');
        
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
        
        const result = await body.parse();
        assert.deepStrictEqual(result, { foo: 'bar', baz: 'qux' });
    });

    
    it('logger prints friendly output in development (e2e)', function(done) {
        this.timeout(5000);

        const appCode = `
    (async ()=>{
        process.env.NODE_ENV = 'development';
        await new Promise(r => setImmediate(r));
        const { Nodecaf } = await import('file:///${path.resolve('./lib/main.js').replace(/\\/g, '/')}');
        await new Promise(r => setImmediate(r));
        const app = new Nodecaf();
        app.log.info('devtest');
        process.stdout.write('READY\\n');
        setTimeout(()=>process.exit(0),100);
    })();
    `;

        const proc = spawn('node', ['-e', appCode], {
            env: { ...process.env, NODE_ENV: 'development' },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let out = '';
        proc.stdout.on('data', d => out += d.toString());
        proc.stderr.on('data', d => out += d.toString());

        proc.on('close', () => {
            try{
                assert.ok(out.includes('INFO - devtest'), `Expected friendly dev output, got:\n${out}`);
                done();
            }
            catch(err){ done(err); }
        });
    });

});

describe('uncovered branches analysis', () => {
    it('Should serialize cookie with Priority=High option', async () => {
        // Tests cookie.js line 151 (Priority=High case)
        const { serialize } = await import('../lib/cookie.js');
        const cookie = serialize('test', 'value', { priority: 'high' });
        assert.ok(cookie.includes('Priority=High'));
    });

    it('Should serialize cookie with Priority=Medium option', async () => {
        // Tests cookie.js line 149 (Priority=Medium case)
        const { serialize } = await import('../lib/cookie.js');
        const cookie = serialize('test', 'value', { priority: 'medium' });
        assert.ok(cookie.includes('Priority=Medium'));
    });

    it('Should serialize cookie with Priority=Low option', async () => {
        // Tests cookie.js line 149 (Priority=Low case)
        const { serialize } = await import('../lib/cookie.js');
        const cookie = serialize('test', 'value', { priority: 'low' });
        assert.ok(cookie.includes('Priority=Low'));
    });

    it('Should serialize cookie with SameSite=Strict option', async () => {
        // Tests cookie.js line 171 (SameSite=Strict case)
        const { serialize } = await import('../lib/cookie.js');
        const cookie = serialize('test', 'value', { sameSite: 'strict' });
        assert.ok(cookie.includes('SameSite=Strict'));
    });

    it('Should serialize cookie with SameSite=Lax option', async () => {
        // Tests cookie.js line 169 (SameSite=Lax case)
        const { serialize } = await import('../lib/cookie.js');
        const cookie = serialize('test', 'value', { sameSite: 'lax' });
        assert.ok(cookie.includes('SameSite=Lax'));
    });

    it('Should serialize cookie with SameSite=None option', async () => {
        // Tests cookie.js line 174 (SameSite=None case)
        const { serialize } = await import('../lib/cookie.js');
        const cookie = serialize('test', 'value', { sameSite: 'none' });
        assert.ok(cookie.includes('SameSite=None'));
    });

    it('Should throw on invalid cookie priority', async () => {
        // Tests cookie.js line 155 (default case for priority)
        const { serialize } = await import('../lib/cookie.js');
        
        try{
            serialize('test', 'value', { priority: 'invalid' });
            throw new Error('expected TypeError');
        }
        catch(err){
            assert.ok(err instanceof TypeError);
            assert.ok(err.message.includes('priority'));
        }
    });

    it('Should throw on invalid cookie sameSite', async () => {
        // Tests cookie.js line 177 (default case for sameSite)
        const { serialize } = await import('../lib/cookie.js');
        
        try{
            serialize('test', 'value', { sameSite: 'invalid' });
            throw new Error('expected TypeError');
        }
        catch(err){
            assert.ok(err instanceof TypeError);
            assert.ok(err.message.includes('sameSite'));
        }
    });

    it('Should handle normal response write without backpressure', async () => {
        // Tests native_node.js lines 78-79 (res.write returns true, immediate resolve)
        // This is the normal case where write succeeds immediately without waiting for drain
        const app = new Nodecaf({
            http: 9997,
            routes: [
                Nodecaf.get('/quick', ({ res }) => {
                    res.json({ message: 'fast response' });
                })
            ]
        });
        
        await app.start();
        
        try{
            const resp = await fetch('http://localhost:9997/quick', {
                headers: { 'Connection': 'close' }
            });
            const data = await resp.json();
            assert.strictEqual(data.message, 'fast response');
        }
        finally{
            await app.stop();
        }
    });

    it('Should handle WebSocket client lifecycle with pong handler', async () => {
        const WebSocket = (await import('ws')).default;
        
        const app = new Nodecaf({
            http: 9996,
            websocket: true,
            routes: [
                Nodecaf.get('/', ({ websocket }) => {
                    websocket();
                })
            ]
        });
        
        await app.start();
        
        try{
            const ws = new WebSocket('ws://localhost:9996/');
            await new Promise((resolve, reject) => {
                ws.on('ping', () => {
                    ws.close();
                    resolve();
                });
                ws.on('error', reject);
            });
        }
        finally{
            await app.stop();
        }
    });
});