const assert = require('assert');
const { METHODS } = require('http');
const { pathToRegexp } = require('path-to-regexp');

const resMethods = require('./response');
const { handleError } = require('./error');

const PRG_OPTS = { sensitive: true, strict: true };

function normalizeHandler(func){
    if(func.constructor.name === 'AsyncFunction')
        return func;

    return input => new Promise((resolve, reject) => {
        try{ func(input); resolve(); }
        catch(err){ reject(err); }
    });
}

function buildStack(context, chain){
    let nextHandler = null;
    return chain.reverse().map(h => {
        assert(typeof h == 'function',
            new TypeError('Invalid route option \'' + typeof h + '\''));
        h = normalizeHandler(h.bind(context));
        h.next = nextHandler;
        return nextHandler = h;
    }).reverse();
}

function matchRoute(method, path, params){
    // this => API
    let route = method + ' ' + path;
    if(route in this.static)
        return this.static[route];

    if(this.dynamic[method])
        for(let r of this.dynamic[method]){
            let match = r.regexp.exec(path);
            if(match){
                r.params.forEach( (p, i) => params[p.name] = match[i + 1]);
                return r.handler;
            }
        }

    return false;
}

function runHandler(input, handler){

    if(input.res.stackAborted)
        return;

    input.next = handler.next
        ? () => runHandler(input, handler.next)
        : () => input.log.warn({ type: 'route' }, 'next() called after stack already came to an end');

    handler(input).catch(err => handleError(err, input));
}

function generateResponseObject(method, url){

    return {
        headers: {},
        req: { url, method },
        statusCode: 200,
        end(body){
            let output = { status: this.statusCode, headers: this.headers };
            if(body)
                output.body = body;
            this.input.log.debug({ res: this });
            this.finished = true;
            return this.routeEnded(output);
        },

        getHeader(key){
            return this.headers[key]
        },

        setHeader(key, value){
            this.headers[key] = value;
        }

    };

}

module.exports = class API {

    constructor(context, spec){
        this.routes = {};
        this.static = {};
        this.dynamic = {};
        this.context = context;

        // Generate HTTP verb shortcut route methods
        let proxy = METHODS.reduce( (o, m) =>
            ({ ...o, [m.toLowerCase()]: this.addEndpoint.bind(this, m.toLowerCase()) }), {});

        // Needed because it's not possible to call a function called 'delete'
        proxy.del = this.addEndpoint.bind(this, 'delete');

        spec.apply(context, [ proxy ]);
    }

    addEndpoint(method, path, ...chain){

        let m = method.toUpperCase();
        let route = m + ' ' + path;

        let dup = route in this.routes;
        assert(!dup, new Error('Route for \'' + route + '\' is already defined'));

        assert(chain.length > 0, new Error('Route is empty at \'' + path + '\''));
        let stack = buildStack(this.context, chain);

        stack.slice(-1)[0].tail = true;

        this.routes[route] = true;

        if(path.indexOf(':') < 0)
            return this.static[route] = stack[0];

        let params = [];
        this.dynamic[m] = this.dynamic[m] || [];
        this.dynamic[m].push({
            regexp: pathToRegexp(path, params, PRG_OPTS),
            handler: stack[0],
            params
        });
    }

    trigger(method, path, input){
        method = method.toUpperCase();
        let params = {};

        let app = this.context;
        app.log.debug({ type: 'request' }, 'Received %s request for %s', method, path);

        let handler = matchRoute.apply(this, [ method, path, params ]);

        let res = generateResponseObject(method, path);

        input = {
            ...app.global, conf: app.conf, res, flash: {},
            headers: {}, query: {}, ...input, params, log: app.log
        };

        Object.assign(input.res, resMethods);

        input.res.input = input;

        let masterPromise = new Promise(resolve => {
            input.res.routeEnded = resolve;
        });

        if(!handler)
            input.res.status(404).end();
        else
            runHandler(input, handler);

        return masterPromise;
    }

}
