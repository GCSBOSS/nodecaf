const assert = require('assert');
const getRawBody = require('raw-body');
const contentType = require('content-type');

const adaptErrors = require('./a-sync-error-adapter');
const errors = require('./errors');

function parseError(err, msg){
    if(err in errors)
        err = errors[err](msg || err);
    return err;
}

function parseContentType(req){
    try{
        var ct = contentType.parse(req);
    }
    catch(e){
        ct = { parameters: {} };
    }

    req.contentType = ct.type;
    req.contentCharset = ct.parameters.charset || 'utf8';
}

function filter(custom, req, res, next){
    // this => app
    req.hasBody = Boolean(req.headers['content-length']);
    if(!req.hasBody)
        return next();

    let filter = custom || this.accepts || false;
    if(filter && !req.headers['content-type'])
        return next(errors.BadRequest('Missing \'Content-Type\' header'));

    parseContentType(req);

    if(filter && !filter.includes(req.contentType))
        return next(errors.BadRequest('Unsupported content type \'' + req.contentType + '\''));

    next();
}

async function parse(req, res, next){
    // this => app

    req.body = '';
    if(!req.hasBody)
        return next();

    if(req.contentType in this.parsers)
        return this.parsers[req.contentType](req, res, next);

    req.body = await getRawBody(req, {
        length: req.headers['content-length'],
        encoding: req.contentCharset
    });
    next();
}

function triggerError(input, err, msg){
    // this => app
    err = parseError(err, msg);
    input.next(err);
}

// Generate an adapted handler for Express routes.
function adaptHandler(app, handler){

    // Adapt sync/async errors to allow both types of functions as handlers.
    handler = adaptErrors(handler);

    // Function that will be physically run by Express.
    return function(req, res, next){

        let input = {
            ...app.exposed, req, res, next,
            query: req.query, params: req.params, body: req.body,
            flash: res.locals, conf: app.settings, log: app.log,
            headers: req.headers
        };

        input.error = triggerError.bind(app, input);

        req.input = input;

        // Setup server response log
        res.on('finish', () => app.log.res(res, req));

        // Actually run the user handler.
        handler(next, input);
    }
}

function sendError(err, msg){
    // this => Response object
    this.err = parseError(err, msg);
}

module.exports = {

    addRoute(method, path, ...route){
        // this => app
        let customAccept = false;
        let aRoutes = [];

        // Loop through th route handlers adapting them.
        for(let handler of route){

            if(handler && handler.accept){
                customAccept = handler.accept;
                continue;
            }

            let terr = new TypeError('Routre handler must be a function');
            assert.strictEqual(typeof handler, 'function', terr);
            aRoutes.push(adaptHandler(this, handler));
        }

        if(this.shouldParseBody)
            aRoutes.unshift(parse.bind(this));

        // Physically add the adapted route to Express.
        this.express[method](path, filter.bind(this, customAccept), ...aRoutes);
        return { desc: Function.prototype };
    },

    defaultErrorHandler(err, req, res, next){
        let original = err;

        // Run user error handler.
        this.onRouteError(req.input, err, sendError.bind(res));
        err = res.err || err;

        // Log warning and abort if headers were already sent.
        if(res.headersSent){
            this.log.err(err, 'error after headers sent');
            return next(err);
        }

        // Handle non-Error objects thrown and unknown Exceptions.
        if( !(err instanceof Error && err.type in errors) )
            err = errors.ServerFault(err.message);

        // Handle known REST errors.
        res.status(err.status).end(err.message);

        // Log unexpected errors sent to the user.
        if(err.status == 500 && !original.handled)
            this.log.err(original, 'route error');
    }
}
