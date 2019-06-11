const adaptErrors = require('./a-sync-error-adapter');
const errors = require('./errors');

function parseRestError(err, msg){

    // Handle Rest errors sent as string.
    if(typeof errors[err] == 'function')
        err = errors[err](msg || '');
    return err;
}

function sendError(err, msg){
    // this => Response object
    this.err = parseRestError(err, msg);
}

// Function to be executed when erros/rejections are thrown on a handler.
function onErrorHandler(app, err, input){

    // Log warning and abort if headers were already sent.
    if(input.res.headersSent)
        return app.log.warn({ req: input.req }, 'ERROR AFTER HEADERS SENT');

    // Run user error handler.
    if(app.listenerCount('error') > 0)
        app.emit('error', input, err, sendError.bind(input.res));
    err = input.res.err || err;

    // Handle non-Error objects thrown.
    if(! (err instanceof Error) )
        err = errors.ServerFault();

    // Handle unknown Exceptions.
    else if(!(err.type in errors))
        err = errors.ServerFault(err.message);

    // Handle known REST errors.
    input.res.status(err.status).end(err.body);
}

function triggerError(input, err, msg){
    // this => app
    err = parseRestError(err, msg);
    onErrorHandler(this, err, input);
}

// Generate an adapted handler for Express routes.
function adaptHandler(app, handler){

    // Adapt sync/async errors to allow both types of functions as handlers.
    handler = adaptErrors(handler, onErrorHandler.bind(null, app));

    // Function that will be physically run by Express.
    return function(req, res, next){

        let input = {
            ...app.exposed, req: req, res: res, next: next,
            query: req.query, params: req.params, body: req.body,
            flash: res.locals, conf: app.settings, log: app.log || null
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

    // Physically add the adapted route to Express.
    this.express[method](path, ...route);
}
