const
    os = require('os'),
    fs = require('fs'),
    cors = require('cors'),
    http = require('http'),
    assert = require('assert'),
    https = require('https'),
    express = require('express'),
    Confort = require('confort'),
    compression = require('compression'),
    cookieParser = require('cookie-parser'),
    fileUpload = require('express-fileupload');

const { defaultErrorHandler, addRoute } = require('./route-adapter');
const { parseTypes } = require('./parse-types');
const errors = require('./errors');
const Logger = require('./logger');
const WebSocket = require('./ws');
const HTTP_VERBS = ['get', 'post', 'patch', 'put', 'head'];

const noop = function(){};
noop.noop = true;

function findPkgInfo(){
    try{
        return require(module.parent.parent.path + '/../package.json');
    }
    catch(e){
        /* istanbul ignore next */
        return { name: 'Untitled', version: '0.0.0' };
    }
}

function logRequest(req, res, next){
    this.log.req(req);

    // Setup server response log
    res.on('finish', () => this.log.res(res, req));
    next();
}

function routeNotFoundHandler(req, res, next){
    next(errors.NotFound());
}

function noAPI(req, res){
    res.statusCode = 503;
    res.write('This Nodecaf server has no API setup.');
    res.end();
    this.log.res(res, req);
}

function setupAPI(){
    // this => app
    this.express = express();
    this.express.app = this;
    this.express.use(compression());
    this.express.use(cookieParser(this.conf.cookie && this.conf.cookie.secret));
    this.express.use(cors(this.conf.cors));
    this.express.use(logRequest.bind(this));
    if(typeof this._api == 'function')
        this._api({ ...this.routerFuncs, info: noop, conf: this.conf,
            ws: WebSocket.set.bind(null, this) });
    this.express.use(routeNotFoundHandler);
    this.express.use(defaultErrorHandler.bind(this));
}

function validateOpts(opts){
    assert(typeof opts == 'object',
        new TypeError('Options argument must be an object'));

    this._api = opts.api || noop;
    this._startup = opts.startup || noop;
    this._shutdown = opts.shutdown || noop;

    assert(typeof this._api == 'function',
        new TypeError('API builder must be a function'));

    assert(typeof this._startup == 'function',
        new TypeError('Startup handler must be a function'));

    assert(typeof this._shutdown == 'function',
        new TypeError('Shutdown handler must be a function'));
}

/*                                                                            o\
    Application Server to be instanced by users. Contain the basic REST
    server/service funcionallity.
\o                                                                            */
module.exports = class Nodecaf {

    constructor(opts = {}){
        validateOpts.apply(this, [ opts ]);
        
        let { name, version } = findPkgInfo();

        this.express = noAPI.bind(this);
        this.name = name;
        this.version = version;
        this.confort = new Confort();
        this.onRouteError = noop;

        this._shouldParseBody = opts.shouldParseBody || typeof opts.shouldParseBody == 'undefined';
        this._alwaysRebuildAPI = opts.alwaysRebuildAPI || false;

        // Create adapted versions of all Express routing methods.
        this.routerFuncs = HTTP_VERBS.reduce( (o, method) =>
            ({ ...o, [method]: addRoute.bind(this, method) }), {});

        // Create delete special case method.
        this.routerFuncs.del = addRoute.bind(this, 'delete');

        this.global = {};
        this.conf = this.confort.object;
        
        this.setup(opts.conf);

        if(!this._alwaysRebuildAPI)
            setupAPI.bind(this)();
    }

    setup(objectOrPath){
        this.confort.addLayer(objectOrPath || {});

        this.conf = this.confort.object;

        let formFileDir = this.conf.formFileDir || os.tmpdir();
        this.parsers = {
            'application/json': express.json({ strict: false }),
            'application/x-www-form-urlencoded': express.urlencoded({ extended: true }),
            'multipart/form-data': fileUpload({ useTempFiles: true, tempFileDir: formFileDir })
        };

        this.log = new Logger(this);

        // Setup SSL cert and key if needed..
        this.ssl = this.conf.ssl ? {
            key: fs.readFileSync(this.conf.ssl.key),
            cert: fs.readFileSync(this.conf.ssl.cert)
        } : undefined;

        this.port = this.conf.port || (this.ssl ? 443 : 80);

        if(this._alwaysRebuildAPI)
            setupAPI.bind(this)();
    }

    /*                                                                        o\
        Define a whitelist of accepted request body mime-types for all routes
        in the app. Effectively blocks all requests whose mime-type is not one
        of @types. May be overriden by route specific accepts.
    \o                                                                        */
    accept(types){
        this.accepts = parseTypes(types);
    }

    /*                            o\
        Start the Express server.
    \o                            */
    async start(){
        if(this.active)
            return false;

        let active;
        this.active = new Promise(r => active = r);

        if(this.conf.delay > 0)
            await new Promise(done => setTimeout(done, this.conf.delay));

        if(this._alwaysRebuildAPI)
            setupAPI.bind(this)();

        // Execute before Start handler.
        await this._startup(this);

        // Setup main HTTP(S) server.
        this.server = this.ssl
            ? https.createServer(this.ssl, this.express)
            : http.createServer(this.express);

        if(this.wsRoutes)
            this.wss = WebSocket.start(this);

        // Start listening on defined port.
        await new Promise( done => this.server.listen(this.port, done) );
        this.running = true;

        this.log.server('Started %s (v%s) at port %s', this.name, this.version, this.port);

        active();
        return this;
    }

    /*                           o\
        Stop the Express server.
    \o                           */
    async stop(){
        if(!this.active)
            return false;

        await this.active;
        this.active = false;

        if(this.wss)
            WebSocket.close(this.wss);

        await new Promise(done => this.server.close(done) );
        this.running = false;
        this.log.server('Stopped');

        // Execute after Stop handler.
        await this._shutdown(this);
    }

    /*                              o\
        Restart the Express server.
    \o                              */
    async restart(conf){
        await this.stop();
        if(typeof conf == 'object'){
            this.log.server('Reloaded settings');
            this.setup(conf);
        }
        await this.start();
    }

}
