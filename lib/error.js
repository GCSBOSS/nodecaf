const { format } = require('./logger');
const { getContentTypeFromDataType } = require('./types');

/**
 * HTTP Error class and handler
 */
class HTTPError extends Error {

    /**
     * @param {number} status HTTP status code
     * @param {string} message Error message
     * @param {string|void} [type] Content-Type of the message (e.g. 'text', 'json', 'binary')
     */
    constructor(status, message, type) {
        super(message);
        this.status = status;
        this.name = 'HTTPError';
        this.type = type;
    }
}

/**
 * Converts any value into an HTTPError instance
 * @param {unknown} thing Any value
 * @returns {HTTPError} HTTPError instance
 */
function anythingToError(thing){
    if(thing instanceof HTTPError)
        return thing;
    if(thing instanceof Error)
        return new HTTPError(500, thing.message, 'text');
    if(thing instanceof Buffer)
        return new HTTPError(500, thing.toString(), 'binary');
    if(typeof thing == 'object')
        return new HTTPError(500, JSON.stringify(thing), 'json');
    return new HTTPError(500, String(thing), 'text');
}

 function buildHTTPError(status, message, ...args){
    const type = getContentTypeFromDataType(message);

    if(typeof message == 'string')
        message = format(message, ...args);
    else if(type == 'application/json')
        message = JSON.stringify(message);
    else if(type == 'text/plain')
        message = String(message);

    return new HTTPError(status, message, type);
 }


function respondError(status, message, ...args){
    this.status(status);
    const type = getContentTypeFromDataType(message);

    if(typeof message == 'string')
        message = format(message, ...args);
    else if(type == 'application/json')
        message = JSON.stringify(message);
    else if(type == 'text/plain')
        message = String(message);

    type && this.type(type);
    this.end(message);
}


/**
 * This function is called when throw/rejection comes from route code (Except callbacks) 
 * and from res.error() when calling it with an error
 * @param {Error} err The thrown/rejected error or value
 * @param {object} input Context object
 * @param {string} input.method HTTP method
 * @param {string} input.path HTTP path
 * @param {import('http').ServerResponse} input.res HTTP response object
 * @param {import('./logger').Logger} input.log Logger instance
 * @param {{ [header: string]: unknown }} input.headers HTTP request headers
 * @returns {HTTPError} The handled HTTPError instance
 */
function handleError(err, { method, path, res, log, headers }){

    // Need to keep the original error stack and message for logging.
    const originalErr = err;

    const herr = anythingToError(err);

    if(herr.status > 499)
        log.error({ method, path, headers, type: 'route', err: originalErr });

    if(!res.finished)
        res.status(herr.status)
            .type(herr.type)
            .end(herr.status < 500
                ? herr.message
                : process.env.NODE_ENV !== 'production' || herr.status < 500
                    ? err.message
                    : ''
        );
    
    return herr;
}

module.exports = { handleError, HTTPError, buildHTTPError };
