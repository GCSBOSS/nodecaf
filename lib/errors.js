const createError = require('http-errors');

function composeError(type, status, msg){
    msg = msg || '';
    msg = typeof msg == 'object' ? JSON.stringify(msg) : String(msg);
    return createError(status, msg, { type: type });
}

module.exports = {
    NotFound: msg => composeError('NotFound', 404, msg),
    Unauthorized: msg => composeError('Unauthorized', 401, msg),
    ServerFault: msg => composeError('ServerFault', 500, msg),
    InvalidActionForState: msg => composeError('InvalidActionForState', 405, msg),
    InvalidCredentials: msg => composeError('InvalidCredentials', 400, msg),
    InvalidContent: msg => composeError('InvalidContent', 400, msg),
    BadRequest: msg => composeError('BadRequest', 400, msg),

    parse(err, msg){
        if(typeof this[err] == 'function')
            err = this[err](msg || err);
        return err;
    }
};
