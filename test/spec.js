//const wtf = require('wtfnode');
const assert = require('assert');

describe('Conf Loader', () => {
    const loadConf = require('../lib/conf-loader');

    it('Should NOT fail if no conf file is specified', () => {
        let obj = loadConf('toml');
        assert.deepEqual(obj, {});
    });

    it('Should NOT fail if conf file is not found', () => {
        let obj = loadConf('toml', './bla');
        assert.deepEqual(obj, {});
    });

    it('Should properly load a TOML file and generate an object', () => {
        let obj = loadConf('toml', './test/confs/conf.toml');
        assert.strictEqual(obj.key, 'value');
    });
});

describe('Promise Error Adapter', () => {
    const adapt = require('../lib/a-sync-error-adapter');

    it('Should handle errors for regular functions', done => {
        let func = () => { throw new Error('foobar') };

        let af = adapt(func, function(err, test){
            assert.strictEqual(err.message, 'foobar');
            assert.strictEqual(test, 'bar');
            done();
        });

        af('bar');
    });

    it('Should handle errors for async functions', done => {
        let func = async () => await new Promise((resolve, reject) => reject('foobar'));

        let af = adapt(func, function(err, test){
            assert.strictEqual(err, 'foobar');
            assert.strictEqual(test, 'bar');
            done();
        });

        af('bar');
    });

});

describe('Route Adapter', () => {
    const { EventEmitter } = require('events');
    const addRoute = require('../lib/route-adapter');

    it('Should fail when anything other than a function is passed', () => {
        let ee = new EventEmitter();
        assert.throws( () => addRoute.bind(ee)('get', '/foo', null) );
    });

    it('Should add adapted handler to chosen route', () => {
        let ee = new EventEmitter();
        ee.server = {
            foo(path){ assert.strictEqual(path, 'foo') }
        };
        addRoute.bind(ee)('foo', 'foo', function bar(){ });
    });

    it('Should pass all the required args to adapted function', () => {
        let ee = new EventEmitter();
        let fn;
        ee.server = {
            foo(path, handler){ fn = handler }
        };
        addRoute.bind(ee)('foo', 'foo', function bar(args){
            assert.strictEqual(typeof args, 'object');
        });
        fn('foo', 'bar', 'foobar');
    });

    it('Should expose restify error properly', done => {
        let ee = new EventEmitter();
        let fn;
        ee.server = {
            foo(path, handler){ fn = handler }
        };
        ee.on('error', (input, err, send) => send('InternalServer', 'foobar') );
        addRoute.bind(ee)('foo', 'foo', function bar(){
            throw new Error('bar');
        });
        res = { send(err){
            assert.strictEqual(err.message, 'foobar');
            done();
        } };
        fn({}, res, 'foobar');
    });

});

describe('AppServer', () => {
    const AppServer = require('../lib/app-server');
    const { get, post } = require('muhb');

    describe('constructor', () => {

        it('Should store any settings sent', () => {
            const { EventEmitter } = require('events');
            let app = new AppServer({ key: 'value' });
            assert(app instanceof EventEmitter);
            assert.strictEqual(app.settings.key, 'value');
        });

        it('Should create the Restify server', () => {
            let app = new AppServer();
            assert.strictEqual(typeof app.server.use, 'function');
        });

    });

    describe('#start', () => {

        it('Should start the http server on port 80', async () => {
            let app = new AppServer();
            await app.start();
            let { status } = await get('http://127.0.0.1:80/');
            assert.strictEqual(status, 404);
            await app.stop();
        });

        it('Should start the http server on port sent', async () => {
            let app = new AppServer({ port: 8080 });
            await app.start();
            let { status } = await get('http://127.0.0.1:8080/');
            assert.strictEqual(status, 404);
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

    });
    describe('#route', () => {

        it('Should execute the callback passing the method funcs', done => {
            let app = new AppServer();
            app.route(function(funcs){
                assert.strictEqual(typeof funcs, 'object');
                done();
            });
        });

        it('Should allow registering routes to Restify', async () => {
            let app = new AppServer();
            app.route(function({ post, del, get, patch, put, head }){
                post('/foo', ({res}) => res.send(500) );
                assert.strictEqual(app.server.router._registry._routes.postfoo.name, 'postfoo');
                assert.strictEqual(typeof del, 'function');
                assert.strictEqual(typeof get, 'function');
                assert.strictEqual(typeof put, 'function');
                assert.strictEqual(typeof patch, 'function');
                assert.strictEqual(typeof head, 'function');
            });
            await app.start();
            let { status } = await post('http://127.0.0.1:80/foo');
            assert.strictEqual(status, 500);
            await app.stop();
        });

        it('Should preserve local vars across functions of a route', async function(){
            this.timeout(4000);
            let app = new AppServer();
            app.route(function({ get }){
                get('/bar',
                    ({ flash, next }) => { flash.foo = 'bar'; next(); },
                    ({ flash, res }) => res.sendRaw(flash.foo) );
            });
            await app.start();
            let { body } = await get('http://127.0.0.1:80/bar');
            assert.strictEqual(body, 'bar');
            await app.stop();
        });

    });

    describe('#expose', () => {

        it('Should store data to be accessible to all handlers', async () => {
            let app = new AppServer();
            app.expose({ foo: 'foobar' });
            app.route(function({ post }){
                post('/bar', ({ foo, res }) => res.sendRaw(foo));
            });
            await app.start();
            let { body } = await post('http://127.0.0.1:80/bar');
            assert.strictEqual(body, 'foobar');
            await app.stop();
        });

    });

    describe('#stop', () => {

        it('Should stop the http server', async () => {
            let app = new AppServer();
            await app.start();
            await app.stop();
            try{
                await get('http://127.0.0.1:80/');
            }
            catch(e){
                var rejected = e;
            }
            assert(rejected);
        });

        it('Should trigger after stop event', async () => {
            let app = new AppServer();
            let done = false;
            app.afterStop = async () => done = await true;
            await app.start();
            await app.stop();
            assert(done);
        });

    });

    describe('#restart', () => {

        it('Should take down the sever and bring it back up', async () => {
            let app = new AppServer();
            await app.start();
            let { status } = await get('http://127.0.0.1:80/');
            assert.strictEqual(status, 404);
            await app.restart();
            let { status: s } = await get('http://127.0.0.1:80/');
            assert.strictEqual(s, 404);
            await app.stop();
        });

    });

});

describe('Restify Features', () => {
    const fs = require('fs');
    const AppServer = require('../lib/app-server');

    it('Should expose file content sent as multipart-form', async () => {
        const FormData = require('form-data');
        let app = new AppServer();
        app.route(function({ post }){
            post('/bar', ({ res, req }) => {
                res.setHeader('X-Test', req.files.foobar.name);
                res.send(200);
            });
        });
        await app.start();

        let form = new FormData();
        form.append('foo', 'bar');
        form.append('foobar', fs.createReadStream('./test/file.txt'));
        await new Promise(resolve =>
            form.submit('http://localhost/bar/', (err, res) => {
                assert(res.headers['x-test'] == 'file.txt');
                resolve();
            })
        );

        await app.stop();
    });

});

describe('run()', () => {
    const { run, AppServer } = require('../lib/main');
    const { get } = require('muhb');

    it('Should fail when non function is sent', async () => {
        try{
            await run({ init: false });
        }
        catch(e){
            var failed = e;
        }
        assert(failed);
    });

    it('Should run the given app server', async () => {
        let app
        await run({ init(settings){
            assert(typeof settings == 'object');
            app = new AppServer();
            app.route(function({ get }){
                get('/bar', ({ res }) => res.sendRaw('foo'));
            });
            return app;
        } });
        let { body } = await get('http://127.0.0.1:80/bar');
        assert.strictEqual(body, 'foo');
        await app.stop();
    });

});

describe('Assertions', () => {
    const { valid, authorized, authn, exist, able } = require('../lib/assertions');

    describe('Simple assertions ( condition, message, ...args )', () => {

        it('Should throw when condition evaluates to false', () => {
            assert.throws( () => valid(false, 'foo') );
            assert.throws( () => authorized(false, 'foo') );
            assert.throws( () => authn(false, 'foo') );
            assert.throws( () => exist(false, 'foo') );
            assert.throws( () => able(false, 'foo') );
        });

        it('Should do nothing when condition evaluates to true', () => {
            assert.doesNotThrow( () => valid(true, 'foo') );
            assert.doesNotThrow( () => authorized(true, 'foo') );
            assert.doesNotThrow( () => authn(true, 'foo') );
            assert.doesNotThrow( () => exist(true, 'foo') );
            assert.doesNotThrow( () => able(true, 'foo') );
        });

    });

});

describe('Error Handling', () => {
    const handleError = require('../lib/errors');

    it('Should handle RestifyErrors as strings', () => {
        let req = { errClass: 'Conflict', errMessage: 'foobar' };
        let res = {
            send(err){
                assert.strictEqual(err.constructor.displayName, 'ConflictError');
                assert.strictEqual(err.message, 'foobar');
            }
        }
        handleError(req, res);
    });

    it('Should handle non-Errors', () => {
        let req = { errClass: 'foo', errMessage: 'bar' };
        let res = {
            send(err){
                assert.strictEqual(err.constructor.displayName, 'InternalServerError');
            }
        }
        handleError(req, res);
    });

    it('Should handle Restify App Assertion errors', () => {
        let res = {
            send(err){
                assert.strictEqual(err.constructor.displayName, 'MethodNotAllowedError');
                assert.strictEqual(err.message, 'foo');
            }
        }
        let e = new Error();
        e.constructor = { name: 'AssertAbleError' };
        e.message = 'foo';
        handleError({}, res, e);
    });

    it('Should handle unknown exceptions', () => {
        let res = {
            send(err){
                assert(err instanceof Error);
                assert.strictEqual(err.message, 'foobar');
            }
        }
        handleError({}, res, new Error('foobar'));
    });

});

describe('Regiression', () => {
    const AppServer = require('../lib/app-server');
    const { post } = require('muhb');

    it('Should handle errors even when error event has no listeners', async () => {
        let app = new AppServer();
        app.route(function({ post }){
            post('/bar', () => {
                throw new Error('errfoobar');
            });
        });
        await app.start();
        let { status } = await post('http://localhost:80/bar');
        assert.strictEqual(status, 500);
        await app.stop();
    });

    it('Should NOT attach new error handlers upon request', async () => {

        let app = new AppServer();
        app.route(function({ post }){
            post('/bar', () => {
                throw new Error('errfoobar');
            });
        });
        await app.start();

        let r1 = JSON.parse((await post('http://localhost:80/bar')).body).message;
        let r2 = JSON.parse((await post('http://localhost:80/bar')).body).message;
        let r3 = JSON.parse((await post('http://localhost:80/bar')).body).message;
        assert(r1 == r2 && r2 == r3 && r3 == 'errfoobar');

        await app.stop();

    });

});

//after(() => wtf.dump());
