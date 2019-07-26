const os = require('os');
const fs = require('fs');
const cors = require('cors');
const http = require('http');
const https = require('https');
const express = require('express');
const compression = require('compression');
const fileUpload = require('express-fileupload');

const { defaultErrorHandler, addRoute } = require('./route-adapter');
const { parseTypes } = require('./parse-types');
const { setupLogger, logRequest } = require('./logger');
const loadConf = require('./conf-loader');
const errors = require('./errors');
const HTTP_VERBS = ['get', 'post', 'patch', 'put', 'head'];

const noop = Function.prototype;

function routeNotFoundHandler(req, res, next){
    next(errors.NotFound());
}

function noAPI(req, res){
    res.statusCode = 503;
    res.write('This Nodecaf server has no API setup.');
    res.end();
}

function setupAPI(){
    // this => app
    this.express = express();
    this.express.app = this;
    this.express.use(compression());
    if(this.settings.cors)
        this.express.use(cors());
    this.express.use(logRequest.bind(this));
    if(typeof this.buildAPI == 'function')
        this.buildAPI(this.routerFuncs);
    this.express.use(routeNotFoundHandler);
    this.express.use(defaultErrorHandler.bind(this));
}

/*                                                                            o\
    Application Server to be instanced by users. Contain the basic REST
    server/service funcionallity.
\o                                                                            */
module.exports = class AppServer {

    constructor(settings){
        this.afterStop = this.beforeStart = this.onRouteError = noop;
        this.exposed = {};
        this.server = null;
        this.accepts = false;
        this.express = noAPI;
        this.name = 'express';
        this.version = '0.0.0';
        this.shouldParseBody = true;

        this.setup(settings);

        // Create adapted versions of all Express routing methods.
        this.routerFuncs = HTTP_VERBS.reduce( (o, method) =>
            ({ ...o, [method]: addRoute.bind(this, method) }), {});
        this.routerFuncs.info = noop;

        // Create delet special case method.
        this.routerFuncs.del = addRoute.bind(this, 'delete');
    }

    setup(objectOrPath, type){
        this.settings = this.settings || {};

        if(typeof objectOrPath == 'string')
            objectOrPath = loadConf(objectOrPath, type);
        this.settings = { ...this.settings, ...objectOrPath };

        let formFileDir = this.settings.formFileDir || os.tmpdir();
        this.parsers = {
            'application/json': express.json({ strict: false }),
            'application/x-www-form-urlencoded': express.urlencoded({ extended: true }),
            'multipart/form-data': fileUpload({ useTempFiles: true, tempFileDir: formFileDir })
        };

        // Setup logger.
        setupLogger.bind(this)(this.settings.log);

        if(this.alwaysRebuildAPI)
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

    /*                                                                        o\
        Execute the @callback to define user routes, exposing all REST methods
        as arguments. Meant to shorten the way you define routes and plug in the
        promise adapter.
    \o                                                                        */
    api(callback){
        this.buildAPI = callback;
        if(!this.alwaysRebuildAPI)
            setupAPI.bind(this)();
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
        if(this.alwaysRebuildAPI)
            setupAPI.bind(this)();

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
