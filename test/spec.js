//const wtf = require('wtfnode');
const assert = require('assert');

// Address for the tests' local servers to listen.
const LOCAL_HOST = 'http://localhost:80/'

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
        let obj = loadConf('toml', './test/res/conf.toml');
        assert.strictEqual(obj.key, 'value');
    });

    it('Should properly load an YAML file and generate an object', () => {
        let obj = loadConf('yaml', './test/res/conf.yaml');
        assert.strictEqual(obj.key, 'value');
    });
});

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

describe('AppServer', () => {
    const AppServer = require('../lib/app-server');
    const { get, post } = require('muhb');

    describe('constructor', () => {

        it('Should store any settings sent', () => {
            let app = new AppServer({ key: 'value' });
            assert.strictEqual(app.settings.key, 'value');
        });

        it('Should create the Express server', () => {
            let app = new AppServer();
            assert.strictEqual(typeof app.express.use, 'function');
        });

    });

    describe('#start', () => {

        it('Should start the http server on port 80', async () => {
            let app = new AppServer();
            await app.start();
            let { status } = await get(LOCAL_HOST);
            assert.strictEqual(status, 404);
            await app.stop();
        });

        it('Should start the http server on port sent', async () => {
            let app = new AppServer({ port: 8765 });
            await app.start();
            let { status } = await get('http://127.0.0.1:8765/');
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
            let { status } = await post(LOCAL_HOST + 'foo');
            assert.strictEqual(status, 500);
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
            let { body } = await get(LOCAL_HOST + 'bar');
            assert.strictEqual(body, 'bar');
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
            let { body } = await post(LOCAL_HOST + 'bar');
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
                await get(LOCAL_HOST);
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
            let { status } = await get(LOCAL_HOST);
            assert.strictEqual(status, 404);
            await app.restart();
            let { status: s } = await get(LOCAL_HOST);
            assert.strictEqual(s, 404);
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
            let { body, status } = await post(
                LOCAL_HOST + 'foo',
                { 'Content-Type': 'application/json' },
                '{"foo":"bar"}'
            );
            assert.strictEqual(status, 400);
            assert(/Unsupported/.test(body));
            await app.stop();
        });

        it('Should reject requests without content-type', async () => {
            let app = new AppServer();
            app.api(function({ post }){
                this.accept('text/html');
                post('/foo', ({ res }) => res.end());
            });
            await app.start();
            let { body, status } = await post(
                LOCAL_HOST + 'foo',
                { '--no-auto': true },
                '{"foo":"bar"}'
            );
            assert.strictEqual(status, 400);
            assert(/Missing/.test(body));
            await app.stop();
        });

        it('Should accept wanted content-types API-wide', async () => {
            let app = new AppServer();
            app.api(function({ post }){
                this.accept([ 'urlencoded', 'text/html' ]);
                post('/foo', ({ res }) => res.end());
            });
            await app.start();
            let { status } = await post(
                LOCAL_HOST + 'foo',
                { 'Content-Type': 'text/html' },
                '{"foo":"bar"}'
            );
            assert.strictEqual(status, 200);
            await app.stop();
        });

    });

});

describe('REST/Restify Features', () => {
    const fs = require('fs');
    const AppServer = require('../lib/app-server');
    const { post, get } = require('muhb');

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
            get('/foo', (obj) => {
                assert(obj.res && obj.req && obj.next && obj.body === ''
                    && obj.params && obj.query && obj.flash && obj.error
                    && obj.conf && obj.log);
                obj.res.end();
            });
        });
        await app.start();
        let { status } = await get(LOCAL_HOST + 'foo');
        assert.strictEqual(status, 200);
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
            form.submit(LOCAL_HOST + 'bar/', (err, res) => {
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
        let { status } = await post(
            LOCAL_HOST + 'foobar',
            { 'Content-Type': 'application/json' },
            JSON.stringify({foo: 'bar'})
        );
        assert.strictEqual(status, 200);
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
        let { status } = await post(
            LOCAL_HOST + 'foobar',
            { '--no-auto': true },
            JSON.stringify({foo: 'bar'})
        );
        assert.strictEqual(status, 200);
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
        let { status } = await post(
            LOCAL_HOST + 'foobar',
            { 'Content-Type': 'application/x-www-form-urlencoded' },
            'foo=bar'
        );
        assert.strictEqual(status, 200);
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
        let { status } = await post(LOCAL_HOST + 'foobar?foo=bar');
        assert.strictEqual(status, 200);
        await app.stop();
    });

    it('Should output a 404 when no route is found for a given path', async () => {
        let app = new AppServer();
        app.api(function(){  });
        await app.start();
        let { status, body } = await post(LOCAL_HOST + 'foobar');
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
        let { body } = await post(LOCAL_HOST + 'foobar');
        assert.doesNotThrow( () => JSON.parse(body) );
        await app.stop();
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
            let { body, status } = await post(
                LOCAL_HOST + 'foo',
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
            let { status } = await post(
                LOCAL_HOST + 'foo',
                { 'Content-Type': 'text/html' },
                '{"foo":"bar"}'
            );
            assert.strictEqual(status, 200);
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
            app.api(function({ get }){
                get('/bar', ({ res }) => res.end('foo'));
            });
            return app;
        } });
        let { body } = await get(LOCAL_HOST + 'bar');
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
    const { post } = require('muhb');
    const fs = require('fs');

    it('Should handle Error thrown sync on the route', async () => {
        let app = new AppServer();
        app.api(function({ post }){
            post('/unknown', () => {
                throw new Error('othererr');
            });
        });
        await app.start();
        let { status: status } = await post(LOCAL_HOST + 'unknown');
        assert.strictEqual(status, 500);
        await app.stop();
    });

    it('Should handle Error injected sync on the route', async () => {
        let app = new AppServer();
        app.api(function({ post }){
            post('/known', ({ error }) => {
                error('NotFound');
            });
            post('/unknown', ({ error }) => {
                error(new Error('errfoobar'));
            });
        });
        await app.start();
        let { status } = await post(LOCAL_HOST + 'known');
        assert.strictEqual(status, 404);
        let { status: s2 } = await post(LOCAL_HOST + 'unknown');
        assert.strictEqual(s2, 500);
        await app.stop();
    });

    it('Should handle Error injected ASYNC on the route', async () => {
        let app = new AppServer();
        app.api(function({ post }){
            post('/known', ({ error }) => {
                fs.readdir('.', function(){
                    error('NotFound', 'errfoobar');
                    error('NotFound');
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
        let { status } = await post(LOCAL_HOST + 'known');
        assert.strictEqual(status, 404);
        let { status: s2 } = await post(LOCAL_HOST + 'unknown');
        assert.strictEqual(s2, 500);
        let { status: s3 } = await post(LOCAL_HOST + 'unknown/object');
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
        let { status } = await post(LOCAL_HOST + 'known');
        assert.strictEqual(status, 500);
        let { status: s2 } = await post(LOCAL_HOST + 'unknown');
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
        let { status } = await post(LOCAL_HOST + 'unknown');
        assert.strictEqual(status, 401);
        await app.stop();
    });

});

describe('Logging', () => {
    const { run, AppServer } = require('../lib/main');
    const { post } = require('muhb');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    let dir;

    beforeEach(async function(){
        dir = path.resolve(os.tmpdir(), String(Math.random()));
        await fs.promises.mkdir(dir);
    });

    it('Should log to specified file', async () => {
        let file = path.resolve(dir, 'logfile.txt');
        let app = new AppServer({ log: { file: file } });
        app.api(function({ post }){
            post('/foo', ({ log, res }) => {
                log.info(file);
                res.end();
            });
        });
        await app.start();
        await post(LOCAL_HOST + 'foo');
        let data = await fs.promises.readFile(file, 'utf-8');
        assert(data.indexOf('logfile') > 0);
        await app.stop();
    });

    it('Should log to specified stream', async () => {
        let file = path.resolve(dir, 'logstream.txt');
        let stream = fs.createWriteStream(file);
        let app = new AppServer({ log: { stream: stream } });
        app.api(function({ post }){
            post('/foo', ({ log, res }) => {
                log.info(file);
                res.end();
            });
        });
        await app.start();
        await post(LOCAL_HOST + 'foo');
        let data = await fs.promises.readFile(file, 'utf-8');
        assert(data.indexOf('logstream') > 0);
        await app.stop();
    });

    it('Should log all requests when level is debug or lower', async () => {
        let file = path.resolve(dir, 'logstream.txt');
        let stream = fs.createWriteStream(file);
        let app = new AppServer({ log: { stream: stream, level: 'debug' } });
        app.api(function({ post }){
            post('/foo', ({ res }) => res.end() );
        });
        await app.start();
        await post(LOCAL_HOST + 'foo');
        let data = await fs.promises.readFile(file, 'utf-8');
        assert(data.indexOf('POST') > 0);
        await app.stop();
    });

    it('Should log uncaught route errors when level is error or lower', async () => {
        let file = path.resolve(dir, 'logstream.txt');
        let stream = fs.createWriteStream(file);
        let app = new AppServer({ log: { stream: stream, level: 'error' } });
        app.api(function({ post }){
            post('/foo', () => { throw new Error('Oh yeah') } );
        });
        await app.start();
        await post(LOCAL_HOST + 'foo');
        let data = await fs.promises.readFile(file, 'utf-8');
        assert(data.indexOf('Oh yeah') > 0);
        await app.stop();
    });

    it.skip('Should log errors that crash the server process', async () => {
        let file = path.resolve(dir, 'logstream.txt');
        let stream = fs.createWriteStream(file);
        await run({ init(){
            new AppServer({ log: { stream: stream, level: 'fatal' } });
            throw new Error('fatality');
        } });
        let data = await fs.promises.readFile(file, 'utf-8');
        assert(data.indexOf('fatality') > 0);
    });

});

describe('API Docs', () => {
    const APIDoc = require('../lib/open-api');
    const AppServer = require('../lib/app-server');
    const { accept } = require('../lib/parse-types');
    const { post } = require('muhb');

    it('Should not interfere with working API code', async () => {
        let app = new AppServer();
        app.api(function({ info, post }){
            info({
                termsOfService: 'http://foo/bar/baz'
            });
            post('/foo/:bar', ({ res }) => {
                res.end('OK');
            }).desc('foobahbaz bahbaz bahfoo foo\nfoobah bazbah foo foo bar');
        });

        await app.start();
        let { body } = await post(LOCAL_HOST + 'foo/baz');
        assert.strictEqual(body, 'OK');
        await app.stop();
    });

    it('Should have app name and version by default', function(){
        let doc = new APIDoc();
        let spec = doc.spec();
        assert.strictEqual(typeof spec.info.title, 'string');
        assert.strictEqual(spec.info.version, '0.0.0');
    });

    it('Should replace given fields of the info object', function(){
        let doc = new APIDoc();
        doc.api( ({ info }) => info({ version: 'barbaz', foo: 'bar' }) );
        let spec = doc.spec();
        assert.strictEqual(spec.info.version, 'barbaz');
        assert.strictEqual(spec.info.foo, 'bar');
    });

    it('Should add operation summary and description', function(){
        let doc = new APIDoc();
        doc.api( ({ post }) => {
            post('/foo', function(){}).desc('foo\nbar\nbaz');
            post('/baz', function(){}).desc('foo');
        });
        let spec = doc.spec();
        assert.strictEqual(spec.paths['/foo'].post.summary, 'foo');
        assert.strictEqual(spec.paths['/baz'].post.summary, 'foo');
        assert.strictEqual(spec.paths['/foo'].post.description, 'bar\nbaz');
    });

    it('Should auto-populate spec with path parameters', function(){
        let doc = new APIDoc();
        doc.api( ({ post }) => {
            post('/foo/:bar', function(){});
        });
        let spec = doc.spec();
        assert.strictEqual(spec.paths['/foo/:bar'].parameters[0].name, 'bar');
    });

    it('Should auto-populate operation with permissive requests body', function(){
        let doc = new APIDoc();
        doc.api( ({ post }) => {
            post('/foo', function(){});
            post('/baz', function(){});
        });
        let spec = doc.spec();
        assert.strictEqual(typeof spec.paths['/foo'].post.requestBody, 'object');
        assert('*/*' in spec.paths['/foo'].post.requestBody.content);
    });

    it('Should add request body types based on app accepts', function(){
        let doc = new APIDoc();
        doc.api( function({ post }){
            this.accept(['json', 'text/html']);
            post('/foo', function(){});
        });
        let spec = doc.spec();
        assert(/following types/.test(spec.paths['/foo'].post.requestBody.description));
        assert('application/json' in spec.paths['/foo'].post.requestBody.content);
        assert('text/html' in spec.paths['/foo'].post.requestBody.content);
    });

    it('Should add request body types based on route accepts', function(){
        let doc = new APIDoc();
        doc.api( function({ post }){
            let acc = accept('json');
            post('/foo', acc, function(){});
        });
        let spec = doc.spec();
        assert(/following types/.test(spec.paths['/foo'].post.requestBody.description));
        assert('application/json' in spec.paths['/foo'].post.requestBody.content);
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
    const AppServer = require('../lib/app-server');
    const { post } = require('muhb');

    it('Should handle errors even when error event has no listeners', async () => {
        let app = new AppServer();
        app.api(function({ post }){
            post('/bar', () => {
                throw new Error('errfoobar');
            });
        });
        await app.start();
        let { status } = await post(LOCAL_HOST + 'bar');
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

        let r1 = (await post(LOCAL_HOST + 'bar')).body;
        let r2 = (await post(LOCAL_HOST + 'bar')).body;
        let r3 = (await post(LOCAL_HOST + 'bar')).body;
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

        let m = (await post(LOCAL_HOST + 'bar')).body;
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
        await post(LOCAL_HOST + 'bar');
        await app.stop();
        assert(gotHere);
    });

});

//after(() => wtf.dump());
