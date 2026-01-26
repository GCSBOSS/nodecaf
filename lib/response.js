const cookie = require('./cookie');

const { handleError, buildHTTPError, HTTPError } = require('./error');
const { Logger } = require('./logger');

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

/**
 * @typedef RequestInfo
 * @property {string} method
 * @property {string} path
 * @property {string} host
 * @property {string} agent
 * @property {string} type
 * @property {string} msg
 */

/**
 * @typedef ResponseContext
 * @property {RequestInfo} reqInfo
 * @property {import('./api').PertialInputObject} input
 * @property {(info: ResponseInfo) => Promise} resolve
 * @property {(err: any) => void} reject
 * @property {() => void} _realEnd
 */
/**
 * @typedef ResponseProps
 * @property {boolean} finished
 * @property {Promise<ResponseInfo>} ended
 * @property {{ [header: string]: string | string[] }} headers
 *
 * @property {(body?: string | Buffer) => Promise<ResponseInfo>} end
 * @property {(status: number | Error, message?: string, ...args: any[]) => HTTPError | void} error
 *
 * @property {(status: number, cond: boolean, message?: string, ...args: any[]) => void} assert
 *
 * @property {(k: string) => string | undefined} get
 * @property {(k: string, v: string | string[]) => Response} set
 * @property {(k: string, v: string) => Response} append
 * @property {(s: number) => Response} status
 * @property {(ct: string) => Response} type
 *
 * @property {(data: any) => Response} json
 * @property {(data: string) => Response} text
 *
 * @property {(name: string, value: string, opts?: object) => Response} cookie
 * @property {(name: string, opts?: object) => Response} clearCookie
 *
 * // HTTP asserts
 * @property {(cond: boolean, message?: string, ...args: any[]) => void} badRequest
 * @property {(cond: boolean, message?: string, ...args: any[]) => void} unauthorized
 * @property {(cond: boolean, message?: string, ...args: any[]) => void} forbidden
 * @property {(cond: boolean, message?: string, ...args: any[]) => void} notFound
 * @property {(cond: boolean, message?: string, ...args: any[]) => void} conflict
 * @property {(cond: boolean, message?: string, ...args: any[]) => void} gone
 * @property {(cond: boolean, message?: string, ...args: any[]) => void} badType
 */

/**
 * @typedef {import('http').ServerResponse
 *  & ResponseProps
 *  & ResponseContext
 * } Response
 */

const decorator = {

    /**
     * End the response.
     * @this {Response}
     * @param {string|Buffer} [body]
     * @returns {Promise<ResponseInfo>}
     */
    end(body){

        if(this.finished)
            this.input.log.warn({ err: new Error('Called `res.end()` after response was already finished') });

        body && this.write(body);
        this._realEnd();

        this.input.log.debug({
            ...this.reqInfo,
            status: this.statusCode,
            level: this.statusCode > 499 ? 'warn' : 'debug',
            type: 'response',
            msg: 'Sent ' + this.statusCode + ' response to ' + this.reqInfo.method + ' ' + this.reqInfo.path
        });

        this.finished = true;
        return this.resolve({
            status: this.statusCode,
            headers: this.headers,
            body: this
        });
    },

    /**
     * Handle an error response.
     * @this {Response}
     * @param {number|Error} statusOrError
     * @param {string} [message]
     * @param  {...any} args
     * @returns {HTTPError}
     */
    error(statusOrError, message, ...args){

        // If it's NOT a status, handle as an Error
        if(!Number.isInteger(statusOrError))
            return handleError(statusOrError, this.input);

        const httpErr = buildHTTPError(statusOrError, message, ...args);
        this.status(Number(statusOrError));
        httpErr.type && this.type(httpErr.type);
        this.end(httpErr.message);
        return httpErr;
    },

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
    },

    /**
     * Get a response header.
     * @param {string} k
     * @returns {string}
     */
    get(k){
        return this.headers[k.toLowerCase()];
    },

    /**
     * Set a response header.
     * @this {Response}
     * @param {string} k
     * @param {string} v
     * @returns {Response}
     */
    set(k, v){
        this.setHeader?.(k, v);
        this.headers[k.toLowerCase()] = v;
        return this;
    },

    /**
     * Append a value to a response header.
     * @this {Response}
     * @param {string} k
     * @param {string} v
     * @returns {Response}
     */
    append(k, v){
        const prev = this.headers[k.toLowerCase()];
        return this.set(k, !prev 
            ? v
            : Array.isArray(prev)
                ? prev.concat(v)
                : [ prev, v ]
        );
    },

    /**
     * Set the response status code.
     * @this {Response}
     * @param {number} s
     * @returns {Response}
     */
    status(s){
        this.statusCode = s;
        return this;
    },

    /**
     * Set the Content-Type header.
     * @this {Response}
     * @param {string} ct
     * @returns {Response}
     */
    type(ct){
        ct && this.set('Content-Type', SHORT_CONTENT_TYPES[ct] || ct);
        return this;
    },

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
    },

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
    },

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
    },

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
    },

    // Assert methods    

    /**
     * Assert a 400 Bad Request condition.
     * @param {boolean} cond
     * @param {string} [message]
     * @param  {...any} args
     */
    badRequest(cond, message, ...args) {
        return this.assert(ASSERTS.badRequest, cond, message, ...args);
    },

    /**
     * Assert a 401 Unauthorized condition.
     * @param {boolean} cond
     * @param {string} [message]
     * @param  {...any} args
     */
    unauthorized(cond, message, ...args) {
        return this.assert(ASSERTS.unauthorized, cond, message, ...args);
    },

    /**
     * Assert a 403 Forbidden condition.
     * @param {boolean} cond
     * @param {string} [message]
     * @param  {...any} args
     */
    forbidden(cond, message, ...args) {
        return this.assert(ASSERTS.forbidden, cond, message, ...args);
    },

    /**
     * Assert a 404 Not Found condition.
     * @param {boolean} cond
     * @param {string} [message]
     * @param  {...any} args
     */
    notFound(cond, message, ...args) {
        return this.assert(ASSERTS.notFound, cond, message, ...args);
    },

    /**
     * Assert a 409 Conflict condition.
     * @param {boolean} cond
     * @param {string} [message]
     * @param  {...any} args
     */
    conflict(cond, message, ...args) {
        return this.assert(ASSERTS.conflict, cond, message, ...args);
    },

    /**
     * Assert a 410 Gone condition.
     * @param {boolean} cond
     * @param {string} [message]
     * @param  {...any} args
     */
    gone(cond, message, ...args) {
        return this.assert(ASSERTS.gone, cond, message, ...args);
    },

    /**
     * Assert a 415 Bad Type condition.
     * @param {boolean} cond
     * @param {string} [message]
     * @param  {...any} args
     */
    badType(cond, message, ...args) {
        return this.assert(ASSERTS.badType, cond, message, ...args);
    }
};

/**
 * Decorate a ServerResponse object with additional methods.
 * @param {import('./api').PertialInputObject} input
 * @param {RequestInfo} reqInfo
 * @returns {Response}
 */
module.exports.getDecoratedRes = function (input, reqInfo) {
    const res = input.res;

    
    res.statusCode = 200;

    let resResolve, resReject;

    const endPromise = new Promise((resolve, reject) => {
        resResolve = resolve;
        resReject = reject;
    });

    const newRes = Object.assign(res, decorator, {
        headers: {},
        _realEnd: res.end,
        reqInfo,
        input,
        ended: endPromise,
        resolve: resResolve,
        reject: resReject
    });

    return newRes;
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
