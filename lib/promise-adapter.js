
const handleError = require('./errors');

function adaptErrors(func, onError){

    return function(...args){

        // Handle errors and pass arguments to Async functions.
        if(func.constructor.name === 'AsyncFunction')
            return func(...args).catch(onError);

        // Handle errors and pass arguments to Regular functions.
        try{ func(...args) }
        catch(err){ onError(err); }
    }

}

module.exports = function adapt(app, func){

    if(typeof func !== 'function')
        throw Error('trying to route to non-function');

    return function(req, res, next) {
        let args = {
            ...req.server.exposed, req: req, res: res, next: next,
            query: req.query, params: req.params, body: req.body,
            flash: req.flash, conf: req.server.settings
        };

        let errClass, errMessage;
        const sendError = function(err, msg){
            errClass = err;
            errMessage = msg;
        }

        func = adaptErrors(func, function(err){
            if(app.listenerCount('error') > 0)
                app.emit('error', req, res, err, sendError);
            handleError.bind(res)(errClass || err, errMessage);
        });

        func(args);
    }

}
