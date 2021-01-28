const { sign } = require('cookie-signature');
const cookie = require('cookie');
const { format } = require('util');
const { HTTPError, handleError } = require('./error');

const SHORT_CONTENT_TYPES = {
    'text': 'text/plain',
    'json': 'application/json',
    'binary': 'application/octet-stream'
};

const ASSERTS = {
    badRequest: 400,
    unauthorized: 401,
    forbidden: 403,
    notFound: 404,
    conflict: 409,
    gone: 410,
    badType: 415
}

function assert(status, cond, message, ...args){
    if(!cond)
        return true;
    throw this.error(status, message, ...args);
}

module.exports = {

    get(k){
        return this.getHeader(k);
    },

    set(k, v){
        this.setHeader(k, v);
        return this;
    },

    append(k, v){
        let prev = this.get(k);
        prev && (v = Array.isArray(prev)
            ? prev.concat(v)
            : [ prev, v ]);
        return this.set(k, v);
    },

    status(s){
        this.statusCode = s;
        return this;
    },

    type(ct){
        this.set('Content-Type', SHORT_CONTENT_TYPES[ct] || ct);
        return this;
    },

    json(data){
        this.type('json');
        this.end(JSON.stringify(data));
        return this;
    },

    text(data){
        this.type('text');
        this.end(String(data));
        return this;
    },

    // Not necessarily an APP error, but a client Error
    error(status, message, ...args){

        // If it's NOT a status, handle as an Error
        if(!Number.isInteger(status))
            return handleError(status, this.input);

        this.status(status);
        let type = 'text';

        if(typeof message == 'string')
            message = format(message, ...args);
        else if(message instanceof Buffer)
            type = 'binary';
        else if(message && typeof message == 'object'){
            type = 'json';
            message = JSON.stringify(message);
        }
        else if(message == null)
            type = null;
        else
            message = String(message);

        type && this.type(type);
        this.end(message);

        this.stackAborted = true;
        return new HTTPError(status, message, type);
    },

    clearCookie(name, opts) {
        opts = { path: '/', ...opts, expires: new Date(1) };
        delete opts.maxAge;
        return this.cookie(name, '', opts);
    },

    cookie(name, value, opts = {}) {
        opts = { ...opts };
        opts.path = opts.path || '/';

        if(opts.signed && !this.cookieSecret)
            throw new Error('Trying to sign cookies when secret is not defined');

        value = String(value);

        if(opts.signed)
            value = 's:' + sign(value, this.cookieSecret);

        if('maxAge' in opts) {
            opts.expires = new Date(Date.now() + opts.maxAge);
            opts.maxAge /= 1000;
        }

        this.append('Set-Cookie', cookie.serialize(name, value, opts));

        return this;
    }

};

for(let name in ASSERTS)
    module.exports[name] = function(...args){
        assert.call(this, ASSERTS[name], ...args);
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
