const assert = require('assert');

process.env.NODE_ENV = 'testing';

// Address for the tests' local servers to listen.
const LOCAL_HOST = 'http://localhost:80'

const { get, context, request } = require('muhb');
let base = context(LOCAL_HOST);

const Nodecaf = require('../lib/main');

describe('Nodecaf', () => {

    describe('constructor', () => {

        it('Should store any settings sent', () => {
            let app = new Nodecaf({ key: 'value' });
            assert.strictEqual(app.conf.key, 'value');
        });

    });

    describe('#start', () => {

        it('Should start the http server on port 80', async () => {
            let app = new Nodecaf();
            await app.start();
            let { assert } = await base.get('');
            assert.status.is(404);
            await app.stop();
        });

        it('Should prevent starting a running server', async () => {
            let app = new Nodecaf();
            await app.start();
            assert.strictEqual(await app.start(), false);
            await app.stop();
        });

        it('Should start the http server on port sent', async () => {
            let app = new Nodecaf({ port: 8765 });
            await app.start();
            let { assert } = await get('http://127.0.0.1:8765/');
            assert.status.is(404);
            await app.stop();
        });

        it('Should trigger before start event', async () => {
            let app = new Nodecaf();
            let done = false;
            app.startup(() => done = true);
            await app.start();
            assert(done);
            await app.stop();
        });

        it('Should rebuild the api when setup [this.alwaysRebuildAPI]', async () => {
            let app = new Nodecaf();
            app.alwaysRebuildAPI = true;
            await app.start();
            let { assert } = await base.get('');
            assert.status.is(404);
            await app.stop();
            app._api = function({ get }){
                get('/foobar', ({ res }) => res.end());
            };
            await app.start();
            let { assert: { status } } = await base.get('foobar');
            status.is(200);
            await app.stop();
        });

    });

    describe('#startup', () => {

        it('Should fail when startup handler is not a function', () => {
            let app = new Nodecaf();
            assert.throws( () => app.startup(), /function/ );
        });

    });

    describe('#shutdown', () => {

        it('Should fail when shutdown handler is not a function', () => {
            let app = new Nodecaf();
            assert.throws( () => app.shutdown(), /function/ );
        });

    });

    describe('#api', () => {

        it('Should fail when builder is not a function', () => {
            let app = new Nodecaf();
            assert.throws( () => app.api(), /function/ );
        });

        it('Should execute the callback passing the method funcs', done => {
            let app = new Nodecaf();
            app.api(function(funcs){
                assert.strictEqual(typeof funcs, 'object');
                done();
            });
        });

        it('Should allow registering routes', async () => {
            let app = new Nodecaf();
            app.api(function({ post, del, patch }){
                post('/foo', ({res}) => res.status(500).end() );
                assert.strictEqual(typeof del, 'function');
                assert.strictEqual(typeof patch, 'function');
            });
            await app.start();
            let { assert: { status } } = await base.post('foo');
            status.is(500);
            await app.stop();
        });

        it('Should preserve flash vars across handlers in a route', async function(){
            this.timeout(4000);
            let app = new Nodecaf();
            app.api(function({ get }){
                get('/bar',
                    ({ flash, next }) => { flash.foo = 'bar'; next(); },
                    ({ flash, res }) => {
                        res.type('text/plain');
                        res.end(flash.foo); 
                    });
            });
            await app.start();
            let { assert: { body } } = await base.get('bar');
            body.exactly('bar');
            await app.stop();
        });

        it('Should NOT bulid the API right away if setup [this.alwaysRebuildAPI]', async () => {
            let app = new Nodecaf();
            app.alwaysRebuildAPI = true;
            app.api(function({ get }){
                get('/foobar', ({ res }) => res.end());
            });
            app.alwaysRebuildAPI = false;
            await app.start();
            let { assert } = await base.get('foobar');
            assert.status.is(404);
            await app.stop();
        });

    });

    describe('#global', () => {

        it('Should store data to be accessible to all handlers', async () => {
            let app = new Nodecaf();
            app.global({ foo: 'foobar' });
            app.api(function({ post }){
                post('/bar', ({ foo, res }) => res.text(foo));
            });
            await app.start();
            let { assert: { body } } = await base.post('bar');
            body.exactly('foobar');
            await app.stop();
        });

    });

    describe('#stop', () => {

        it('Should stop the http server', async function(){
            let app = new Nodecaf();
            await app.start();
            await app.stop();
            this.timeout(3000);
            await assert.rejects(base.get(''));
        });

        it('Should trigger after stop event', async () => {
            let app = new Nodecaf();
            let done = false;
            app.shutdown(() => done = true);
            await app.start();
            await app.stop();
            assert(done);
        });

        it('Should not fail when calling close sucessively', async () => {
            let app = new Nodecaf();
            await app.start();
            await app.stop();
            assert.doesNotReject( app.stop() );
        });

    });

    describe('#restart', () => {

        it('Should take down the sever and bring it back up', async function() {
            this.timeout(3000);
            let app = new Nodecaf();
            await app.start();
            (await base.get('')).assert.status.is(404);
            await app.restart();
            (await base.get('')).assert.status.is(404);
            await app.stop();
        });

        it('Should reload conf when new object is sent', async () => {
            let app = new Nodecaf();
            await app.start();
            await app.restart({ myKey: 3 });
            assert.strictEqual(app.conf.myKey, 3);
            await app.stop();
        });

    });

    describe('#setup', () => {

        it('Should apply settings on top of existing one', () => {
            let app = new Nodecaf({ key: 'value' });
            app.setup({ key: 'value2', key2: 'value' });
            assert.strictEqual(app.conf.key, 'value2');
            assert.strictEqual(app.conf.key2, 'value');
        });

        it('Should load form file when path is sent', () => {
            let app = new Nodecaf({ key: 'valueOld' });
            app.setup('test/res/conf.toml');
            assert.strictEqual(app.conf.key, 'value');
        });

        it('Should rebuild the api when setup [this.alwaysRebuildAPI]', async () => {
            let app = new Nodecaf();
            app.alwaysRebuildAPI = true;
            app._api = function({ get }){
                get('/foobar', ({ res }) => res.end());
            };
            app.setup();
            app.alwaysRebuildAPI = false;
            await app.start();
            let { assert: { status} } = await base.get('foobar');
            status.is(200);
            await app.stop();
        });

    });

});

describe('Handlers', () => {

    it('Should fail when receiving invalid route handlers', () => {
        let app = new Nodecaf();
        app.api(function({ post }){
            assert.throws(() => post('/foobar', undefined), TypeError);
            assert.throws(() => post('/foobar'), /empty/);
            post('/foobaz', Function.prototype);
            assert.throws(() => post('/foobaz', Function.prototype), /already/);
        });
    });

    it('Should pass all the required args to handler', async () => {
        let app = new Nodecaf();
        app.api(function({ get }){
            get('/foo', function(obj){
                assert(obj.res && obj.req && obj.next && !obj.body
                    && obj.params && obj.query && obj.flash
                    && obj.conf && obj.log);
                assert(this instanceof Nodecaf);
                obj.res.end();
            });
        });
        await app.start();
        (await base.get('foo')).assert.status.is(200);
        await app.stop();
    });

    it('Should pass all present parameters to handler', async () => {
        let app = new Nodecaf();
        app.api(function({ get }){
            get('/fo/:o', Function.prototype);
            get('/foo/:bar', function({ params, res }){
                res.badRequest(params.bar !== 'test');
                res.end();
            });
        });
        await app.start();
        (await base.get('foo/test')).assert.status.is(200);
        await app.stop();
    });

    it('Should parse URL query string', async () => {
        let app = new Nodecaf();
        app.api(function({ post }){
            post('/foobar', ({ query, res, next }) => {
                assert.strictEqual(query.foo, 'bar');
                res.end();
                next();
            });
        });
        await app.start();
        let { status } = await base.post('foobar?foo=bar');
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should output a 404 when no route is found for a given path', async () => {
        let app = new Nodecaf();
        app.api(function(){  });
        await app.start();
        let { status } = await base.post('foobar');
        assert.strictEqual(status, 404);
        await app.stop();
    });

    it('Should parse object as json response [res.json()]', async () => {
        let app = new Nodecaf();
        app.api(function({ get }){
            get('/foo', function({ res }){
                res.json('{"hey":"ho"}');
            });
        });
        await app.start();
        (await base.get('foo')).assert.headers.match('content-type', 'application/json');
        await app.stop();
    });

});

describe('Body Parsing', () => {

    const fs = require('fs');

    it('Should expose file content sent as multipart/form-data', async () => {
        const FormData = require('form-data');
        let app = new Nodecaf();
        app.api(function({ post }){
            post('/bar', ({ body, res }) => {
                assert(body.foobar.size > 10);
                res.set('X-Test', body.foobar.name);
                res.end();
            });
        });
        await app.start();

        let form = new FormData();
        form.append('foo', 'bar');
        form.append('foobar', fs.createReadStream('./test/res/file.txt'));
        await new Promise(resolve =>
            form.submit(LOCAL_HOST + '/bar/', (err, res) => {
                assert(res.headers['x-test'] == 'file.txt');
                resolve();
            })
        );

        await app.stop();
    });

    it('Should parse JSON request body payloads', async () => {
        let app = new Nodecaf();
        app.api(function({ post }){
            post('/foobar', ({ body, res }) => {
                assert.strictEqual(body.foo, 'bar');
                res.end();
            });
        });
        await app.start();
        let { assert: { status } } = await base.post(
            'foobar', { 'Content-Type': 'application/json' }, { foo: 'bar' }
        );
        status.is(200);
        await app.stop();
    });

    it('Should parse Raw request body payloads', async () => {
        let app = new Nodecaf();
        app.api(function({ post }){
            post('/foobar', ({ body, res }) => {
                assert.strictEqual(body, '{"foo":"bar"}');
                res.end();
            });
        });
        await app.start();
        let { assert: { status } } = await base.post(
            'foobar',
            { 'no-auto': true, 'Content-Length': 13 },
            JSON.stringify({foo: 'bar'})
        );
        status.is(200);
        await app.stop();
    });

    it('Should parse URLEncoded request body payloads', async () => {
        let app = new Nodecaf();
        app.api(function({ post }){
            post('/foobar', ({ body, res }) => {
                assert.strictEqual(body.foo, 'bar');
                res.end();
            });
        });
        await app.start();
        let { assert: { status } } = await base.post(
            'foobar',
            { 'Content-Type': 'application/x-www-form-urlencoded' },
            'foo=bar'
        );
        status.is(200);
        await app.stop();
    });

    it('Should not parse request body when setup so', async () => {
        let app = new Nodecaf();
        app.shouldParseBody = false;
        app.api(function({ post }){
            post('/foobar', ({ body, res }) => {
                assert(!body);
                res.end();
            });
        });
        await app.start();
        let { assert: { status } } = await base.post(
            'foobar',
            { 'Content-Type': 'application/x-www-form-urlencoded' },
            'foo=bar'
        );
        status.is(200);
        await app.stop();
    });

});

describe('CORS', () => {

    it('Should send permissive CORS headers when setup so [cors]', async () => {
        let app = new Nodecaf({ cors: true });
        app.api(function({ get }){
            get('/foobar', ({ res }) => res.end() );
        });
        await app.start();
        const { assert } = await base.get('foobar', { 'Origin': 'http://outsider.com' });
        assert.status.is(200);
        assert.headers.match('access-control-allow-origin', '*');
        const { assert: { headers } } = await base.options('foobar', { 'Origin': 'http://outsider.com' });
        headers.match('access-control-allow-methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
        await app.stop();
    });

});

describe('Assertions', () => {

    it('Should throw when condition evaluates to true', async () => {
        let app = new Nodecaf();
        app.api(function({ get }){
            get('/foo', function({ res }){
                assert.throws( () => res.badRequest(true) );
                assert.throws( () => res.unauthorized(true) );
                assert.throws( () => res.forbidden(true) );
                assert.throws( () => res.notFound(true) );
                assert.throws( () => res.conflict(true) );
                assert.throws( () => res.gone(true) );
                res.end();
            });
        });
        await app.start();
        await base.get('foo');
        await app.stop();
    });

    it('Should do nothing when condition evaluates to false', async () => {
        let app = new Nodecaf();
        app.api(function({ get }){
            get('/foo', function({ res }){
                assert.doesNotThrow( () => res.badRequest(false) );
                assert.doesNotThrow( () => res.unauthorized(false) );
                assert.doesNotThrow( () => res.forbidden(false) );
                assert.doesNotThrow( () => res.notFound(false) );
                assert.doesNotThrow( () => res.conflict(false) );
                assert.doesNotThrow( () => res.gone(false) );
                res.end();
            });
        });
        await app.start();
        await base.get('foo');
        await app.stop();
    });

});

describe('Error Handling', () => {
    const fs = require('fs');

    it('Should handle Error thrown sync on the route', async () => {
        let app = new Nodecaf();
        app.api(function({ post }){
            post('/unknown', () => {
                throw new Error('othererr');
            });
        });
        await app.start();
        let { status: status } = await base.post('unknown');
        assert.strictEqual(status, 500);
        await app.stop();
    });

    it('Should handle Error injected sync on the route', async () => {
        let app = new Nodecaf();
        app.api(function({ post }){
            post('/known', ({ res }) => {
                throw res.error(404);
            });
            post('/unknown', ({ res }) => {
                throw res.error(new Error('errfoobar'));
            });
            post('/serverfault', ({ res }) => {
                throw res.error(501);
            });
        });
        await app.start();
        let { status } = await base.post('known');
        assert.strictEqual(status, 404);
        let { status: s2 } = await base.post('unknown');
        assert.strictEqual(s2, 500);
        let { status: s3 } = await base.post('serverfault');
        assert.strictEqual(s3, 501);
        await app.stop();
    });

    it('Should handle Rejection on async route', async () => {
        let app = new Nodecaf();
        app.api(function({ post }){
            post('/async', async () => {
                await new Promise((y, n) => n());
            });
        });
        await app.start();
        let { assert } = await base.post('async');
        assert.status.is(500);
        await app.stop();
    });

    it('Should handle Error injected ASYNC on the route', async () => {
        let app = new Nodecaf();
        app.api(function({ post }){
            post('/known', ({ res }) => {
                fs.readdir('.', function(){
                    res.error(404, 'errfoobar');
                });
            });
            post('/unknown', async ({ res }) => {
                await fs.readdir('.', function(){
                    res.error(new Error('errfoobar'));
                });
            });
            post('/unknown/object', () => {
                throw 'resterr';
            });
        });
        await app.start();
        let { status } = await base.post('known');
        assert.strictEqual(status, 404);
        let { status: s2 } = await base.post('unknown');
        assert.strictEqual(s2, 500);
        let { status: s3 } = await base.post('unknown/object');
        assert.strictEqual(s3, 500);
        await app.stop();
    });

    it.skip('Should execute intermediary error handler', async () => {
        let app = new Nodecaf();
        let count = 0;
        app.onRouteError = function(input, err){
            assert.strictEqual(err.message, 'resterr');
            count++;
        };
        app.api(function({ post }){
            post('/known', () => {
                throw new Error('resterr');
            });
            post('/unknown', ({ error }) => {
                error('NotFound', 'resterr');
            });
        });
        await app.start();
        let { status } = await base.post('known');
        assert.strictEqual(status, 500);
        let { status: s2 } = await base.post('unknown');
        assert.strictEqual(s2, 404);
        assert.strictEqual(count, 2);
        await app.stop();
    });

    it.skip('Should allow tapping into the thrown error', async () => {
        let app = new Nodecaf();
        app.onRouteError = function(input, err, error){
            error('Unauthorized', 'resterr');
        };
        app.api(function({ post }){
            post('/unknown', () => {
                throw new Error('resterr');
            });
        });
        await app.start();
        let { status } = await base.post('unknown');
        assert.strictEqual(status, 401);
        await app.stop();
    });

    it.skip('Should expose handler args object to user error handler', async () => {
        let app = new Nodecaf();
        app.onRouteError = function(input){
            assert.strictEqual(typeof input.req, 'object');
        };
        app.api(function({ post }){
            post('/unknown', () => {
                throw new Error('resterr');
            });
        });
        await app.start();
        await base.post('unknown');
        await app.stop();
    });

});

describe('Logging', () => {

    it('Should log given event', async () => {
        let app = new Nodecaf();
        app.api(function({ post }){
            post('/foo', ({ log, res }) => {
                let entry = log.info('foobar');
                assert.strictEqual(entry.msg, 'foobar');
                res.end();
            });
        });
        await app.start();
        await base.post('foo');
        await app.stop();
    });

    it('Should not log filtered level and type', async () => {
        let app = new Nodecaf();
        app.setup({ log: { type: 'test', level: 'info' } });
        await app.start();
        assert.strictEqual(app.log.debug({ type: 'test' }), false);
        assert.strictEqual(app.log.info({ type: 'foo' }), false);
        assert(app.log.info({ type: 'test' }));
        await app.stop();
    });

});

describe('HTTPS', () => {
    const https = require('https');

    it('Should start HTTPS server when specified', async function(){
        let app = new Nodecaf({
            ssl: {
                key: './test/res/key.pem',
                cert: './test/res/cert.pem'
            }
        });
        app.api(function({ get }){
            get('/foo', ({ res }) => res.end('bar') );
        });
        await app.start();

        process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;
        let res = await new Promise( resolve =>
            https.get('https://localhost/foo', resolve) );

        await new Promise( resolve =>
            res.on('data', chunk => {
                assert.strictEqual(chunk.toString(), 'bar');
                resolve();
            }) );

        await app.stop();
        process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 1;
    });
});

describe('Regression', () => {
    const WebSocket = require('ws');

    it('Should handle errors even when error event has no listeners', async () => {
        let app = new Nodecaf();
        app.api(function({ post }){
            post('/bar', () => {
                throw new Error('errfoobar');
            });
        });
        await app.start();
        let { status } = await base.post('bar');
        assert.strictEqual(status, 500);
        await app.stop();
    });

    it.skip('Should NOT attach new error handlers upon request', async () => {

        let app = new Nodecaf();
        app.api(function({ post }){
            post('/bar', () => {
                throw new Error('errfoobar');
            });
        });
        await app.start();

        let h = { 'Content-Type': 'text/plain' };
        let r1 = (await base.post('bar', h)).body;
        let r2 = (await base.post('bar', h)).body;
        let r3 = (await base.post('bar', h)).body;
        assert(r1 == r2 && r2 == r3 && r3 == 'errfoobar');

        await app.stop();

    });

    it.skip('Should show default message for REST errors thrown as strings', async () => {
        let app = new Nodecaf();
        app.api(function({ post }){
            post('/bar', ({ error }) => {
                error('NotFound');
            });
        });
        await app.start();

        let m = (await base.post('bar')).body;
        assert.strictEqual(m, 'NotFound');

        await app.stop();
    });

    it.skip('Should execute user error handler even if headers were already sent', async () => {
        let app = new Nodecaf();
        app.api(function({ post }){
            post('/bar', ({ res }) => {
                res.end();
                throw new Error();
            });
        });
        let gotHere = false;
        app.onRouteError = function(){
            gotHere = true;
        };
        await app.start();
        app.express.set('env', 'test');
        await base.post('bar');
        await app.stop();
        assert(gotHere);
    });

    it('Should not hang up connections when they have a query string', function(done){
        let count = 0;
        let app = new Nodecaf();
        app.api(({ ws }) => {
            ws('/foo', {
                connect: () => count++,
                async message({ message }){
                    assert.strictEqual('foobar', message);
                    await app.stop();
                    count++;
                },
                close(){
                    assert.strictEqual(count, 2);
                    done();
                }
            });
        });
        (async function(){
            await app.start();
            const ws = new WebSocket('ws://localhost/foo?test=foobar');
            ws.on('open', () => {
                ws.pong();
                ws.send('foobar');
            });
        })();
    });

    it('Should not fail when attempting to close during startup', async () => {
        let app = new Nodecaf();
        let p = app.start();
        await assert.doesNotReject( app.stop() );
        await p;
        await app.stop();
    });

});

describe('WebSocket', function(){

    const WebSocket = require('ws');

    it('Should accept websocket connections and messages', function(done){
        let count = 0;
        let app = new Nodecaf();
        app.api(({ ws }) => {
            ws('/foo', {
                connect: () => count++,
                error: Function.prototype,
                async message({ message }){
                    assert.strictEqual('foobar', message);
                    await app.stop();
                    count++;
                },
                close(){
                    assert.strictEqual(count, 2);
                    done();
                }
            });
        });
        (async function(){
            await app.start();
            const ws = new WebSocket('ws://localhost/foo');
            ws.on('open', () => {
                ws.pong();
                ws.send('foobar');
            });
        })();
    });

    it('Should reject connection to path that is not setup', function(done){
        let app = new Nodecaf();
        app.api(({ ws }) => ws('/foo', {}));
        (async function(){
            await app.start();
            const ws = new WebSocket('ws://localhost/foobar');
            ws.on('error', async () => {
                await app.stop();
                done()
            });
        })();
    });

    // it('Should properly handle client errors', function(done){
    //     let app = new Nodecaf();
    //     app.api(({ ws }) => {
    //         ws('/foo', { error: done });
    //     });
    //     (async function(){
    //         await app.start();
    //         let ws = new WebSocket('ws://localhost/foo');
    //         ws.destroy();
    //     })();
    // });

    // it('Should not fail when client breaks connection during req body read', async () => {
    //     let app = new Nodecaf();
    //     app.api(function({ post }){
    //         post('/foo', Function.prototype);
    //     });
    //     await app.start();
    //     let req = require('http').request(LOCAL_HOST + '/foo', { method: 'POST' });
    //     req.write(JSON.stringify([...Array(2048)].keys()));
    //     req.abort();
    //     await app.stop();
    // });

});

describe('Other Features', function(){

    it('Should delay server initialization by given milliseconds [delay]', async function(){
        let app = new Nodecaf({ delay: 1500 });
        app.api(function({ get }){
            get('/foobar', ({ res }) => res.end());
        });
        let ps = app.start();
        await new Promise(done => setTimeout(done, 400));
        await assert.rejects(request({
            url: 'http://localhost:80/foobar',
            method: 'GET', timeout: 200
        }));
        await ps;
        let { assert: ensure } = await base.get('foobar');
        ensure.status.is(200);
        await app.stop();
    })

});
