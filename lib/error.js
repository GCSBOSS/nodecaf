
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
function handleError(err, { method, path, res, log, headers }){

    // Need to keep the original error stack and message for logging.
    const originalErr = err;

    const herr = anythingToError(err);

    if(herr.status > 499){
        log.error({ method, path, headers, type: 'route', err: originalErr });

        if(!res.finished)
            res.status(herr.status).type(herr.type).end(
                /*istanbul ignore next */
                process.env.NODE_ENV !== 'production' ? err.message : '');
    }

    return herr;
}

module.exports = { handleError, HTTPError };
