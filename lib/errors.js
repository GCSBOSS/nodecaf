const createError = require('http-errors');

function composeError(type, status, msg){
    msg = msg || '';
    msg = typeof msg == 'object' ? JSON.stringify(msg) : String(msg);
    return createError(status, msg, { type: type, handled: true });
}

const ERRORS = {
    NotFound: 404,
    Unauthorized: 401,
    ServerFault: 500,
    InvalidActionForState: 405,
    InvalidCredentials: 400,
    InvalidContent: 400,
    BadRequest: 400
}

module.exports = new Proxy({}, {

    has(target, key){
        return key in ERRORS;
    },

    get(target, prop){
        return msg => composeError(prop, ERRORS[prop], msg);
    }
});
