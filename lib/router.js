
// Function wrapper to handle sync/async errors.
const normalizeFn = func => function(onError, ...args){

    // Handle errors and pass arguments to Async functions.
    if(func.constructor.name === 'AsyncFunction')
        return func(...args).catch(err => onError(err));

    // Handle errors and pass arguments to Regular functions.
    try{ func(...args) }
    catch(err){ onError(err); }
};

// TODO create 'next()'

function wrapHandler(handler){
    // TODO normalize async/sync
    // TODO add input args

    return handler;
}



const pathToRegexp = require('path-to-regexp');
const PRG_OPTS = { sensitive: true, strict: true };

module.exports = class Router {

    constructor(){
        this.routes = {}
        this.static = {}
        this.dynamic = {}
    }

    addRoute(method, path, ...opts){

        let stack = [];
        let m = method.toUpperCase();
        let route = m + ' ' + path;

        if(route in this.routes)
            throw new Error('Route for \'' + route + '\' is already defined');
        this.routes[route] = true;

        for(let o of opts){

            // TODO accepts
            // TODO parsers
            // TODO filters
            // TODO generate each next

            if(typeof o == 'function')
                stack.push(wrapHandler(o));
            else
                throw new TypeError('Invalid route option \'' + typeof o + '\'');
        }

        if(stack.length == 0)
            throw new Error('Route is empty at \'' + path + '\'');

        if(path.indexOf(':') >= 0){
            let params = [];

            this.dynamic[m] = this.dynamic[m] || [];
            this.dynamic[m].push({
                regexp: pathToRegexp(path, params, PRG_OPTS),
                handler: stack[0],
                params
            });
        }
        else
            this.static[r] = stack[0];
    }

    route(req){

    }

}
