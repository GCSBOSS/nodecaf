//const wtf = require('wtfnode');
const assert = require('assert');

describe('Conf Loader', () => {
    const loadConf = require('../lib/conf-loader');

    it('Should properly load a TOML file and generate an object', () => {
        let obj = loadConf('toml', './test/confs/conf.toml');
        assert.equal(obj.key, 'value');
    });
});

describe('Promise Adapter', () => {
    const { EventEmitter } = require('events');
    const adapt = require('../lib/promise-adapter');
    const s = { exposed: {}, settings: {} };
    const mockReq = { server: s, query: {}, locals: {}, params: {}, body: '' };

    it('Should fail when anything other than a function is passed', () => {
        let ee = new EventEmitter();
        assert.throws( () => adapt(ee, '') );
    });

    it('Should pass all the required args to adapted function', () => {
        let ee = new EventEmitter();
        let af = adapt(ee, function(args){
            assert.equal(typeof args, 'object');
        });
        af(mockReq, {}, function(){});
    });

    it('Should handle errors for regular functions', done => {
        let ee = new EventEmitter();
        let af = adapt(ee, function(){
            throw Error('foo');
        });
        ee.on('error', (req, res, err) => {
            assert.equal(err.message, 'foo');
            done();
        });
        af(mockReq, {}, function(){});
    });

    it('Should handle errors for async functions', done => {
        let ee = new EventEmitter();
        let af = adapt(ee, async function(){
            await new Promise((resolve, reject) => reject('foo'));
        });
        ee.on('error', (req, res, err) => {
            assert.equal(err, 'foo');
            done();
        });
        af(mockReq, {}, function(){});
    });

    it('Should expose restify error properly', done => {
        let ee = new EventEmitter();
        let af = adapt(ee, async function(){
            await new Promise((resolve, reject) => reject('foo'));
        });
        ee.on('error', (req, res, err, send) => send('InternalServer', 'foobar'));
        res = { send(err){
            assert.equal(err.message, 'foobar');
            done();
        } };
        af(mockReq, res, function(){});
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
            assert.equal(app.settings.key, 'value');
        });

        it('Should create the Restify server', () => {
            let app = new AppServer();
            assert.equal(typeof app.server.use, 'function');
        });

    });

    describe('#start', () => {

        it('Should start the http server on port 80', async () => {
            let app = new AppServer();
            await app.start();
            let { status } = await get('http://127.0.0.1:80/');
            assert.equal(status, 404);
            await app.stop();
        });

        it('Should start the http server on port sent', async () => {
            let app = new AppServer({ port: 8080 });
            await app.start();
            let { status } = await get('http://127.0.0.1:8080/');
            assert.equal(status, 404);
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
                assert.equal(typeof funcs, 'object');
                done();
            });
        });

        it('Should allow registering routes to Restify', async () => {
            let app = new AppServer();
            app.route(function({ post, del, get, patch, put, head }){
                post('/foo', ({res}) => res.send(500) );
                assert.equal(app.server.router._registry._routes.postfoo.name, 'postfoo');
                assert.equal(typeof del, 'function');
                assert.equal(typeof get, 'function');
                assert.equal(typeof put, 'function');
                assert.equal(typeof patch, 'function');
                assert.equal(typeof head, 'function');
            });
            await app.start();
            let { status } = await post('http://127.0.0.1:80/foo');
            assert.equal(status, 500);
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
            assert.equal(body, 'bar');
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
            assert.equal(body, 'foobar');
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
            assert.equal(status, 404);
            await app.restart();
            let { status: s } = await get('http://127.0.0.1:80/');
            assert.equal(s, 404);
            await app.stop();
        });

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
        assert.equal(body, 'foo');
        await app.stop();
    });

});

//after(() => wtf.dump());
