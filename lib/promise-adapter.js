
const errors = require('restify-errors');

function sendError(name, msg){
    this.send(new errors[name + 'Error'](msg));
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

        // Handle errors and pass arguments to Async functions.
        if(func.constructor.name === 'AsyncFunction')
            return func(args).catch(function(err) {
                app.emit('error', req, res, err, sendError.bind(res));
            });

        // Handle errors and pass arguments to Regular functions.
        try{ func(args) }
        catch(err){
            app.emit('error', req, res, err, sendError.bind(res));
        }
    }

}
