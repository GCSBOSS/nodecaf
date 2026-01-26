const { format } = require('./logger');
const { getContentTypeFromData, parseBuffer, getDataTypeFromContentType } = require('./types');

/**
 * HTTP Error class and handler
 */
class HTTPError {

    /**
     * @param {number} status HTTP status code
     * @param {string} message Error message
     * @param {import('./types').ShortType|void} [type] Data type of the message (e.g. 'text', 'json', 'binary')
     */
    constructor(status, message, type) {
        this.status = status;
        this.type = type;
        this.message = message;
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
    const contentType = getContentTypeFromData(message);
    const dataTypeObject = getDataTypeFromContentType(contentType);

    /** @type {string} */
    let strMessage;
    if(typeof message == 'string')
        strMessage = format(message, ...args);
    else if(contentType == 'application/json')
        strMessage = JSON.stringify(message);
    else if(message instanceof Buffer)
        strMessage = parseBuffer(message, dataTypeObject.type, dataTypeObject.charset);
    // // else if(type == 'text/plain')
    else if(typeof message == 'undefined')
        strMessage = '';
    else
        strMessage = String(message);

    return new HTTPError(status, strMessage, dataTypeObject.type);
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
