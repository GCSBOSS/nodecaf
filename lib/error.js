/**
 * @module error
 * @description HTTP error handling and conversion. Maps thrown errors to appropriate HTTP status codes
 * and messages, with support for structured error logging.
 * @example
 * throw new HTTPError(404, 'User not found', 'json');
 * const httpErr = buildHTTPError(400, 'Invalid input');
 * const converted = anythingToError(someValue);
 */

import { format } from './logger.js';
import { nativeModule } from './native.js';
import { getContentTypeFromData, getDataTypeFromContentType, bytesToString } from './types.js';

/**
 * HTTP Error class and handler
 */
export class HTTPError {

    /**
     * @param {number} status HTTP status code
     * @param {string} [message] Error message
     * @param {import('./types').ShortType} [type] Data type of the message (e.g. 'text', 'json', 'binary')
     */
    constructor(status, message, type) {
        this.status = status;
        this.type = type;
        this.message = message;
    }
}

/**
 * Convert any thrown value into an HTTPError instance
 * Maps common error types to appropriate HTTP errors
 * @param {unknown} thing Any value to convert
 * @returns {HTTPError} An HTTPError instance with appropriate status code
 */
export function anythingToError(thing){
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
export function buildHTTPError(status, message, ...args){
    const contentType = getContentTypeFromData(message);
    const dataTypeObject = getDataTypeFromContentType(contentType);

    if(message instanceof Uint8Array)
        message = bytesToString(message, dataTypeObject.charset);

    /** @type {string} */
    let strMessage;
    if(typeof message == 'string')
        strMessage = format(message, ...args);
    else if(contentType == 'application/json')
        strMessage = JSON.stringify(message);
    // // else if(type == 'text/plain')
    else if(typeof message == 'undefined')
        strMessage = '';
    else
        strMessage = String(message);

    return new HTTPError(status, strMessage, dataTypeObject.type);
}

/**
 * @typedef HandleErrorInput
 * @property {import('./api').RequestInfo} reqInfo Request info object
 * @property {import('./response').Response} res HTTP response object
 * @property {import('./logger').Logger} log Logger instance
 */

/**
 * Handle and respond to errors thrown in route handlers
 * Converts errors to HTTPError, logs appropriately, and sends response
 * @param {unknown} err The thrown/rejected error or value
 * @param {HandleErrorInput} input
 * @returns {HTTPError} The handled HTTPError instance
 */
export function handleError(err, { reqInfo, res, log }){

    // Need to keep the original error stack and message for logging.
    const originalErr = err;

    const herr = anythingToError(err);

    if(herr.status > 499)
        log.error({ 
            ...reqInfo, 
            type: 'route', 
            err: originalErr 
        });

    if(!res.finished){
        res.status(herr.status);
        herr.type && res.type(herr.type);
        res.end(herr.status < 500
            ? herr.message
            : nativeModule.env() !== 'production' || herr.status < 500
                ? err instanceof Error
                    ? err.message
                    : String(err)
                : ''
        );
    }
    
    return herr;
}
