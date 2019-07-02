const os = require('os');
const assert = require('assert');
const express = require('express');
const getRawBody = require('raw-body');
const contentType = require('content-type');
const fileUpload = require('express-fileupload');
const mime = require('mime/lite');

const adaptErrors = require('./a-sync-error-adapter');
const errors = require('./errors');

const parsers = {
    'application/json': express.json({ strict: false }),
    'application/x-www-form-urlencoded': express.urlencoded({ extended: true }),
    'multipart/form-data': fileUpload({ useTempFiles: true, tempFileDir: os.tmpdir() })
};

function filter(custom, req, res, next){
    // this => app
    if(!custom && !this.accepts)
        return next();

    let ct = req.headers['content-type'];
    if(!ct)
        return next(errors.BadRequest('Missing \'Content-Type\' header'));

    let arr = custom || this.accepts;
    if(!arr.includes(ct))
        return next(errors.BadRequest('Unsupported content type \'' + ct + '\''));

    next();
}

async function parse(req, res, next){

    try{
        var ct = contentType.parse(req);
    }
    catch(e){
        ct = { type: 'plain/text', parameters: { charset: 'utf8' } };
    }

    if(ct.type in parsers)
        return parsers[ct.type](req, res, next);

    req.body = await getRawBody(req, {
        length: req.headers['content-length'],
        encoding: ct.parameters.charset
    });
    next();
}

function triggerError(input, err, msg){
    // this => app
    err = errors.parse(err, msg);
    input.next(err);
}

// Generate an adapted handler for Express routes.
function adaptHandler(app, handler){

    // Adapt sync/async errors to allow both types of functions as handlers.
    handler = adaptErrors(handler);

    // Function that will be physically run by Express.
    return function(req, res, next){

        let input = {
            ...app.exposed, req: req, res: res, next: next,
            query: req.query, params: req.params, body: req.body,
            flash: res.locals, conf: app.settings, log: app.log
        };

        input.error = triggerError.bind(app, input);

        req.input = input;

        // Actually run the user handler.
        handler(next, input);
    }
}

function sendError(err, msg){
    // this => Response object
    this.err = errors.parse(err, msg);
}

module.exports = {

    getAcceptMiddleware(types){
        // this => app
        types = typeof types == 'string' ? [types] : types;
        assert(Array.isArray(types));
        types = types.map( t => mime.getType(t) || t);
        return { accept: types };
    },

    addRoute(method, path, ...route){
        // this => app

        let customAccept = false;
        let aRoutes = [];

        // Loop through th route handlers adapting them.
        for(let handler of route){

            if(handler.accept){
                customAccept = handler.accept;
                continue;
            }

            if(typeof handler !== 'function')
                throw Error('Trying to add non-function route handler');

            aRoutes.push(adaptHandler(this, handler));
        }

        let accept = filter.bind(this, customAccept);

        // Physically add the adapted route to Express.
        this.express[method](path, accept, parse, ...aRoutes);
        return { desc: Function.prototype };
    },

    defaultErrorHandler(err, req, res, next){

        // Run user error handler.
        this.onRouteError(req.input, err, sendError.bind(res));
        err = res.err || err;

        // Log warning and abort if headers were already sent.
        if(res.headersSent){
            this.log.warn({ req: req }, 'ERROR AFTER HEADERS SENT');
            return next(err);
        }

        // Handle non-Error objects thrown.
        if(! (err instanceof Error) )
            err = errors.ServerFault();

        // Handle unknown Exceptions.
        else if(!(err.type in errors))
            err = errors.ServerFault(err.message);

        // Handle known REST errors.
        res.status(err.status).end(err.message);

        // Log unexpected errors sent to the user.
        if(err.status == 500)
            this.log.error({ req: req, err: err }, 'UNCAUGHT ROUTE ERROR');
    }
}
