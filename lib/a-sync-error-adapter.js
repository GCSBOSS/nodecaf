
// Function wrapper to handle sync/async errors.
module.exports = (func, onError) => function(...args){

    // Handle errors and pass arguments to Async functions.
    if(func.constructor.name === 'AsyncFunction')
        return func(...args).catch(err => onError(err, ...args));

    // Handle errors and pass arguments to Regular functions.
    try{ func(...args) }
    catch(err){ onError(err, ...args); }
};
