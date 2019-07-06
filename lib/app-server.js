const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require('express');
const compression = require('compression');

const { defaultErrorHandler, addRoute } = require('./route-adapter');
const { parseTypes } = require('./parse-types');
const setupLogger = require('./logger');
const errors = require('./errors');
const HTTP_VERBS = ['get', 'post', 'patch', 'put', 'head'];

const noop = Function.prototype;

function routeNotFoundHandler(req, res, next){
    next(errors.NotFound());
}

/*                                                                            o\
    Application Server to be instanced by users. Contain the basic REST
    server/service funcionallity.
\o                                                                            */
module.exports = class AppServer {

    constructor(settings){
        this.settings = settings || {};
        this.afterStop = this.beforeStart = this.onRouteError = noop;
        this.exposed = {};
        this.name = this.settings.name || 'express';
        this.version = this.settings.version || '0.0.0';
        this.express = express();
        this.express.app = this;
        this.server = null;
        this.accepts = false;

        // Setup logger.
        setupLogger.bind(this)(this.settings.log);

        // Prepare Express middleware.
        this.express.use(compression());

        // Create adapted versions of all Express routing methods.
        this.routerFuncs = HTTP_VERBS.reduce( (o, method) =>
            ({ ...o, [method]: addRoute.bind(this, method) }), {});
        this.routerFuncs.info = noop;

        // Create delet special case method.
        this.routerFuncs.del = addRoute.bind(this, 'delete');
    }

    /*                                                                        o\
        Define a whitelist of accepted request body mime-types for all routes
        in the app. Effectively blocks all requests whose mime-type is not one
        of @types. May be overriden by route specific accepts.
    \o                                                                        */
    accept(types){
        this.accepts = parseTypes(types);
    }

    /*                                                                        o\
        Execute the @callback to define user routes, exposing all REST methods
        as arguments. Meant to shorten the way you define routes and plug in the
        promise adapter.
    \o                                                                        */
    api(callback){
        callback.bind(this)(this.routerFuncs);
        this.express.use(routeNotFoundHandler);
        this.express.use(defaultErrorHandler.bind(this));
    }

    /*                                                                        o\
        Exposes all values inside @object as arguments to all route handlers.
    \o                                                                        */
    expose(object){
        this.exposed = object;
    }

    /*                            o\
        Start the Express server.
    \o                            */
    async start(){

        // Execute before Start handler.
        await this.beforeStart();

        // Setup SSL cert and key if needed..
        var ssl = this.settings.ssl ? {
            key: fs.readFileSync(this.settings.ssl.key),
            cert: fs.readFileSync(this.settings.ssl.cert)
        } : false;

        // Setup main HTTP(S) server.
        this.server = ssl
            ? https.createServer(ssl, this.express)
            : http.createServer(this.express);
        let defaultPort = ssl ? 443 : 80;

        // Start listening on defined port.
        let p = this.settings.port || defaultPort;
        await new Promise( done => this.server.listen(p, done) );
    }

    /*                           o\
        Stop the Express server.
    \o                           */
    async stop(){
        await new Promise(done => this.server.close(done) );

        // Execute after Stop handler.
        await this.afterStop();
    }

    /*                              o\
        Restart the Express server.
    \o                              */
    async restart(){
        await this.stop();
        await this.start(this.settings);
    }

}
