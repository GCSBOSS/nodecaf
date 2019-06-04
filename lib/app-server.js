const restify = require('restify');
const bunyan = require('bunyan');
const { EventEmitter } = require('events');
const addRoute = require('./route-adapter');
const HTTP_VERBS = ['get', 'post', 'patch', 'del', 'put', 'head'];

function setupLogger(settings){

    // Prepare logger instance.
    this.log = bunyan.createLogger({
        name: this.name,
        level: settings.level || 'info'
    });

    // Remove default stdout stream.
    this.log.streams.shift();
    if(settings.stream)
        this.log.addStream({ stream: settings.stream });

    // If 'file' is set.
    else
        this.log.addStream({ path: settings.file });

    // Setup logging for every request.
    if(settings.requests === true)
        this.server.pre((req, res, next) => {
            this.log.info({
                headers: req.headers,
                method: req.method,
                path: req.getPath()
            }, 'REQUEST');
            return next();
        });
}

/*                                                                            o\
    Application Server to be instanced by users. Contain the basic REST
    server/service funcionallity.
\o                                                                            */
module.exports = class AppServer extends EventEmitter {

    constructor(settings){
        super();
        this.settings = settings || {};
        this.afterStop = {};
        this.beforeStart = {};
        this.name = this.settings.name || 'restify';

        // Create Restify server instance.
        this.server = restify.createServer({
            ignoreTrailingSlash: true,
            name: this.name,
            version: this.settings.version || '0'
        });

        // Setup logger.
        let logSettings = this.settings.log;
        if(logSettings && (logSettings.file || logSettings.stream))
            setupLogger.bind(this)(this.settings.log);

        // Prepare Restify plugins.
        this.server.use(restify.plugins.queryParser());
        this.server.use(restify.plugins.gzipResponse());
        this.server.use(restify.plugins.bodyParser());

        // Create adapted versions of all Restify routing methods.
        this.routerFuncs = HTTP_VERBS.reduce( (o, method) =>
            ({ ...o, [method]: addRoute.bind(this, method) }), {});

        // Prepare the flash vars and server reference.
        this.exposed = {};
        this.server.use((req, res, next) => {
            req.flash = {};
            req.server = this;
            next();
        });
    }

    /*                                                                        o\
        Execute the @callback to define user routes, exposing all REST methods
        as arguments. Meant to shorten the way you define routes and plug in the
        promise adapter.
    \o                                                                        */
    route(callback){
        callback(this.routerFuncs);
    }

    /*                                                                        o\
        Exposes all values inside @object as arguments to all route handlers.
    \o                                                                        */
    expose(object){
        this.exposed = object;
    }

    /*                            o\
        Start the Restify server.
    \o                            */
    async start(){

        // Execute before Start handler.
        if(this.beforeStart.constructor.name == 'AsyncFunction')
            await this.beforeStart();
        await this.server.listen(this.settings.port || 80);
    }

    /*                           o\
        Stop the Restify server.
    \o                           */
    async stop(){
        await this.server.close();

        // Execute after Stop handler.
        if(this.afterStop.constructor.name == 'AsyncFunction')
            await this.afterStop();
    }

    /*                              o\
        Restart the Restify server.
    \o                              */
    async restart(){
        await this.stop();
        await this.start(this.settings);
    }

}
