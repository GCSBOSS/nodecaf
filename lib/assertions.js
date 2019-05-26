const { format } = require('util');

class AppAssertError extends Error {
    constructor(...args){
        super(format(...args));
    }
}

class AssertValidError extends AppAssertError {}
class AssertAuthorizedError extends AppAssertError {}
class AssertAuthnError extends AppAssertError {}
class AssertExistError extends AppAssertError {}
class AssertAbleError extends AppAssertError {}

function assert(errClass, condition, errMessage, ...args){
    if(!condition)
        throw new errClass(errMessage, ...args);
}

module.exports = {

    valid: (...args) =>
        assert(AssertValidError, ...args),

    authorized: (...args) =>
        assert(AssertAuthorizedError, ...args),

    authn: (...args) =>
        assert(AssertAuthnError, ...args),

    exist: (...args) =>
        assert(AssertExistError, ...args),

    able: (...args) =>
        assert(AssertAbleError, ...args)

};
