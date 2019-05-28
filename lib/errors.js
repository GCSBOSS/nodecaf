
const errors = require('restify-errors');

/*                                                                            o\
    Handle error and exceptions generated on the routes in order to properly
    transform them in well formed REST output.
\o                                                                            */
module.exports = function handleError(req, res, err){
    // Consider tapped in error value if sent instead of the actual error.
    let errClass = req.errClass || err;
    let errMessage = req.errMessage;
    
    // Handle RestifyErrors sent on the callback.
    if(typeof errors[errClass + 'Error'] == 'function')
        return res.send(new errors[errClass + 'Error'](errMessage));

    // Handle none-Error objects thrown.
    if(! (errClass instanceof Error) )
        return res.send(new errors.InternalServerError());

    let name = errClass.constructor.name;
    let msg = errClass.message;

    let assertErrors = {
        AssertValidError: errors.InvalidContentError,
        AssertAuthorizedError: errors.UnauthorizedError,
        AssertAuthnError: errors.InvalidArgumentError,
        AssertExistError: errors.NotFoundError,
        AssertAbleError: errors.MethodNotAllowedError
    };

    // Handle Rest Assert errors.
    if(name in assertErrors)
        return res.send(new assertErrors[name](msg));

    // Handle unknown Exceptions.
    res.send(new errors.InternalServerError(msg));
}
