const
    cors = require('cors'),
    http = require('http'),
    assert = require('assert'),
    Confort = require('confort'),
    Logger = require('golog'),
    { METHODS } = require('http'),
    compression = require('compression'),
    cookieParser = require('cookie-parser');

const Router = require('./router');

const SHORT_TYPES = {
    form: 'multipart/form-data',
    urlencoded: 'application/x-www-form-urlencoded',
    json: 'application/json'
};

const noop = function(){};
noop.noop = true;

function findPkgInfo(){
    try{
        return require(module.parent.path + '/../package.json');
    }
    catch(e){
        /* istanbul ignore next */
        return { name: 'Untitled', version: '0.0.0' };
    }
}

function validateOpts(opts){
    assert(typeof opts == 'object',
        new TypeError('Options argument must be an object'));

    this._api = opts.api || noop;
    this._startup = opts.startup || noop;
    this._shutdown = opts.shutdown || noop;
    this._serverBuilder = opts.server || (() => http.createServer());

    let { name, version } = findPkgInfo();
    this._name = opts.name || name;
    this._version = opts.version || version;

    assert(typeof this._api == 'function',
        new TypeError('API builder must be a function'));

    assert(typeof this._startup == 'function',
        new TypeError('Startup handler must be a function'));

    assert(typeof this._shutdown == 'function',
        new TypeError('Shutdown handler must be a function'));

    assert(typeof this._serverBuilder == 'function',
        new TypeError('Server builder must be a function'));
}

async function startServer(){
    let handler = this._router.handle.bind(this._router);
    this._server = this._serverBuilder(this).on('request', handler);
    await new Promise(done => this._server.listen(this.conf.port, done));
    this.log.info({ type: 'server' },
        '%s v%s is ready on port %s', this._name, this._version, this.conf.port);
}

module.exports = class Nodecaf {

    constructor(opts = {}){
        validateOpts.apply(this, [ opts ]);

        // TODO sha1 of host+time+name to identify app

        this._confort = new Confort();
        this._router = new Router(this);
        this._shouldParseBody = opts.shouldParseBody || typeof opts.shouldParseBody == 'undefined';
        this._alwaysRebuildAPI = opts.alwaysRebuildAPI || false;

        // Generate HTTP verb shortcut route methods
        this._routeProxy = METHODS.reduce( (o, m) =>
            ({ ...o, [m.toLowerCase()]: this._router.addRoute.bind(this._router, m.toLowerCase()) }), {});

        // Needed because it's not possible to call a function called 'delete'
        this._routeProxy.del = this._router.addRoute.bind(this._router, 'delete');

        this.conf = this._confort.object;
        this.running = false;
        this.stopped = Promise.resolve(true);

        this.setup(opts.conf);

        if(!this._alwaysRebuildAPI)
            this._api(this._routeProxy);
    }

    setup(objectOrPath){
        this._confort.addLayer(objectOrPath || {});
        this.conf = this._confort.object;

        this._cors = cors(this.conf.cors);
        this._cookies = cookieParser(this.conf.cookie && this.conf.cookie.secret);
        this._compress = compression();

        if(this.conf.log)
            this.conf.log.defaults = { app: this._name };
        this.log = new Logger(this.conf.log);
    }

    accept(types){
        types = [].concat(types).map(t => SHORT_TYPES[t] || t);
        return ({ body, req, res, next }) => {
            if(typeof body !== 'undefined' && !types.includes(req.contentType))
                return res.status(415).end();
            next();
        }
    }

    async start(){
        if(this.running)
            return false;

        await this.stopped;

        let started;
        this.running = new Promise(resolve => started = resolve);

        if(this.conf.delay > 0)
            await new Promise(done => setTimeout(done, this.conf.delay));

        if(this._alwaysRebuildAPI){
            this._router.clear();
            this._api(this._routeProxy);
        }

        if(!this._startup.noop)
            this.log.debug({ type: 'app' }, 'Starting up %s...', this._name);

        this.global = {};
        await this._startup(this);

        if(this.conf.port)
            await startServer.apply(this);
        else
            this.log.info({ type: 'app' }, '%s v%s has started', this._name, this._version);

        started(true);
        this.stopped = false;
        return this;
    }

    async stop(){
        if(this.stopped)
            return false;

        await this.running;

        let finished;
        this.stopped = new Promise(resolve => finished = resolve);

        // Stop listening; Run shutdown handler; Wait actual http close
        if(this._server)
            var closedPromise = new Promise(done => this._server.close(done));
        await this._shutdown(this);
        await closedPromise;

        delete this.global;

        this.log.info({ type: 'server' }, 'Stopped');

        finished(true);
        this.running = false;
    }

    async restart(conf){
        await this.stop();
        if(typeof conf == 'object'){
            this.log.debug({ type: 'server' }, 'Reloaded settings');
            this.setup(conf);
        }
        await this.start();
    }

}
