const
    http = require('http'),
    cors = require('cors'),
    Logger = require('golog'),
    assert = require('assert'),
    confort = require('confort');

const { startServer } = require('./http');
const API = require('./api');

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

function retryShortly(fn){
    return new Promise(done => setTimeout(() => fn().then(done), 1000));
}

function validateOpts(opts){
    assert(typeof opts == 'object',
        new TypeError('Options argument must be an object'));

    this._apiSpec = opts.api || noop;
    this._startup = opts.startup || noop;
    this._shutdown = opts.shutdown || noop;
    this._serverBuilder = opts.server || (() => http.createServer());

    let { name, version } = findPkgInfo();
    this._name = opts.name || name;
    this._version = opts.version || version;

    assert(typeof this._apiSpec == 'function',
        new TypeError('API builder must be a function'));

    assert(typeof this._startup == 'function',
        new TypeError('Startup handler must be a function'));

    assert(typeof this._shutdown == 'function',
        new TypeError('Shutdown handler must be a function'));

    assert(typeof this._serverBuilder == 'function',
        new TypeError('Server builder must be a function'));
}

module.exports = class Nodecaf {

    constructor(opts = {}){
        validateOpts.call(this, opts);

        // TODO sha1 of host+time+name to identify app

        this._autoParseBody = opts.autoParseBody || false;
        this._alwaysRebuildAPI = opts.alwaysRebuildAPI || false;

        this.call = (fn, ...args) => fn.call(this, { ...this.global, ...this }, ...args);

        this.conf = {};
        this.state = 'standby';

        this.setup(opts.conf);

        if(!this._alwaysRebuildAPI)
            this._api = new API(this, this._apiSpec);
    }

    setup(objectOrPath){
        this.conf = confort(this.conf, objectOrPath || {});
        this._cors = cors(this.conf.cors);

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

        if(this._alwaysRebuildAPI)
            this._api = new API(this, this._apiSpec);

        if(!this._startup.noop)
            this.log.debug({ type: 'app' }, 'Starting up %s...', this._name);

        // Handle exceptions in user code to maintain proper app state
        try{
            await this._startup(this);
        }
        catch(err){
            this.state = 'stuck';
            await this.stop();
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

        if(this._server)
            var actualHTTPClose = new Promise(done => this._server.close(done));

        // Handle exceptions in user code to maintain proper app state
        try{
            await this._shutdown(this);
        }
        catch(err){
            throw err;
        }
        finally{
            await actualHTTPClose;
            delete this.global;
            this.log.info({ type: 'app' }, 'Stopped');
            this.state = 'standby';
        }

        return this.state;
    }

    trigger(method, path, input){
        return this._api.trigger(method, path, input);
    }

    async restart(conf){
        await this.stop();
        if(typeof conf == 'object'){
            this.log.debug({ type: 'app' }, 'Reloaded settings');
            this.setup(conf);
        }
        await this.start();
    }

}
