const
    Logger = require('golog'),
    confort = require('confort');

const { startServer } = require('./http');
const API = require('./api');
const { Readable, Writable } = require('stream');
const { getDataTypeFromContentType, getContentTypeFromDataType, parseBuffer } = require('./types');

function findPkgInfo(){
    try{
        return require(module.parent.path + '/../package.json');
    }
    catch(e){
        /* istanbul ignore next */
        return { name: 'Untitled', version: '0.0.0' };
    }
}

function retryShortly(fn){
    return new Promise(done => setTimeout(() => fn().then(done), 1000));
}

function validateOpts(opts){
    if(typeof opts != 'object')
        throw new TypeError('Options argument must be an object');

    this._websocket = opts.websocket;
    this._apiSpec = opts.api;
    this._routes = opts.routes;
    this._startup = opts.startup;
    this._shutdown = opts.shutdown;
    this._serverBuilder = opts.server;

    const { name, version } = findPkgInfo();
    this._name = opts.name ?? name;
    this._version = opts.version ?? version;

    if(opts.api && typeof this._apiSpec != 'function')
        throw new TypeError('API builder must be a function');

    if(opts.startup && typeof this._startup != 'function')
        throw new TypeError('Startup handler must be a function');

    if(opts.shutdown && typeof this._shutdown != 'function')
        throw new TypeError('Shutdown handler must be a function');

    if(opts.server && typeof this._serverBuilder != 'function')
        throw new TypeError('Server builder must be a function');
}

module.exports = class Nodecaf {

    constructor(opts = {}){
        validateOpts.call(this, opts);

        this._autoParseBody = opts.autoParseBody ?? false;

        this.call = (fn, ...args) => fn.call(this, { ...this.global, ...this }, ...args);

        this.conf = {};
        this.state = 'standby';

        this.setup(opts.conf);

        this._api = new API(this, this._apiSpec);
        opts.routes?.forEach(r => r.all
            ? this._api.setFallbackRoute(r.handler)
            : this._api.addEndpoint(r.method, r.path, r.handler));
    }

    setup(...objectOrPath){
        this.conf = confort(this.conf, ...objectOrPath);

        this.conf.log = this.conf.log ?? {};
        if(this.conf.log)
            this.conf.log.defaults = { app: this._name };
        this.log = new Logger(this.conf.log);
    }

    async start(){

        if(this.state in { running: 1, starting: 1 })
            return this.state;
        if(this.state == 'stopping')
            return await retryShortly(() => this.start());

        this.state = 'starting';

        await new Promise(done => setTimeout(done, this.conf.delay));

        this.global = {};

        if(this._startup)
            this.log.debug({ type: 'app' }, 'Starting up %s...', this._name);

        // Handle exceptions in user code to maintain proper app state
        try{
            await this._startup?.(this);
        }
        catch(err){
            this.state = 'stuck';
            await this.stop().catch(() => {});
            throw err;
        }

        if(this.conf.port)
            await startServer.call(this);
        else
            this.log.info({ type: 'app' }, '%s v%s has started', this._name, this._version);

        return this.state = 'running';
    }

    async stop(){
        if(this.state in { stopping: 1, standby: 1 })
            return this.state;

        if(this.state == 'starting')
            return await retryShortly(() => this.stop());

        this.state = 'stopping';

        let actualHTTPClose
        if(this._server)
            actualHTTPClose = new Promise(done => this._server.close(done));

        // Handle exceptions in user code to maintain proper app state
        try{
            await this._shutdown?.(this);
        }
        catch(err){
            throw err;
        }
        finally{
            await actualHTTPClose;
            this.log.info({ type: 'app' }, 'Stopped');
            this.state = 'standby';
        }

        return this.state;
    }

    async trigger(method, path, input = {}){

        if(!(input.body instanceof Readable)){
            const ob = input.body ?? '';
            const oh = input.headers ?? {};
            input = { ...input };

            const type = getContentTypeFromDataType(ob);
            if(ob instanceof Buffer)
                input.body = Readable.from(ob);
            else if(typeof ob == 'object')
                input.body = Readable.from(Buffer.from(JSON.stringify(ob)));
            else
                input.body = Readable.from(Buffer.from(String(ob)));

            if(!oh['content-type'] && !oh['Content-Type'] && type)
                input.headers = { ...oh, 'content-type': type };
        }

        const chunks = [];
        input.res = new Writable({
            write: function(chunk, _encoding, next) {
                chunks.push(chunk);
                next();
            }
        });

        const r = await this._api.trigger(method, path, input);

        if(chunks.length > 0){
            const ct = r.headers?.['content-type'] ?? r.headers?.['Content-Type'];
            const { type, charset } = getDataTypeFromContentType(ct);
            r.body = parseBuffer(Buffer.concat(chunks), type, charset);
        }

        return r;
    }

    async restart(conf){
        await this.stop();
        if(typeof conf == 'object'){
            this.log.debug({ type: 'app' }, 'Reloaded settings');
            this.setup(conf);
        }
        await this.start();
    }

    async run(opts = {}){
        this.setup(...[].concat(opts.conf));

        /* istanbul ignore next */
        const term = () => {
            this.stop();
            setTimeout(() => process.exit(0), 2000);
        }

        /* istanbul ignore next */
        const die = err => {
            this.log.fatal({ err, type: 'crash' });
            process.exit(1);
        }

        process.on('SIGINT', term);
        process.on('SIGTERM', term);
        process.on('uncaughtException', die);
        process.on('unhandledRejection', die);

        await this.start();

        return this;
    }

}

const METHODS = [ 'get', 'post', 'delete', 'put', 'patch' ];

METHODS.forEach(m => module.exports[m] = function(path, handler, opts){
    return { ...opts, method: m, path, handler };
});

// Needed because it's not possible to call a function named 'delete'
module.exports.del = (path, handler, opts) => ({ ...opts, method: 'delete', path, handler });

module.exports.all = handler => ({ all: true, handler });
module.exports.run = require('./run');