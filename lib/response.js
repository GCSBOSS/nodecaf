
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

function error(status, message, ...args){
    if(typeof status !== 'number')
        return handleError(status, this.input);

    message = format(message, ...args);
    this.status(status).end(message);
    this.stackAborted = true;
    return getHTTPError(status, message);
}

function assert(status, cond, message, ...args){
    if(!cond)
        return true;
    throw this.error(status, message, ...args);
}

module.exports = {

    set(k, v){
        this.setHeader(k.toLowerCase(), v);
        return this;
    },

    status(s){
        this.statusCode = s;
        return this;
    },

    type(ct){
        this.set('content-type', SHORT_CONTENT_TYPES[ct] || ct);
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

    error

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
