const cookie = require('./cookie');

const { handleError, buildHTTPError, HTTPError, anythingToError } = require('./error');

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
 * @typedef ResponseInfo
 * @property {number} status
 * @property {{ [header: string]: string | string[] }} headers
 * @property {Response} body
 */

class Response {

    /** @type {import('./native').NativeResponseHandles|void} */
    #_responseHandles;

    /** @type {WritableStream} */
    #_resStream;

    /** @type {WritableStreamDefaultWriter} */
    #_streamWriter;

    /** @type {number} */
    #_statusCode;

    /** @type {(resInfo: ResponseInfo) => Promise<ResponseInfo>} */
    #_resolve;

    /** @type {() => void} */
    #_reject;

    /** @type {{ [header: string]: string | string[] }} */
    #_headers = {};

    /** @type {Promise<ResponseInfo>} */
    ended;

    /**
     * @param {import('./api').PertialInputObject} input
     */
    constructor(input) {

        this.#_responseHandles = input.resHandles;
        this.#_resStream = input.resStream;
        this.#_streamWriter = this.#_resStream.getWriter();
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
     * @returns {Response}
     */
    write(chunk) {
        if(typeof chunk == 'string')
            chunk = new TextEncoder().encode(chunk);
        this.#_streamWriter.write(chunk);
        return this;
    }

    /**
     * End the response.
     * @this {Response}
     * @param {string|Uint8Array} [body]
     * @returns {Promise<ResponseInfo>}
     */
    end(body){

        // TODO Maybe this should throw and be caught by 'handleError'?
        if(this.finished)
            // this.input.log.warn({ err: new Error('Called `res.end()` after response was already finished') });
            return;

        body && this.write(body);
        this.#_streamWriter.close();

        this.finished = true;
        return this.#_resolve({
            status: this.#_statusCode,
            headers: this.#_headers,
            body: this
        });
    }

    /**
     * Handle an error response.
     * @this {Response}
     * @param {unknown} statusOrError
     * @param {string} [message]
     * @param  {...any} args
     * @returns {HTTPError}
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
     * Assert a condition, throwing an HTTPError if false.
     * @param {number} status
     * @param {boolean} cond
     * @param {string} [message]
     * @param  {...any} args
     */
    assert(status, cond, message, ...args){
        if(!cond)
            return true;
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
     * @param {any} data
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
    text(data){
        this.type('text');
        this.end(String(data));
        return this;
    }

    /**
     * Clear a cookie.
     * @this {Response}
     * @param {string} name
     * @param {object} [opts]
     * @returns {Response}
     */
    clearCookie(name, opts) {
        opts = { path: '/', ...opts, expires: new Date(1) };
        delete opts.maxAge;
        return this.cookie(name, '', opts);
    }

    /**
     * Set a cookie.
     * @this {Response}
     * @param {string} name
     * @param {string} value
     * @param {object} [opts]
     */
    cookie(name, value, opts = {}) {
        this.append('Set-Cookie', cookie.serialize(name, value, opts));
        return this;
    }

    // Assert methods    

    /**
     * Assert a 400 Bad Request condition.
     * @param {boolean} cond
     * @param {string} [message]
     * @param  {...any} args
     */
    badRequest(cond, message, ...args) {
        return this.assert(ASSERTS.badRequest, cond, message, ...args);
    }

    /**
     * Assert a 401 Unauthorized condition.
     * @param {boolean} cond
     * @param {string} [message]
     * @param  {...any} args
     */
    unauthorized(cond, message, ...args) {
        return this.assert(ASSERTS.unauthorized, cond, message, ...args);
    }

    /**
     * Assert a 403 Forbidden condition.
     * @param {boolean} cond
     * @param {string} [message]
     * @param  {...any} args
     */
    forbidden(cond, message, ...args) {
        return this.assert(ASSERTS.forbidden, cond, message, ...args);
    }

    /**
     * Assert a 404 Not Found condition.
     * @param {boolean} cond
     * @param {string} [message]
     * @param  {...any} args
     */
    notFound(cond, message, ...args) {
        return this.assert(ASSERTS.notFound, cond, message, ...args);
    }

    /**
     * Assert a 409 Conflict condition.
     * @param {boolean} cond
     * @param {string} [message]
     * @param  {...any} args
     */
    conflict(cond, message, ...args) {
        return this.assert(ASSERTS.conflict, cond, message, ...args);
    }

    /**
     * Assert a 410 Gone condition.
     * @param {boolean} cond
     * @param {string} [message]
     * @param  {...any} args
     */
    gone(cond, message, ...args) {
        return this.assert(ASSERTS.gone, cond, message, ...args);
    }

    /**
     * Assert a 415 Bad Type condition.
     * @param {boolean} cond
     * @param {string} [message]
     * @param  {...any} args
     */
    badType(cond, message, ...args) {
        return this.assert(ASSERTS.badType, cond, message, ...args);
    }

    /**
     * Get the response stream. After calling this, you are responsible for closing the stream.
     * After calling this, you should not use other methods that write to response body.
     * @returns {WritableStream}
     */
    stream() {
        this.#_streamWriter.releaseLock();
        return this.#_resStream;
    }

}

module.exports = { Response };


// TODO 406 notAcceptable:
// TODO 405 methodNotAllowed
// TODO 408 Request Timeout
// TODO 411 Length Required
// TODO 413 Payload Too Large
// TODO 414 Request-URI Too Long
// TODO for WS: 426 Upgrade Required
// TODO 429 Too Many Requests
// TODO 431 Request Header Fields Too Large
