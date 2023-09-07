/* eslint-env mocha */

const assert = require('assert');

process.env.NODE_ENV = 'testing';

// Address for the tests' local servers to listen.
const LOCAL_HOST = 'http://localhost:80'

const muhb = require('muhb');
const { Readable } = require('stream');

const Nodecaf = require('../lib/main');

describe('Nodecaf', () => {

    describe('constructor', () => {

        it('Should fail when Options is not an object', () => {
            assert.throws( () => new Nodecaf(false), /Options/ );
        });

        it('Should fail when API builder is not a function', () => {
            assert.throws( () => new Nodecaf({ api: 3 }), /API/ );
        });

        it('Should execute the API Builder passing the method funcs', done => {
            new Nodecaf({
                api(funcs){
                    assert.strictEqual(typeof funcs, 'object');
                    done();
                }
            });
        });

        it('Should allow registering routes', async () => {
            const app = new Nodecaf({
                conf: { port: 80 },
                api({ post, del, patch }){
                    post('/foo', ({ res }) => res.status(500).end());
                    assert.strictEqual(typeof del, 'function');
                    assert.strictEqual(typeof patch, 'function');
                }
            });
            await app.start();
            const { status } = await muhb.post(LOCAL_HOST + '/foo');
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

    });

    describe('#start', () => {

        it('Should prevent starting a running server', async () => {
            const app = new Nodecaf();
            await app.start();
            assert.strictEqual(await app.start(), 'running');
            await app.stop();
        });

        it('Should start the http server on port sent', async () => {
            const app = new Nodecaf({ conf: { port: 8765 } });
            await app.start();
            const { status } = await muhb.get('http://127.0.0.1:8765/');
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
            await assert.rejects(muhb.get(LOCAL_HOST + '/'));
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
            const r1 = await muhb.get(LOCAL_HOST + '/');
            assert.strictEqual(r1.status, 404);
            await app.restart();
            const r2 = await muhb.get(LOCAL_HOST + '/');
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

    });

    describe('#trigger', () => {

        it('Should trigger route without http server', async () => {
            const app = new Nodecaf({
                conf: { port: 80 },
                api({ post }){
                    post('/foo', ({ res }) => res.status(202).end('Test'));
                    post('/nores', ({ res }) => res.status(204).end());
                }
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
                conf: { port: 80 },
                api({ post }){
                    post('/foo', ({ res }) => {
                        res.set('X-Test', 'Foo');
                        res.end();
                    });
                    post('/bar', ({ res }) => {
                        res.end();
                    });
                }
            });
            await app.start();
            const r = await app.trigger('post', '/bar', { body: Buffer.from('abc') });
            assert.strictEqual(r.status, 200);
            const res = await app.trigger('post', '/foo',
                { headers: { host: 'what.com' }, body: { foo: 'bar' } });
            assert.strictEqual(res.headers['X-Test'], 'Foo');
            await app.stop();
        });

        it('Should properly parse body inputs', async () => {
            const app = new Nodecaf({
                conf: { port: 80 },
                api({ post }){
                    post('/raw', async ({ body, res }) => {
                        const input = await body.raw();
                        assert.strictEqual(input.toString(), '12345');
                        res.end();
                    });

                    post('/json', async ({ body, res }) => {
                        const input = await body.json();
                        assert.strictEqual(input, 12345);
                        res.end();
                    });

                    post('/text', async ({ body, res }) => {
                        const input = await body.text();
                        assert.strictEqual(input, '12345');
                        res.end();
                    });

                    post('/urlencoded', async ({ body, res }) => {
                        const input = await body.urlencoded();
                        assert.strictEqual(input['12345'], '');
                        res.end();
                    });
                }
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
                conf: { port: 80 },
                api({ post }){
                    post('/stream', ({ body, res }) => {
                        body.on('end', () => res.status(201).end());
                        body.resume();
                    });
                }
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

    it('Should fail when receiving invalid route handlers', () => {
        new Nodecaf({
            api({ post }){
                assert.throws(() => post('/foobar', undefined), TypeError);
                post('/foobaz', Function.prototype);
                assert.throws(() => post('/foobaz', Function.prototype), /already/);
            }
        });
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
        const { status } = await muhb.get(LOCAL_HOST + '/foo');
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should execute \'all\' handler on any non-matched route', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            api({ post, all }){
                // All should be only run when non-matching regardless of order it was defined
                all(({ res, path }) => res.end(path));
                post('/foo/:bar', ({ res }) => res.end('foo'));
            }
        });
        await app.start();
        assert.strictEqual((await app.trigger('post', '/foo/bar')).body.toString(), 'foo');
        assert.strictEqual((await app.trigger('get', '/abc')).body.toString(), '/abc');
        await app.stop();
    });

    it('Should pass all present parameters to handler', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            api({ get }){
                get('/fo/:o', Function.prototype);
                get('/foo/:bar', function({ params, res }){
                    res.badRequest(params.bar !== 'test');
                    res.end();
                });
            }
        });
        await app.start();
        const { status }  = await muhb.get(LOCAL_HOST + '/foo/test');
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
        const { status }  = await muhb.get(LOCAL_HOST + '/foo/abc%3Adef');
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should parse URL query string', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            api({ post }){
                post('/foobar', ({ query, res }) => {
                    assert.strictEqual(query.foo, 'bar');
                    res.end();
                });
            }
        });
        await app.start();
        const { status } = await muhb.post(LOCAL_HOST + '/foobar?foo=bar');
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should output a 404 when no route is found for a given path', async () => {
        const app = new Nodecaf({ conf: { port: 80 } });
        await app.start();
        const { status } = await muhb.post(LOCAL_HOST + '/foobar');
        assert.strictEqual(status, 404);
        await app.stop();
    });

    it('Should stream bytes to client', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            api({ get }){
                get('/foo', function({ res }){
                    const s = require('fs').createReadStream('./package.json');
                    s.pipe(res);
                });
            }
        });
        await app.start();
        const { body } = await muhb.get(LOCAL_HOST + '/foo');
        const o = JSON.parse(body.toString());
        assert.strictEqual(o.name, 'nodecaf');
        await app.stop();
    });

    it('Should parse object as json response [res.json()]', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            api({ get }){
                get('/foo', function({ res }){
                    res.json('{"hey":"ho"}');
                });
            }
        });
        await app.start();
        const { headers } = await muhb.get(LOCAL_HOST + '/foo');
        assert.strictEqual(headers['content-type'], 'application/json');
        await app.stop();
    });

    it('Should set multiple cookies properly', async function(){

        const app = new Nodecaf({
            conf: { port: 80 },
            api({ get }){
                get('/foo', function({ res }){
                    res.cookie('test', 'foo');
                    res.cookie('testa', 'bar');
                    res.cookie('testa', 'baz');
                    res.end();
                });
            }
        });
        await app.start();
        const { headers } = await muhb.get(LOCAL_HOST + '/foo');
        assert.strictEqual(headers['set-cookie'][1], 'testa=bar');
        await app.stop();
    });

    it('Should set encrypted (signed) cookies', async function(){
        const app = new Nodecaf({
            conf: { port: 80, cookie: { secret: 'OH YEAH' } },
            api({ get }){

                get('/foo', function({ res }){
                    res.cookie('test', 'foo', { signed: true, maxAge: 5000  });
                    res.cookie('testa', 'bar');
                    res.end();
                });

                get('/bar', function({ res, cookies, signedCookies }){
                    res.badRequest(cookies.testa !== 'bar');
                    res.badRequest(signedCookies.test !== 'foo');
                    res.end();
                });
            }
        });
        await app.start();
        const { cookies } = await muhb.get(LOCAL_HOST + '/foo');
        const { status } = await muhb.get(LOCAL_HOST + '/bar', { cookies });
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should fail when trying to sign cookies without a secret', async function(){
        const app = new Nodecaf({
            conf: { port: 80 },
            api({ get }){
                get('/foo', function({ res }){
                    res.cookie('test', 'foo', { signed: true });
                });
            }
        });
        await app.start();
        const { status } = await muhb.get(LOCAL_HOST + '/foo');
        assert.strictEqual(status, 500);
        await app.stop();
    });

    it('Should not read cookies with wrong signature', async function(){
        const app = new Nodecaf({
            conf: { port: 80, cookie: { secret: 'OH YEAH' } },
            api({ get }){
                get('/foo', function({ res }){
                    res.cookie('test', 'foo', { signed: true, maxAge: 5000  });
                    res.end();
                });

                get('/bar', function({ res, signedCookies }){
                    res.badRequest(signedCookies.test !== 'foo');
                    res.end();
                });
            }
        });
        await app.start();
        const { cookies } = await muhb.get(LOCAL_HOST + '/foo');
        cookies['test'] = cookies['test'].substring(0, cookies['test'].length - 1) + '1';
        const { status } = await muhb.get(LOCAL_HOST + '/bar', { cookies });
        assert.strictEqual(status, 400);
        await app.stop();
    });

    it('Should clear cookies', async function(){
        const app = new Nodecaf({
            conf: { port: 80 },
            api({ get }){

                get('/foo', function({ res }){
                    res.cookie('testa', 'bar');
                    res.end();
                });

                get('/bar', function({ res }){
                    res.clearCookie('testa');
                    res.end();
                });
            }
        });
        await app.start();
        const { cookies } = await muhb.get(LOCAL_HOST + '/foo');
        const { headers } = await muhb.get(LOCAL_HOST + '/bar', { cookies });
        assert(headers['set-cookie'][0].indexOf('Expire') > -1);
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
            api({ post }){
                post('/foo', function({ call, res }){
                    call(userFunc, 'foo');
                    res.end();
                });
            }
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
            api({ post }){
                post('/foo', function({ keep, call, res, body }){
                    body == 'bar' && keep('myVal', true);
                    call(userFunc);
                    res.end();
                });
            }
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
            api({ get }){
                get('/bar', async ({ websocket }) => {
                    const ws = await websocket();
                    ws.on('message', m => {
                        assert.strictEqual(m.toString(), 'foobar');
                        done = true;
                        ws.close();
                    });
                })
            }
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
            api({ all }){
                all(async ({ websocket }) => {
                    const ws = await websocket();
                    ws.on('message', m => {
                        assert.strictEqual(m.toString(), 'foobar');
                        done = true;
                        ws.close();
                    });
                })
            }
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
            api({ post }){
                post('/foobar', ({ body, res }) => {
                    assert.strictEqual(body, undefined);
                    res.end();
                });
            }
        });
        await app.start();
        const { status } = await muhb.post(LOCAL_HOST + '/foobar');
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should parse JSON request body payloads', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            autoParseBody: true,
            api({ post }){
                post('/foobar', ({ body, res }) => {
                    assert.strictEqual(body.foo, 'bar');
                    res.end();
                });
            }
        });
        await app.start();
        const { status } = await muhb.post(LOCAL_HOST + '/foobar',
            { 'Content-Type': 'application/json' }, { foo: 'bar' });
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should send 400 when failed to parse body', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            autoParseBody: true,
            api({ post }){
                post('/foobar', Function.prototype);
            }
        });
        await app.start();
        const { status } = await muhb.post(LOCAL_HOST + '/foobar',
            { 'Content-Type': 'application/json' }, 'foobar}');

        assert.strictEqual(status, 400);
        await app.stop();
    });

    it('Should parse text request body payloads', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            autoParseBody: true,
            api({ post }){
                post('/foobar', ({ body, res }) => {
                    assert.strictEqual(body, '{"foo":"bar"}');
                    res.end();
                });
            }
        });
        await app.start();
        const { status } = await muhb.post(LOCAL_HOST + '/foobar',
            { 'Content-Type': 'text/css' },
            JSON.stringify({foo: 'bar'})
        );
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should parse request body without content-type', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            autoParseBody: true,
            api({ post }){
                post('/foobar', ({ body, res }) => {
                    assert.strictEqual(body.toString(), '{"foo":"bar"}');
                    res.end();
                });
            }
        });
        await app.start();
        const { status } = await muhb.post(LOCAL_HOST + '/foobar',
            { 'no-auto': true, 'Content-Length': 13 },
            JSON.stringify({foo: 'bar'})
        );
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should not parse binary request body', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            autoParseBody: true,
            api({ post }){
                post('/foobar', ({ body, res }) => {
                    assert(body instanceof Buffer);
                    res.end();
                });
            }
        });
        await app.start();
        const { status } = await muhb.post(LOCAL_HOST + '/foobar',
            { 'Content-Type': 'application/octet-stream' },
            'fobariummuch'
        );
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should parse URLEncoded request body payloads', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            autoParseBody: true,
            api({ post }){
                post('/foobar', ({ body, res }) => {
                    assert.strictEqual(body.foo, 'bar');
                    res.end();
                });
            }
        });
        await app.start();
        const { status } = await muhb.post(LOCAL_HOST + '/foobar',
            { 'Content-Type': 'application/x-www-form-urlencoded' },
            'foo=bar'
        );
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should not parse request body when setup so', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            api({ post }){
                post('/foobar', ({ body, res }) => {
                    assert.strictEqual(body.constructor.name, 'IncomingMessage');
                    res.end();
                });
            }
        });
        await app.start();
        const { status } = await muhb.post(LOCAL_HOST + '/foobar',
            { 'Content-Type': 'application/x-www-form-urlencoded' },
            'foo=bar'
        );
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should catch body issues even when called explicitly', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            api({ post }){
                post('/foobar', async ({ body, res }) => {
                    const b = await body.parse();
                    assert.strictEqual(b.foo, 'bar');
                    res.end();
                });
            }
        });
        await app.start();
        const { status, body } = await muhb.post(LOCAL_HOST + '/foobar',
            { 'Content-Type': 'application/json' }, '{sdfs');
        assert.strictEqual(status, 400);
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
        const req = muhb.post(LOCAL_HOST + '/chunked', {
            stream: true, 'Transfer-Encoding': 'chunked' });

        req.write('123');
        await new Promise(done => setTimeout(done, 500));
        req.write('45');
        await new Promise(done => setTimeout(done, 500));
        req.end();

        const { status } = await req;
        assert.strictEqual(status, 201);
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

        const req = muhb.post(LOCAL_HOST + '/tto', {
            'Content-Type': 'text/plain',
            stream: true
        });

        req.write('abc');

        await new Promise(resolve => setTimeout(resolve, 700));

        const { status } = await req;

        assert.strictEqual(status, 408);
        await app.stop();
    });

    it('Should abort route when client conneciton is reset while reading req body', async () => {

        let abortedRouted = true;
        let startedRoute = false;
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

        const req = muhb.post(LOCAL_HOST + '/tto', {
            'Content-Type': 'text/plain',
            stream: true
        });

        req.write('abc');
        req.on('error', Function.prototype);
        await new Promise(resolve => setTimeout(resolve, 300));
        req.destroy();

        await app.stop();
        assert(abortedRouted);
        assert(startedRoute);
    });

});

describe('Assertions', () => {

    it('Should throw when condition evaluates to true', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            api({ get }){
                get('/foo', function({ res }){
                    assert.throws( () => res.badRequest(true, Buffer.from('abc')) );
                    assert.throws( () => res.unauthorized(true) );
                    assert.throws( () => res.forbidden(true) );
                    assert.throws( () => res.notFound(true) );
                    assert.throws( () => res.conflict(true) );
                    assert.throws( () => res.gone(true) );
                    res.end();
                });
            }
        });
        await app.start();
        await muhb.get(LOCAL_HOST + '/foo');
        await app.stop();
    });

    it('Should do nothing when condition evaluates to false', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            api({ get }){
                get('/foo', function({ res }){
                    assert.doesNotThrow( () => res.badRequest(false) );
                    assert.doesNotThrow( () => res.unauthorized(false) );
                    assert.doesNotThrow( () => res.forbidden(false) );
                    assert.doesNotThrow( () => res.notFound(false) );
                    assert.doesNotThrow( () => res.conflict(false) );
                    assert.doesNotThrow( () => res.gone(false) );
                    res.end();
                });
            }
        });
        await app.start();
        await muhb.get(LOCAL_HOST + '/foo');
        await app.stop();
    });

    it('Should interpolate %s variables in assertion message', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            api({ get }){
                get('/foo', function({ res }){
                    res.badRequest(true, '%sfoo%sbaz%%s', 1, 'bar', 2);
                });
            }
        });
        await app.start();
        const { body } = await muhb.get(LOCAL_HOST + '/foo');
        assert.strictEqual(body, '1foobarbaz%s 2');
        await app.stop();
    });

});

describe('Error Handling', () => {
    const fs = require('fs');

    it('Should handle Error thrown sync on the route', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            api({ post }){
                post('/unknown', () => {
                    throw new Error('othererr');
                });
            }
        });
        await app.start();
        const { status: status } = await muhb.post(LOCAL_HOST + '/unknown');
        assert.strictEqual(status, 500);
        await app.stop();
    });

    it('Should handle Error injected sync on the route', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            api({ post }){
                post('/known', ({ res }) => {
                    throw res.error(404, 'abc %s', 'def');
                });
                post('/unknown', ({ res }) => {
                    throw res.error(new Error('errfoobar'));
                });
                post('/serverfault', ({ res }) => {
                    throw res.error(501, { test: 'foo' });
                });
            }
        });
        await app.start();
        const { status } = await muhb.post(LOCAL_HOST + '/known');
        assert.strictEqual(status, 404);
        const { status: s2 } = await muhb.post(LOCAL_HOST + '/unknown');
        assert.strictEqual(s2, 500);
        const { status: s3 } = await muhb.post(LOCAL_HOST + '/serverfault');
        assert.strictEqual(s3, 501);
        await app.stop();
    });

    it('Should handle Rejection on async route', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            api({ post }){
                post('/async', async () => {
                    await new Promise((y, n) => n(new Error('foo')));
                });
            }
        });
        await app.start();
        const { status } = await muhb.post(LOCAL_HOST + '/async');
        assert.strictEqual(status, 500);
        await app.stop();
    });

    it('Should handle Error injected ASYNC on the route', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            api({ post }){
                post('/known', ({ res }) => {
                    fs.readdir('.', function(){
                        res.error(404, true);
                    });
                });
                post('/unknown', async ({ res }) => {
                    await fs.readdir('.', function(){
                        res.error({ a: 'b' });
                    });
                });
                post('/unknown/object', ({ res }) => {
                    res.error(Buffer.from('abc'));
                });
            }
        });
        await app.start();
        const { status } = await muhb.post(LOCAL_HOST + '/known');
        assert.strictEqual(status, 404);
        const { status: s2 } = await muhb.post(LOCAL_HOST + '/unknown');
        assert.strictEqual(s2, 500);
        const { status: s3 } = await muhb.post(LOCAL_HOST + '/unknown/object');
        assert.strictEqual(s3, 500);
        await app.stop();
    });

});

describe('Logging', () => {

    it('Should not log filtered level and type', async () => {
        const app = new Nodecaf();
        app.setup({ log: { only: 'test', level: 'info' } });
        await app.start();
        assert.strictEqual(app.log.debug({ type: 'test' }), false);
        assert.strictEqual(app.log.info({ type: 'foo' }), false);
        assert(app.log.info({ type: 'test' }));
        await app.stop();
    });

    it('Should not log when disbled via conf', async () => {
        const app = new Nodecaf({ conf: { log: false } });
        await app.start();
        assert.strictEqual(app.log.debug('my entry'), false);
        assert.strictEqual(app.log.error({ type: 'foo' }), false);
        await app.stop();
    });

});

describe('Regression', () => {

    it('Should handle errors even when error event has no listeners', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            api({ post }){
                post('/bar', () => {
                    throw new Error('errfoobar');
                });
            }
        });
        await app.start();
        const { status } = await muhb.post(LOCAL_HOST + '/bar');
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
            api({ get }){
                get('/foo', function({ res }){
                    res.cookie('test', 'foo', cookieOpts);
                    res.cookie('testa', 'bar', cookieOpts);
                    res.json(cookieOpts);
                });
            }
        });
        await app.start();
        const { body } = await muhb.get(LOCAL_HOST + '/foo');
        assert.strictEqual(JSON.parse(body).maxAge, 68300000);
        await app.stop();
    });

    it('Should NOT send reponse body when assertion has no message', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            api({ get }){
                get('/foo', function({ res }){
                    res.unauthorized(true);
                });
            }
        });
        await app.start();
        const { headers, body } = await muhb.get(LOCAL_HOST + '/foo');
        assert(!headers['content-type']);
        assert.strictEqual(body.length, 0);
        await app.stop();
    });

    it('Should not crash on weird json body', done => {

        (async function(){
            const app = new Nodecaf({
                autoParseBody: true,
                conf: { port: 80 },
                api({ post }){
                    post('/foobar', function({ res }){
                        res.end();
                    });
                }
            });
            await app.start();
            process.on('uncaughtException', done);
            process.on('unhandledRejection', done);
            const { status } = await muhb.post(LOCAL_HOST + '/foobar',
                { 'Content-Type': 'application/json' },
                '{"sdf:'
            );
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
            api({ get }){
                get('/foo/:id', function({ res }){
                    res.text('shortest');
                });
                get('/foo/:id/abc', function({ res }){
                    res.text('largest');
                });
            }
        });
        await app.start();
        const { body } = await muhb.get(LOCAL_HOST + '/foo/123/abc');
        assert.strictEqual(body, 'largest');
        await app.stop();
    });

});

describe('Other Features', function(){

    it('Should send permissive CORS headers when setup so [cors]', async () => {
        const app = new Nodecaf({
            conf: { cors: true, port: 80 },
            api({ get }){
                get('/foobar', ({ res }) => res.end() );
            }
        });
        await app.start();

        const { status, headers } = await muhb.get(LOCAL_HOST + '/foobar',
            { 'Origin': 'http://outsider.com' });
        assert.strictEqual(status, 200);
        assert.strictEqual(headers['access-control-allow-origin'], '*');

        const r = await muhb.options(LOCAL_HOST + '/foobar',
            { 'Origin': 'http://outsider.com' });
        assert.strictEqual(r.headers['access-control-allow-methods'],
            'GET,HEAD,PUT,PATCH,POST,DELETE');

        await app.stop();
    });

    it('Should not send CORS headers when setup so [cors]', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            api({ get }){
                get('/foobar', ({ res }) => res.end() );
            }
        });
        await app.start();
        const { status, headers } = await muhb.get(LOCAL_HOST + '/foobar',
            { 'Origin': 'http://outsider.com' });
        assert.strictEqual(status, 200);
        assert.strictEqual(headers['access-control-allow-origin'], undefined);
        await app.stop();
    });

    it('Should store data to be accessible to all handlers [app.global]', async () => {
        const app = new Nodecaf({
            conf: { port: 80 },
            api({ post }){
                post('/bar', ({ foo, res }) => {
                    res.text(foo);
                })
            }
        });
        await app.start();
        app.global.foo = 'foobar';
        const { body } = await muhb.post(LOCAL_HOST + '/bar');
        assert.strictEqual(body, 'foobar');
        await app.stop();
    });

    it('Should delay server initialization by given milliseconds [conf.delay]', async function(){
        const app = new Nodecaf({
            conf: { delay: 1500, port: 80 },
            api({ get }){
                get('/foobar', ({ res }) => res.end());
            }
        });
        const ps = app.start();
        await new Promise(done => setTimeout(done, 400));
        await assert.rejects(muhb.get(LOCAL_HOST + '/foobar', { timeout: 200 }));
        await ps;
        const { status } = await muhb.get(LOCAL_HOST + '/foobar');
        assert.strictEqual(status, 200);
        await app.stop();
    });

});

describe('run()', () => {
    const path = require('path');
    const { run } = require('../lib/main');

    const appPath = path.resolve(__dirname + '/res');
    const bAppPath = path.resolve(__dirname + '/res/lib/bad-index');

    it('Should fail with bad init path', () => {
        assert.throws(() => run());
        assert.throws(() => run({ path: true }));
    });

    it('Should fail when init returns other than App', () => {
        assert.throws(() => run({ path: bAppPath }), /Cannot find module/);
    });

    it('Should run the given app server', async () => {
        const app = await run({ path: appPath });
        const { body } = await app.trigger('get', '/bar');
        assert.strictEqual(body, 'foo');
        await app.stop();
    });

    it('Should inject the given conf object', async () => {
        const app = await run({ path: appPath, conf: { key: 'value' } });
        const { body } = await app.trigger('get', '/bar');
        assert.strictEqual(body, 'value');
        await app.stop();
    });

    it('Should inject multiple conf objects', async () => {
        const app = await run({
            path: appPath,
            conf: [ { key: 'value' }, './package.json' ]
        });
        const { body } = await app.trigger('get', '/bar');
        assert.strictEqual(body, 'nodecaf');
        await app.stop();
    });

});
