const adaptErrors = require('./a-sync-error-adapter');
const errors = require('./errors');

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

    addRoute(method, path, ...route){

        // Loop through th route handlers adapting them.
        route = route.map(handler => {

            if(typeof handler !== 'function')
                throw Error('Trying to add non-function route handler');

            return adaptHandler(this, handler);
        });

        // Physically add the adapted route to Express.
        this.express[method](path, ...route);
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
