/**
 * @module response
 * @description HTTP response builder. Manages response status codes, headers, body writing,
 * and provides assertion helpers for common HTTP errors.
 * @example
 * res.status(200).type('json').json({ success: true });
 * res.notFound(missingUser, 'User %s not found', userId);
 * res.set('X-Custom', 'value').end('Done');
 */

import * as cookie from './cookie.js';
import { buildHTTPError, anythingToError } from './error.js';

const SHORT_CONTENT_TYPES = {
    'text': 'text/plain',
    'json': 'application/json'
};

const ASSERTS = {
    badRequest: 400,
    unauthorized: 401,
    forbidden: 403,
    notFound: 404,
    conflict: 409,
    gone: 410,
    badType: 415
};

/**
 * @typedef ResponseBuildInput
 * @property {import('./native').NativeResponseHandles} [resHandles]
 */

/**
 * @typedef ResponseInfo
 * @property {number} status
 * @property {{ [header: string]: string | string[] }} headers
 * @property {Uint8Array|string|null|number|boolean|Object.<string, unknown>|ReadableStream} [body]
 */

export class Response {

    /** @type {import('./native').NativeResponseHandles} */
    #_responseHandles;

    /** @type {number} */
    #_statusCode;

    /** @type {(resInfo: ResponseInfo) => Promise<ResponseInfo>} */
    #_resolve;

    /** @type {(reason: Error) => void} */
    #_reject;

    /** @type {{ [header: string]: string | string[] }} */
    #_headers = {};

    /** @type {Promise<ResponseInfo>} */
    ended;

    /**
     * @param {ResponseBuildInput} input
     */
    constructor(input) {

        this.#_responseHandles = input.resHandles;
        this.#_statusCode = 200;
        this.#_headers = {};
        
        let resResolve, resReject;

        const endPromise = new Promise((resolve, reject) => {
            resResolve = resolve;
            resReject = reject;
        });
        
        this.ended = endPromise,
        this.#_resolve = resResolve,
        this.#_reject = resReject
    }

    /**
     * Write data to the response.
     * @this {Response}
     * @param {string|Uint8Array} chunk
     * @returns {Promise<Response>}
     */
    async write(chunk) {
        await this.#_responseHandles?.write?.(chunk);
        return this;
    }

    /**
     * End the response.
     * @this {Response}
     * @param {string|Uint8Array} [body]
     * @returns {Promise<ResponseInfo>}
     */
    async end(body){
        try{

            // TODO Maybe this should throw and be caught by 'handleError'?
            if(this.finished)
                // this.input.log.warn({ err: new Error('Called `res.end()` after response was already finished') });
                return;

            this.finished = true;

            body && await this.write(body);

            await this.#_responseHandles.end();

            const resInfo = {
                status: this.#_statusCode,
                headers: this.#_headers,
            }; 

            this.#_resolve(resInfo);
            return resInfo;
        }
        catch(err) {
            this.#_reject(err);
            throw err; 
        }
    }

    /**
     * Handle an error response
     * Converts various error types to HTTPError and sends appropriate response
     * @param {unknown} statusOrError HTTP status code or Error object
     * @param {string} [message] Error message (required if statusOrError is a number)
     * @param  {...unknown} args Arguments for message formatting
     * @returns {import('./error').HTTPError} The handled HTTPError instance
     */
    error(statusOrError, message, ...args){

        const httpErr = !Number.isInteger(statusOrError)
            ? anythingToError(statusOrError)
            : buildHTTPError(Number(statusOrError), message, ...args);
        
        this.status(httpErr.status);
        httpErr.type && this.type(httpErr.type);
        this.end(httpErr.message);
        return httpErr;
    }

    /**
     * Assert a condition, throwing an HTTPError if the condition is true
     * @param {number} status HTTP status code to return if assertion fails
     * @param {boolean} cond Condition to assert (throws if true)
     * @param {string} [message] Error message
     * @param  {...unknown} args Arguments for message formatting
     * @returns {void}
     */
    assert(status, cond, message, ...args){
        if(!cond)
            return;
        throw buildHTTPError(status, message, ...args);
    }

    /**
     * Get a response header.
     * @param {string} k
     * @returns {string|string[]|void}
     */
    get(k){
        return this.#_headers[k.toLowerCase()];
    }

    /**
     * Set a response header.
     * @this {Response}
     * @param {string} k
     * @param {string|string[]} v
     * @returns {Response}
     */
    set(k, v){
        this.#_responseHandles 
            && this.#_responseHandles.setHeader?.(k, v);
        this.#_headers[k.toLowerCase()] = v;
        return this;
    }

    /**
     * Append a value to a response header.
     * @this {Response}
     * @param {string} k
     * @param {string} v
     * @returns {Response}
     */
    append(k, v){
        const prev = this.#_headers[k.toLowerCase()];
        return this.set(k, !prev 
            ? v
            : Array.isArray(prev)
                ? prev.concat(v)
                : [ prev, v ]
        );
    }

    /**
     * Set the response status code.
     * @this {Response}
     * @param {number} s
     * @returns {Response}
     */
    status(s){
        this.#_statusCode = s;
        this.#_responseHandles 
            && this.#_responseHandles.setStatus?.(s);
        return this;
    }

    /**
     * Set the Content-Type header.
     * @this {Response}
     * @param {string} ct
     * @returns {Response}
     */
    type(ct){
        ct && this.set('Content-Type', SHORT_CONTENT_TYPES[ct] || ct);
        return this;
    }

    /**
     * Send a JSON response.
     * @this {Response}
     * @param {null|string|number|boolean|Object.<string, unknown>} data
     * @returns {Response}
     */
    json(data){
        this.type('json');
        this.end(JSON.stringify(data));
        return this;
    }

    /**
     * Send a text response.
     * @this {Response}
     * @param {string} data
     * @returns {Response}
     */
    text(data, type = 'text'){
        this.type(type);
        this.end(String(data));
        return this;
    }

    /**
     * Clear a cookie by setting expiration to past date
     * @param {string} name Cookie name
     * @param {object} [opts] Cookie options (path defaults to '/')
     * @returns {Response} This Response object for chaining
     */
    clearCookie(name, opts) {
        opts = { path: '/', ...opts, expires: new Date(1) };
        delete opts.maxAge;
        return this.cookie(name, '', opts);
    }

    /**
     * Set a cookie in the response
     * @param {string} name Cookie name
     * @param {string} value Cookie value
     * @param {import('./cookie').CookieOptions} [opts] Cookie options
     * @returns {Response} This Response object for chaining
     */
    cookie(name, value, opts = {}) {
        this.append('Set-Cookie', cookie.serialize(name, value, opts));
        return this;
    }

    // Assert methods    

    /**
     * Assert a 400 Bad Request condition
     * Throws if the condition is true
     * @param {boolean} cond Condition to assert
     * @param {string} [message] Error message
     * @param  {...unknown} args Arguments for message formatting
     * @returns {void}
     */
    badRequest(cond, message, ...args) {
        this.assert(ASSERTS.badRequest, cond, message, ...args);
    }

    /**
     * Assert a 401 Unauthorized condition
     * Throws if the condition is true
     * @param {boolean} cond Condition to assert
     * @param {string} [message] Error message
     * @param  {...unknown} args Arguments for message formatting
     * @returns {void}
     */
    unauthorized(cond, message, ...args) {
        this.assert(ASSERTS.unauthorized, cond, message, ...args);
    }

    /**
     * Assert a 403 Forbidden condition
     * Throws if the condition is true
     * @param {boolean} cond Condition to assert
     * @param {string} [message] Error message
     * @param  {...unknown} args Arguments for message formatting
     * @returns {void}
     */
    forbidden(cond, message, ...args) {
        this.assert(ASSERTS.forbidden, cond, message, ...args);
    }

    /**
     * Assert a 404 Not Found condition
     * Throws if the condition is true
     * @param {boolean} cond Condition to assert
     * @param {string} [message] Error message
     * @param  {...unknown} args Arguments for message formatting
     * @returns {void}
     */
    notFound(cond, message, ...args) {
        this.assert(ASSERTS.notFound, cond, message, ...args);
    }

    /**
     * Assert a 409 Conflict condition
     * Throws if the condition is true
     * @param {boolean} cond Condition to assert
     * @param {string} [message] Error message
     * @param  {...unknown} args Arguments for message formatting
     * @returns {void}
     */
    conflict(cond, message, ...args) {
        this.assert(ASSERTS.conflict, cond, message, ...args);
    }

    /**
     * Assert a 410 Gone condition
     * Throws if the condition is true
     * @param {boolean} cond Condition to assert
     * @param {string} [message] Error message
     * @param  {...unknown} args Arguments for message formatting
     * @returns {void}
     */
    gone(cond, message, ...args) {
        this.assert(ASSERTS.gone, cond, message, ...args);
    }

    /**
     * Assert a 415 Unsupported Media Type condition
     * Throws if the condition is true
     * @param {boolean} cond Condition to assert
     * @param {string} [message] Error message
     * @param  {...unknown} args Arguments for message formatting
     * @returns {void}
     */
    badType(cond, message, ...args) {
        this.assert(ASSERTS.badType, cond, message, ...args);
    }

    /**
     * Get the response stream for manual writing
     * After calling this, you are responsible for closing the stream.
     * Do not use other methods that write to response body after calling this.
     * @returns {WritableStream<Uint8Array|string>} A Web Streams API WritableStream
     */
    stream() {
        return new WritableStream({
            write: async (chunk) => {
                await this.#_responseHandles?.write?.(chunk);
            },
            close: async () => {
                await this.#_responseHandles?.end?.();
            }
        });
    }

}

// TODO 406 notAcceptable:
// TODO 405 methodNotAllowed
// TODO 408 Request Timeout
// TODO 411 Length Required
// TODO 413 Payload Too Large
// TODO 414 Request-URI Too Long
// TODO for WS: 426 Upgrade Required
// TODO 429 Too Many Requests
// TODO 431 Request Header Fields Too Large
