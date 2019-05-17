const restify = require('restify');
const { EventEmitter } = require('events');
const adapt = require('./promise-adapter');
const HTTP_VERBS = ['get', 'post', 'patch', 'del', 'put', 'head'];

// Run routes through promise adapter.
function addRoute(method, path, ...funcs){
    this.server[method](path, ...funcs.map( f => adapt(this, f) ));
}

/*                                                                            o\
    Application Server to be instanced by users. Contain the basic REST
    server/service funcionallity.
\o                                                                            */
module.exports = class AppServer extends EventEmitter {

    constructor(settings){
        super();
        this.settings = settings || {};
        this.server = restify.createServer({ ignoreTrailingSlash: true });
        this.afterStop = {};
        this.beforeStart = {};

        // Prepare Restify plugins.
        this.server.use(restify.plugins.queryParser());
        this.server.use(restify.plugins.gzipResponse());
        this.server.use(restify.plugins.bodyParser());

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
        let funcs = HTTP_VERBS.reduce( (o, method) =>
            ({ ...o, [method]: addRoute.bind(this, method) }), {});
        callback(funcs);
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
