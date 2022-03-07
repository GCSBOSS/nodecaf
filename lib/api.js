const assert = require('assert');
const { METHODS } = require('http');
const cookieSignature = require('cookie-signature');

const { handleError } = require('./error');
const Response = require('./response');
const RequestBody = require('./body');

function pathToRegexp(path){
    let r = { params: [] };
    let regexp = '';

    path.split('/').forEach(seg => {
        if(!seg)
            return;

        if(seg[0] == ':'){
            r.params.push(seg.substr(1));
            regexp += '\\/([\\w\\d\\-\\._~]+)';
            return;
        }

        regexp += '\\/' + seg;
    });

    r.regexp = new RegExp('^' + regexp + '$');
    return r;
}

function normalizeHandler(func){
    if(func.constructor.name === 'AsyncFunction')
        return func;

    return input => new Promise((resolve, reject) => {
        try{ func(input); resolve(); }
        catch(err){ reject(err); }
    });
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
                r.params.forEach( (p, i) => params[p] = match[i + 1]);
                return r.handler;
            }
        }

    return  this.fallbackRoute ?? false;
}

function parseSignedCookies(cconf, input){
    if(!cconf?.secret)
        return;

    for(let key in input.cookies){
        var val = cookieSignature.unsign(input.cookies[key], cconf?.secret);
        if(val){
            input.signedCookies[key] = val;
            delete input.cookies[key];
        }
    }
}

module.exports = class API {

    constructor(context, spec){
        this.routes = {};
        this.static = {};
        this.dynamic = {};
        this.context = context;
        this.fallbackRoute = null;

        // Generate HTTP verb shortcut route methods
        let proxy = METHODS.reduce( (o, m) =>
            ({ ...o, [m.toLowerCase()]: this.addEndpoint.bind(this, m.toLowerCase()) }), {});

        // Needed because it's not possible to call a function called 'delete'
        proxy.del = this.addEndpoint.bind(this, 'delete');

        proxy.all = handler => {
            assert(!this.fallbackRoute, new Error('Route for \'ALL\' is already defined'));
            assert(typeof handler == 'function',
                new TypeError(`'ALL' handler must be a function. Found '${typeof handler}'`));

            this.fallbackRoute = normalizeHandler(handler.bind(this.context));
        };

        spec.call(context, proxy);
    }

    addEndpoint(method, path, handler){

        let m = method.toUpperCase();
        let route = m + ' ' + path;

        let dup = route in this.routes;
        assert(!dup, new Error('Route for \'' + route + '\' is already defined'));

        assert(typeof handler == 'function',
            new TypeError(`'${route}' handler must be a function. Found '${typeof handler}'`));

        const nmHandler = normalizeHandler(handler.bind(this.context));

        this.routes[route] = true;

        if(path.indexOf('/:') < 0 && path.indexOf('*') < 0)
            return this.static[route] = nmHandler;

        this.dynamic[m] = this.dynamic[m] || [];
        let { regexp, params } = pathToRegexp(path);
        this.dynamic[m].push({ regexp, handler: nmHandler, params });
    }

    async trigger(method, path, input = {}){
        method = method.toUpperCase();
        const params = {};

        const app = this.context;

        input = {
            ...app.global, conf: app.conf, cookies: {}, headers: {},
            query: {}, ...input, params, log: app.log, signedCookies: {}, method,
            path
        };

        input.call = (fn, ...args) => fn.call(app, input, ...args);

        let origReq = input.req;
        delete input.req;

        app.log.debug({
            method, path,
            host: origReq?.host ?? input.headers.host,
            agent: origReq?.['user-agent'] ?? input.headers['user-agent'],
            type: 'request',
            msg: 'Received ' + method + ' request to ' + path
        });

        let res = input.res = new Response(input);

        const handler = matchRoute.call(this, method, path, params);

        if(!handler){
            res.status(404).end();
            return res.ended;
        }

        input.body = new RequestBody(input, origReq);
        if(app._autoParseBody)
            try{
                input.body = await input.body.parse();
            }
            catch(err){
                res.status(400).end();
                app.log.warn({ req: res.req, err, type: 'request' });
                return res.ended;
            }

        parseSignedCookies(app.conf.cookie, input);

        handler(input).catch(err => handleError(err, input));

        return res.ended;
    }

}
