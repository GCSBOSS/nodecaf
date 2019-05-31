const adaptErrors = require('./a-sync-error-adapter');
const errors = require('restify-errors');

function parseRestifyError(err, msg){

    // Handle RestifyErrors sent as string.
    if(typeof errors[err + 'Error'] == 'function')
        err = new errors[err + 'Error'](msg || '');
    return err;
}

function sendError(err, msg){
    // this => Response object
    this.err = parseRestifyError(err, msg);
}

// Function to be executed when erros/rejections are thrown on a handler.
function onErrorHandler(app, err, input){
    let res = input.res;

    // Run user error handler.
    if(app.listenerCount('error') > 0)
        app.emit('error', input, err, sendError.bind(res));
    err = res.err || err;

    // Handle none-Error objects thrown.
    if(! (err instanceof Error) )
        return res.send(new errors.InternalServerError());

    // Handle known Restify errors.
    if(err.constructor.displayName in errors)
        return res.send(err);

    // Handle unknown Exceptions.
    return res.send(new errors.InternalServerError(err.message));
}

function triggerError(input, err, msg){
    // this => app
    err = parseRestifyError(err, msg);
    onErrorHandler(this, err, input);
}

// Generate an adapted handler for Restify routes.
function adaptHandler(app, handler){

    // Adapt sync/async errors to allow both types of functions as handlers.
    handler = adaptErrors(handler, onErrorHandler.bind(null, app));

    // Function that will be physically run by Restify.
    return function(req, res, next){

        let input = {
            ...app.exposed, req: req, res: res, next: next,
            query: req.query, params: req.params, body: req.body,
            flash: req.flash, conf: app.settings
        };

        input.error = triggerError.bind(app, input);

        // Actually run the user handler.
        handler(input);
    }
}

module.exports = function addRoute(method, path, ...route){

    // Loop through th route handlers adapting them.
    route = route.map(handler => {

        if(typeof handler !== 'function')
            throw Error('Trying to add non-function route handler');

        return adaptHandler(this, handler);
    });

    // Physically add the adapted route to restify.
    this.server[method](path, ...route);
}
