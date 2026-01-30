const cookie = require('./cookie');

const { buildHTTPError, anythingToError } = require('./error');

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
 * @property {Response} body
 */

class Response {

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
                body: this
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
     * Handle an error response.
     * @this {Response}
     * @param {unknown} statusOrError
     * @param {string} [message]
     * @param  {...any} args
     * @returns {import('./error').HTTPError}
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
     * @returns {asserts cond is true}
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
     * @returns {asserts cond is false}
     */
    badRequest(cond, message, ...args) {
        this.assert(ASSERTS.badRequest, cond, message, ...args);
    }

    /**
     * Assert a 401 Unauthorized condition.
     * @param {boolean} cond
     * @param {string} [message]
     * @param  {...any} args
     * @returns {asserts cond is false}
     */
    unauthorized(cond, message, ...args) {
        this.assert(ASSERTS.unauthorized, cond, message, ...args);
    }

    /**
     * Assert a 403 Forbidden condition.
     * @param {boolean} cond
     * @param {string} [message]
     * @param  {...any} args
     * @returns {asserts cond is false}
     */
    forbidden(cond, message, ...args) {
        this.assert(ASSERTS.forbidden, cond, message, ...args);
    }

    /**
     * Assert a 404 Not Found condition.
     * @param {boolean} cond
     * @param {string} [message]
     * @param  {...any} args
     * @return {asserts cond is false}
     */
    notFound(cond, message, ...args) {
        this.assert(ASSERTS.notFound, cond, message, ...args);
    }

    /**
     * Assert a 409 Conflict condition.
     * @param {boolean} cond
     * @param {string} [message]
     * @param  {...any} args
     * @returns {asserts cond is false}
     */
    conflict(cond, message, ...args) {
        this.assert(ASSERTS.conflict, cond, message, ...args);
    }

    /**
     * Assert a 410 Gone condition.
     * @param {boolean} cond
     * @param {string} [message]
     * @param  {...any} args
     * @returns {asserts cond is false}
     */
    gone(cond, message, ...args) {
        this.assert(ASSERTS.gone, cond, message, ...args);
    }

    /**
     * Assert a 415 Bad Type condition.
     * @param {boolean} cond
     * @param {string} [message]
     * @param  {...any} args
     * @returns {asserts cond is false}
     */
    badType(cond, message, ...args) {
        this.assert(ASSERTS.badType, cond, message, ...args);
    }

    /**
     * Get the response stream. After calling this, you are responsible for closing the stream.
     * After calling this, you should not use other methods that write to response body.
     * @returns {WritableStream}
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
