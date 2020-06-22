
module.exports = function getHTTPError(status, message){
    let e = new Error(message);
    e.status = status;
    return e;
};
