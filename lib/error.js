
class HTTPError extends Error {
    constructor(status, message, type) {
        super(message);
        this.status = status;
        this.name = 'HTTPError';
        this.type = type;
    }
}

function anythingToError(thing){
    if(thing instanceof HTTPError)
        return thing;
    if(thing instanceof Error)
        return new HTTPError(500, thing.message, 'text');
    if(thing instanceof Buffer)
        return new HTTPError(500, thing, 'binary');
    if(typeof thing == 'object')
        return new HTTPError(500, JSON.stringify(thing), 'json');
    return new HTTPError(500, String(thing), 'text');
}

// This function is called when throw/rejection comes from route code (Except callbacks)
// and from res.error() when calling it with an error
function handleError(err, input){
    input.res.failed = true;

    // Need to keep the original error stack and message for logging.
    input.res.err = err;

    const { log, res } = input;

    err = anythingToError(err);

    if(err.status < 500)
        return;

    log.error({ method: input.res.req.method, path: input.res.req.path,
        headers: input.res.req.headers, type: 'route', err: input.res.err });

    if(!res.finished)
        res.status(err.status).type(err.type).end(
            /*istanbul ignore next */
            process.env.NODE_ENV !== 'production' ? err.message : '');
}

module.exports = { handleError, HTTPError };
