const { format } = require('util');

function getHTTPError(status, message, handled){
    let e = new Error(message);
    e.status = status;
    e.handled = handled;
    return e;
}

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

    message = format(message, ...args);
    this.status(status).end(message);
    throw getHTTPError(status, message, true);
}

module.exports.asserts = {}

for(let name in ASSERTS)
    module.exports.asserts[name] = function(...args){
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
