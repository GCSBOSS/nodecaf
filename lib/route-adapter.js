const assert = require('assert');

const errors = require('./errors');

function parseError(err, msg){
    if(err in errors)
        err = errors[err](msg || err);
    return err;
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
            flash: res.locals, conf: app.conf, log: app.log,
            headers: req.headers
        };

        input.error = triggerError.bind(app, input);

        req.input = input;

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
            handler = handler.bind(this);
            aRoutes.push(adaptHandler(this, handler));
        }

        if(this.shouldParseBody)
            aRoutes.unshift(parse.bind(this));

        // Physically add the adapted route to Express.
        this.express[method](path, filter.bind(this, customAccept), ...aRoutes);
        return { desc: Function.prototype };
    }

}
