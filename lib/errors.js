
const errors = require('restify-errors');

/*                                                                            o\
    Handle error and exceptions generated on the routes in order to properly
    transform them in well formed REST output.
\o                                                                            */
module.exports = function handleError(errClass, errMessage){

    // Handle RestifyErrors sent on the callback.
    if(typeof errors[errClass + 'Error'] == 'function')
        return this.send(new errors[errClass + 'Error'](errMessage));

    // Handle none-Error objects thrown.
    if(! (errClass instanceof Error) )
        return this.send(new errors.InternalServerError());

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
        this.send(new assertErrors[name](msg));

    // Handle unknown Exceptions.
    else
        this.send(new errors.InternalServerError(msg));
}
