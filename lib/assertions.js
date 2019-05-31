const { format } = require('util');

const errors = require('restify-errors');

function assert(err, condition, msg, ...args){
    if(condition)
        return true;

    let handler = typeof args[0] == 'function' ? args.shift() : false;
    let e = new errors[err](format(msg, ...args));

    if(handler)
        return handler(e); 

    throw e;
}

module.exports = {
    valid: (...args) => assert('InvalidContentError', ...args),
    authorized: (...args) => assert('UnauthorizedError', ...args),
    authn: (...args) => assert('InvalidCredentialsError', ...args),
    exist: (...args) => assert('NotFoundError', ...args),
    able: (...args) => assert('MethodNotAllowedError', ...args)
};
