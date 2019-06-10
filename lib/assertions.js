const { format } = require('util');

const errors = require('./errors');

function assert(err, condition, msg, ...args){
    if(condition)
        return true;

    let handler = typeof args[0] == 'function' ? args.shift() : false;
    let e = errors[err](format(msg, ...args));

    if(handler)
        return handler(e);

    throw e;
}

module.exports = {
    valid: (...args) => assert('InvalidContent', ...args),
    authorized: (...args) => assert('Unauthorized', ...args),
    authn: (...args) => assert('InvalidCredentials', ...args),
    exist: (...args) => assert('NotFound', ...args),
    able: (...args) => assert('InvalidActionForState', ...args)
};
