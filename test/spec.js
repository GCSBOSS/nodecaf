const assert = require('assert');

process.env.NODE_ENV = 'testing';

// Address for the tests' local servers to listen.
const LOCAL_HOST = 'http://localhost:80'

describe('Promise Error Adapter', () => {
    const adapt = require('../lib/a-sync-error-adapter');

    it('Should handle errors for regular functions', done => {
        let func = () => { throw new Error('foobar') };
        let af = adapt(func);
        af(function(err){
            assert.strictEqual(err.message, 'foobar');
            done();
        }, 'bar');
    });

    it('Should handle errors for async functions', done => {
        let func = async () => await new Promise((resolve, reject) => reject('foobar'));
        let af = adapt(func);
        af(function(err){
            assert.strictEqual(err, 'foobar');
            done();
        }, 'bar');
    });

});

const { get, context, request } = require('muhb');
let base = context(LOCAL_HOST);

describe('AppServer', () => {
    const AppServer = require('../lib/app-server');

    describe('constructor', () => {

        it('Should store any settings sent', () => {
            let app = new AppServer({ key: 'value' });
            assert.strictEqual(app.conf.key, 'value');
        });

    });

    describe('#start', () => {

        it('Should start the http server on port 80', async () => {
            let app = new AppServer();
            await app.start();
            let { assert } = await base.get('');
            assert.status.is(503);
            await app.stop();
        });

        it('Should prevent starting a running server', async () => {
            let app = new AppServer();
            await app.start();
            assert.strictEqual(await app.start(), false);
            await app.stop();
        });

        it('Should start the http server on port sent', async () => {
            let app = new AppServer({ port: 8765 });
            await app.start();
            let { assert } = await get('http://127.0.0.1:8765/');
            assert.status.is(503);
            await app.stop();
        });

        it('Should trigger before start event', async () => {
            let app = new AppServer();
            let done = false;
            app.beforeStart = async () => done = await true;
            await app.start();
            assert(done);
            await app.stop();
        });

        it('Should rebuild the api when setup [this.alwaysRebuildAPI]', async () => {
            let app = new AppServer();
            app.alwaysRebuildAPI = true;
            await app.start();
            let { assert } = await base.get('');
            assert.status.is(404);
            await app.stop();
            app.buildAPI = function({ get }){
                get('/foobar', ({ res }) => res.end());
            };
            await app.start();
            let { assert: { status } } = await base.get('foobar');
            status.is(200);
            await app.stop();
        });

    });

    describe('#api', () => {

        it('Should execute the callback passing the method funcs', done => {
            let app = new AppServer();
            app.api(function(funcs){
                assert.strictEqual(typeof funcs, 'object');
                done();
            });
        });

        it('Should allow registering routes to Express', async () => {
            let app = new AppServer();
            app.api(function({ post, del, get, patch, put, head }){
                post('/foo', ({res}) => res.status(500).end() );
                let routes = app.express._router.stack.filter(
                    l => l.route && l.route.path == '/foo' );
                assert.strictEqual(routes.length, 1);
                assert.strictEqual(typeof del, 'function');
                assert.strictEqual(typeof get, 'function');
                assert.strictEqual(typeof put, 'function');
                assert.strictEqual(typeof patch, 'function');
                assert.strictEqual(typeof head, 'function');
            });
            await app.start();
            let { assert: { status } } = await base.post('foo');
            status.is(500);
            await app.stop();
        });

        it('Should preserve local vars across functions of a route', async function(){
            this.timeout(4000);
            let app = new AppServer();
            app.api(function({ get }){
                get('/bar',
                    ({ flash, next }) => { flash.foo = 'bar'; next(); },
                    ({ flash, res }) => res.end(flash.foo) );
            });
            await app.start();
            let { assert: { body } } = await base.get('bar');
            body.exactly('bar');
            await app.stop();
        });

        it('Should not bulid the API right away if setup [this.alwaysRebuildAPI]', async () => {
            let app = new AppServer();
            app.alwaysRebuildAPI = true;
            app.api(function({ get }){
                get('/foobar', ({ res }) => res.end());
            });
            app.alwaysRebuildAPI = false;
            await app.start();
            let { assert } = await base.get('foobar');
            assert.status.is(503);
            await app.stop();
        });

    });

    describe('#expose', () => {

        it('Should store data to be accessible to all handlers', async () => {
            let app = new AppServer();
            app.expose({ foo: 'foobar' });
            app.api(function({ post }){
                post('/bar', ({ foo, res }) => res.end(foo));
            });
            await app.start();
            let { assert: { body } } = await base.post('bar');
            body.exactly('foobar');
            await app.stop();
        });

    });

    describe('#stop', () => {

        it('Should stop the http server', async function(){
            let app = new AppServer();
            await app.start();
            await app.stop();
            this.timeout(3000);
            await assert.rejects(base.get(''));
        });

        it('Should trigger after stop event', async () => {
            let app = new AppServer();
            let done = false;
            app.afterStop = async () => done = await true;
            await app.start();
            await app.stop();
            assert(done);
        });

        it('Should not fail when calling close sucessively', async () => {
            let app = new AppServer();
            await app.start();
            await app.stop();
            assert.doesNotReject( app.stop() );
        });

    });

    describe('#restart', () => {

        it('Should take down the sever and bring it back up', async () => {
            let app = new AppServer();
            await app.start();
            (await base.get('')).assert.status.is(503);
            await app.restart();
            (await base.get('')).assert.status.is(503);
            await app.stop();
        });

        it('Should reload conf when new object is sent', async () => {
            let app = new AppServer();
            await app.start();
            await app.restart({ myKey: 3 });
            assert.strictEqual(app.conf.myKey, 3);
            await app.stop();
        });

    });

    describe('#accept', () => {

        it('Should reject unwanted content-types API-wide', async () => {
            let app = new AppServer();
            app.api(function({ post }){
                this.accept([ 'urlencoded', 'text/html' ]);
                assert(this.accepts.includes('application/x-www-form-urlencoded'));
                assert.strictEqual(this.accepts.length, 2);
                post('/foo', ({ res }) => res.end());
            });
            await app.start();
            let { assert: { body, status } } = await base.post(
                'foo',
                { 'Content-Type': '2342' },
                '{"foo":"bar"}'
            );
            status.is(400);
            body.match(/Unsupported/);
            await app.stop();
        });

        it('Should reject requests without content-type', async () => {
            let app = new AppServer();
            app.api(function({ post }){
                this.accept('text/html');
                post('/foo', ({ res }) => res.end());
            });
            await app.start();
            let { assert } = await base.post(
                'foo',
                { 'no-auto': true, 'Content-Length': 13 },
                '{"foo":"bar"}'
            );
            assert.status.is(400);
            assert.body.match(/Missing/);
            await app.stop();
        });

        it('Should accept wanted content-types API-wide', async () => {
            let app = new AppServer();
            app.api(function({ post }){
                this.accept([ 'urlencoded', 'text/html' ]);
                post('/foo', ({ res }) => res.end());
            });
            await app.start();
            let { assert } = await base.post(
                'foo',
                { 'Content-Type': 'text/html' },
                '{"foo":"bar"}'
            );
            assert.status.is(200);
            await app.stop();
        });

        it('Should accept requests without body payload', async () => {
            let app = new AppServer();
            app.api(function({ post }){
                this.accept([ 'urlencoded', 'text/html' ]);
                post('/foo', ({ res }) => res.end());
            });
            await app.start();
            let { assert } = await base.post('foo', { 'no-auto': true });
            assert.status.is(200);
            await app.stop();
        });

    });

    describe('#setup', () => {

        it('Should apply settings on top of existing one', () => {
            let app = new AppServer({ key: 'value' });
            app.setup({ key: 'value2', key2: 'value' });
            assert.strictEqual(app.conf.key, 'value2');
            assert.strictEqual(app.conf.key2, 'value');
        });

        it('Should load form file when path is sent', () => {
            let app = new AppServer({ key: 'valueOld' });
            app.setup('test/res/conf.toml');
            assert.strictEqual(app.conf.key, 'value');
        });

        it('Should rebuild the api when setup [this.alwaysRebuildAPI]', async () => {
            let app = new AppServer();
            app.alwaysRebuildAPI = true;
            app.buildAPI = function({ get }){
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

describe('REST/Restify Features', () => {
    const fs = require('fs');
    const AppServer = require('../lib/app-server');

    const { EventEmitter } = require('events');
    const { addRoute } = require('../lib/route-adapter');

    it('Should fail when anything other than a function is passed', () => {
        let ee = new EventEmitter();
        assert.throws( () => addRoute.bind(ee)('get', '/foo', 4) );
    });

    it('Should add adapted handler to chosen route', () => {
        let ee = new EventEmitter();
        ee.express = {
            foo(path){ assert.strictEqual(path, 'foo') }
        };
        addRoute.bind(ee)('foo', 'foo', function bar(){ });
    });

    it('Should pass all the required args to adapted function', async () => {
        let app = new AppServer();
        app.api(function({ get }){
            get('/foo', function(obj){
                assert(obj.res && obj.req && obj.next && obj.body === ''
                    && obj.params && obj.query && obj.flash && obj.error
                    && obj.conf && obj.log);
                assert(this instanceof AppServer);
                obj.res.end();
            });
        });
        await app.start();
        (await base.get('foo')).assert.status.is(200);
        await app.stop();
    });

    it('Should expose file content sent as multipart/form-data', async () => {
        const FormData = require('form-data');
        let app = new AppServer();
        app.api(function({ post }){
            post('/bar', ({ res, req }) => {
                assert(req.files.foobar.size > 0);
                res.set('X-Test', req.files.foobar.name);
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
        let app = new AppServer();
        app.api(function({ post }){
            post('/foobar', ({ body, res }) => {
                assert.strictEqual(body.foo, 'bar');
                res.end();
            });
        });
        await app.start();
        let { assert: { status } } = await base.post(
            'foobar',
            { 'Content-Type': 'application/json' },
            JSON.stringify({foo: 'bar'})
        );
        status.is(200);
        await app.stop();
    });

    it('Should parse Raw request body payloads', async () => {
        let app = new AppServer();
        app.api(function({ post }){
            post('/foobar', ({ body, res }) => {
                assert.strictEqual(body, '{"foo":"bar"}');
                res.end();
            });
        });
        await app.start();
        let { assert: { status } } = await base.post(
            'foobar',
            { '--no-auto': true, 'Content-Length': 13 },
            JSON.stringify({foo: 'bar'})
        );
        status.is(200);
        await app.stop();
    });

    it('Should parse URLEncoded request body payloads', async () => {
        let app = new AppServer();
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
        let app = new AppServer();
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

    it('Should parse URL query string', async () => {
        let app = new AppServer();
        app.api(function({ post }){
            post('/foobar', ({ query, res }) => {
                assert.strictEqual(query.foo, 'bar');
                res.end();
            });
        });
        await app.start();
        let { status } = await base.post('foobar?foo=bar');
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should output a 404 when no route is found for a given path', async () => {
        let app = new AppServer();
        app.api(function(){  });
        await app.start();
        let { status, body } = await base.post('foobar');
        assert.strictEqual(status, 404);
        assert.strictEqual(body, '');
        await app.stop();
    });

    it('Should output a JSON when the error message is an object', async () => {
        let app = new AppServer();
        app.api(function({ post }){
            post('/foobar', ({ error }) => {
                error('NotFound', { foo: 'bar' });
            });
        });
        await app.start();
        let { body } = await base.post('foobar');
        assert.doesNotThrow( () => JSON.parse(body) );
        await app.stop();
    });

    it('Should throw exception when routes handlers are anything other than function or object', () => {
        let app = new AppServer();
        app.api(function({ post }){
            assert.throws(() => post('/foobar', undefined), TypeError);
        });
    });

    describe('CORS', () => {

        it('Should send permissive CORS headers when setup so [cors]', async () => {
            let app = new AppServer({ cors: true });
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

    describe('Accept setter', () => {
        const { accept } = require('../lib/parse-types');

        it('Should reject unwanted content-types for the given route', async () => {
            let app = new AppServer();
            app.api(function({ post }){
                let acc = accept([ 'urlencoded', 'text/html' ]);
                assert(acc.accept.includes('application/x-www-form-urlencoded'));
                post('/foo', acc, ({ res }) => res.end());
            });
            await app.start();
            let { body, status } = await base.post(
                'foo',
                { 'Content-Type': 'application/json' },
                '{"foo":"bar"}'
            );
            assert.strictEqual(status, 400);
            assert(/Unsupported/.test(body));
            await app.stop();
        });

        it('Should accept wanted content-types for the given route', async () => {
            let app = new AppServer();
            app.api(function({ post }){
                let acc = accept('text/html');
                assert(acc.accept.includes('text/html'));
                post('/foo', acc, ({ res }) => res.end());
            });
            await app.start();
            let { status } = await base.post(
                'foo',
                { 'Content-Type': 'text/html' },
                '{"foo":"bar"}'
            );
            assert.strictEqual(status, 200);
            await app.stop();
        });

        it('Should accept requests without a body payload', async () => {
            let app = new AppServer();
            app.api(function({ post }){
                let acc = accept('text/html');
                post('/foo', acc, ({ res }) => res.end());
            });
            await app.start();
            let { status } = await base.post(
                'foo',
                { 'no-auto': true },
                '{"foo":"bar"}'
            );
            assert.strictEqual(status, 200);
            await app.stop();
        });

    });

});

describe('Assertions', () => {
    const { valid, authorized, authn, exist, able } = require('../lib/assertions');

    describe('Simple assertions ( condition, message, ...args )', () => {

        it('Should throw when condition evaluates to false', () => {
            assert.throws( () => valid(false, 'foo') );
            assert.throws( () => authorized(false, 'foo') );
            assert.throws( () => authn(false, 'foo') );
            assert.throws( () => exist(false) );
            assert.throws( () => able(false, 'foo') );
        });

        it('Should do nothing when condition evaluates to true', () => {
            assert.doesNotThrow( () => valid(true, 'foo') );
            assert.doesNotThrow( () => authorized(true, 'foo') );
            assert.doesNotThrow( () => authn(true, 'foo') );
            assert.doesNotThrow( () => exist(true, 'foo') );
            assert.doesNotThrow( () => able(true, 'foo') );
        });

        it('Should execute handler when sent', done => {
            const func = e => {
                assert.strictEqual(e.type, 'Unauthorized');
                done();
            };
            assert.doesNotThrow( () => authorized(false, 'foo', func) );
        });

    });

});

describe('Error Handling', () => {
    const AppServer = require('../lib/app-server');
    const fs = require('fs');

    it('Should handle Error thrown sync on the route', async () => {
        let app = new AppServer();
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
        let app = new AppServer();
        app.api(function({ post }){
            post('/known', ({ error }) => {
                error('ServerFault');
            });
            post('/unknown', ({ error }) => {
                error(new Error('errfoobar'));
            });
        });
        await app.start();
        let { status } = await base.post('known');
        assert.strictEqual(status, 500);
        let { status: s2 } = await base.post('unknown');
        assert.strictEqual(s2, 500);
        await app.stop();
    });

    it('Should handle Error injected ASYNC on the route', async () => {
        let app = new AppServer();
        app.api(function({ post }){
            post('/known', ({ error }) => {
                fs.readdir('.', function(){
                    error('NotFound', 'errfoobar');
                });
            });
            post('/unknown', ({ error }) => {
                fs.readdir('.', function(){
                    error(new Error('errfoobar'));
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

    it('Should execute intermediary error handler', async () => {
        let app = new AppServer();
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

    it('Should allow tapping into the thrown error', async () => {
        let app = new AppServer();
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

    it('Should expose handler args object to user error handler', async () => {
        let app = new AppServer();
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
    const { AppServer } = require('../lib/main');

    it('Should log given event', async () => {
        let app = new AppServer();
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

    it('Should not log filtered level and class', async () => {
        let app = new AppServer();
        app.setup({ log: { class: 'test', level: 'info' } });
        await app.start();
        assert.strictEqual(app.log.debug({ class: 'test' }), false);
        assert.strictEqual(app.log.info({ class: 'foo' }), false);
        assert(app.log.info({ class: 'test' }));
        await app.stop();
    });

});

describe('HTTPS', () => {
    const AppServer = require('../lib/app-server');
    const https = require('https');

    it('Should start HTTPS server when specified', async function(){
        let app = new AppServer({
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
    const AppServer = require('../lib/app-server');

    it('Should handle errors even when error event has no listeners', async () => {
        let app = new AppServer();
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

    it('Should NOT attach new error handlers upon request', async () => {

        let app = new AppServer();
        app.api(function({ post }){
            post('/bar', () => {
                throw new Error('errfoobar');
            });
        });
        await app.start();

        let r1 = (await base.post('bar')).body;
        let r2 = (await base.post('bar')).body;
        let r3 = (await base.post('bar')).body;
        assert(r1 == r2 && r2 == r3 && r3 == 'errfoobar');

        await app.stop();

    });

    it('Should show default message for REST errors thrown as strings', async () => {
        let app = new AppServer();
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

    it('Should execute user error handler even if headers were already sent', async () => {
        let app = new AppServer();
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
        let app = new AppServer();
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

});

describe('WebSocket', function(){

    const AppServer = require('../lib/app-server');
    const WebSocket = require('ws');

    it('Should accept websocket connections and messages', function(done){
        let count = 0;
        let app = new AppServer();
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
        let app = new AppServer();
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
    //     let app = new AppServer();
    //     app.api(({ ws }) => {
    //         ws('/foo', { error: done });
    //     });
    //     (async function(){
    //         await app.start();
    //         let ws = new WebSocket('ws://localhost/foo');
    //         ws.destroy();
    //     })();
    // });

});

describe('Other Features', function(){
    const AppServer = require('../lib/app-server');

    it('Should delay server initialization by given milliseconds [delay]', async function(){
        let app = new AppServer({ delay: 1500 });
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
