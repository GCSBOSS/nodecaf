const adaptErrors = require('./a-sync-error-adapter');
const handleError = require('./errors');

// Function for the user to tap into output REST errors.
function sendError(req, err, msg){
    req.errClass = err;
    req.errMessage = msg;
}

// Function to be executed when erros/rejections are thrown on a handler.
function onHandlerError(app, err, input){

    // Run user error handler.
    if(app.listenerCount('error') > 0)
        app.emit('error', input, err, sendError.bind(null, input.req));

    // Run default error handler.
    handleError.bind(null, input.req, input.res, err)();
}

// Generate an adapted handler for Restify routes.
function adaptHandler(app, handler){

    // Adapt sync/async errors to allow both types of functions as handlers.
    handler = adaptErrors(handler, onHandlerError.bind(null, app));

    // Function that will be physically run by Restify.
    return function(req, res, next){

        let input = {
            ...app.exposed, req: req, res: res, next: next,
            query: req.query, params: req.params, body: req.body,
            flash: req.flash, conf: app.settings
        };

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
