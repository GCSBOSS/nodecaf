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

/**
 * Builds an HTTPError instance from status and message
 * @param {number} status HTTP status code
 * @param {unknown} message Error message or data
 * @param  {...any} args Arguments for message formatting (if message is a string)
 * @returns {HTTPError} HTTPError instance
 */
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

/**
 * This function is called when throw/rejection comes from route code (Except callbacks) 
 * and from res.error() when calling it with an error
 * @param {unknown} err The thrown/rejected error or value
 * @param {import('./api').PertialInputObject} input
 * @returns {HTTPError} The handled HTTPError instance
 */
function handleError(err, { method, path, res, log, headers }){

    // Need to keep the original error stack and message for logging.
    const originalErr = err;

    const herr = anythingToError(err);

    if(herr.status > 499)
        log.error({ method, path, headers, type: 'route', err: originalErr });

    if(!res.finished){
        res.status(herr.status);
        herr.type && res.type(herr.type);
        res.end(herr.status < 500
            ? herr.message
            : process.env.NODE_ENV !== 'production' || herr.status < 500
                ? err instanceof Error
                    ? err.message
                    : String(err)
                : ''
        );
    }
    
    return herr;
}

module.exports = { handleError, HTTPError, buildHTTPError };
