const { sign } = require('cookie-signature');
const cookie = require('cookie');
const { format } = require('util');
const { handleError } = require('./handle');
const getHTTPError = require('./error');

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
    gone: 410
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

    error(status, message, ...args){
        if(typeof status !== 'number')
            return handleError(status, this.input);

        if(typeof message == 'string')
            message = format(message, ...args);
        else if(typeof message != 'undefined' && message !== null){
            message = JSON.stringify(message);
            this.type('json');
        }

        this.status(status).end(message);
        this.stackAborted = true;
        return getHTTPError(status, message);
    },

    clearCookie(name, opts) {
        opts = { path: '/', ...opts, expires: new Date(1) };
        delete opts.maxAge;
        return this.cookie(name, '', opts);
    },

    cookie(name, value, opts = {}) {
        opts.path = opts.path || '/';

        if(opts.signed && !this.req.secret)
            throw new Error('Trying to sign cookies when secret is not defined');

        value = String(value);

        if(opts.signed)
            value = 's:' + sign(value, this.req.secret);

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
        assert.apply(this, [ ASSERTS[name], ...args ]);
    }


// TODO 406 notAcceptable:
// TODO 405 methodNotAllowed()
// TODO 408 Request Timeout
// TODO 411 Length Required
// TODO 413 Payload Too Large
// TODO 414 Request-URI Too Long
// todo 415 Unsupported Media Type
// TODO for WS: 426 Upgrade Required
// TODO 429 Too Many Requests
// TODO 431 Request Header Fields Too Large
