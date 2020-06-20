
function defaultErrorHandler(err, input){
    let original = err;

    let { log, res } = input;

    // Log warning and abort if headers were already sent.
    if(res.headersSent){
        log.err(err, 'error after headers sent');
        return;
    }



    res.status(500).end();

    // Log unexpected errors sent to the user.
    if(/*err.status == 500 && */!original.handled)
        log.err(original, 'route error');
}

function execHandler(app, handler, req, res){

    if(typeof handler !== 'function')
        return;

    let input = {
        ...app._global, conf: app.conf, req, res,
        flash: req.flash, log: app.log, headers: req.headers,
        query: req.query, params: req.params, body: req.body
    };

    req.input = input;

    // input.error = ...


    input.next = () => execHandler(app, handler.next, input.req, input.res);

    handler(input, defaultErrorHandler);
}

module.exports = {

    normalizeHandler(func){
        if(func.constructor.name === 'AsyncFunction')
            return (input, onError) => func(input).catch(err => onError(err, input));

        return function(input, onError){
            try{ func(input) }
            catch(err){ onError(err, input); }
        };
    },

    execHandler
}

 // TODO add next

 // TODO create 'next()'
