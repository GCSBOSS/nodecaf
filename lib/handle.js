
const { parseBody } = require('./parser');
const getHTTPError = require('./error');

function forMiddleware(mw, req, res){
    return new Promise((done, error) => {
        try{
            mw(req, res, done);
        }
        catch(e){
            /* istanbul ignore next */
            error(e);
        }
    });
}

// This function is called when throw/rejection comes from route code (Except callbacks)
// and from res.error() when calling it with an error
function handleError(err, input){

    // Need to keep the original error stack and message for logging.
    let original = err;

    let { log, res } = input;

    res.stackAborted = true;

    if(!err || typeof err.status !== 'number')
        err = getHTTPError(500, '');
    else if(err.status < 500)
        return;

    if(!res.finished)
        res.status(err.status).end();

    log.error({ type: 'route error', err: original });
}

async function execHandler(app, handler, req, res){

    if(typeof handler !== 'function' || res.stackAborted)
        return;

    let input = {
        ...app.global, conf: app.conf, req, res,
        flash: req.flash, log: app.log, headers: req.headers,
        query: req.query, params: req.params, body: req.body
    };

    req.input = input;
    res.input = input;

    input.next = () => execHandler(app, handler.next, input.req, input.res);

    await handler(input, handleError);

    if(handler.tail)
        req.emit('handle');
}

function handleCORS(app, req, res){
    return forMiddleware(app._cors, req, res);
}

function handleCookies(app, req, res){
    return forMiddleware(app._cookies, req, res);
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

    execHandler,
    handleCORS,
    handleError,
    handleCookies,

    async prepareHandling(app, req, res){
        req.hasBody = Boolean(req.headers['content-length']);

        if(app._shouldParseBody && req.hasBody)
            req.body = await parseBody.apply(app, [req]);

        await forMiddleware(app._compress, req, res);
        await handleCookies(app, req, res);

        if(app.conf.cors)
            await handleCORS(app, req, res);

    }
}
