const assert = require('assert');
const METHODS = [
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'HEAD',
    'OPTIONS'
];
const cookieSignature = require('cookie-signature');

const { handleError } = require('./error');
const { getDecoratedRes } = require('./response');
const { getDecoratedBody } = require('./body');
const { cors } = require('./cors');

function pathToRegexp(path){
    const r = { params: [] };
    let regexp = '';

    path.split('/').forEach(seg => {
        if(!seg)
            return;

        if(seg[0] == ':'){
            r.params.push(seg.substr(1));
            regexp += '\\/([\\%\\w\\d\\-\\._~]+)';
            return;
        }

        regexp += '\\/' + seg;
    });

    r.regexp = new RegExp('^' + regexp + '$');
    return r;
}

function matchRoute(method, path, params){
    // this => API

    const route = method + ' ' + path;
    if(route in this.static)
        return this.static[route];

    if(this.dynamic[method])
        for(const r of this.dynamic[method]){
            const match = r.regexp.exec(path);
            if(match){
                r.params.forEach( (p, i) => params[p] = decodeURIComponent(match[i + 1]));
                return r.handler;
            }
        }

    return  this.fallbackRoute ?? false;
}

function parseSignedCookies(cconf, input){
    if(!cconf?.secret)
        return;

    for(const key in input.cookies){
        const val = cookieSignature.unsign(input.cookies[key], cconf?.secret);
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
        const proxy = METHODS.reduce( (o, m) =>
            ({ ...o, [m.toLowerCase()]: this.addEndpoint.bind(this, m.toLowerCase()) }), {});

        // Needed because it's not possible to call a function called 'delete'
        proxy.del = this.addEndpoint.bind(this, 'delete');

        proxy.all = handler => this.setFallbackRoute(handler);

        if(spec)
            this.context.log.warn('`api` is deprecated. This option will be dropped on `v0.14.0`. Use `routes` instead.');

        spec?.call(context, proxy);
    }

    setFallbackRoute(handler){
        assert(!this.fallbackRoute, new Error('Route for \'ALL\' is already defined'));
        assert(typeof handler == 'function',
            new TypeError(`'ALL' handler must be a function. Found '${typeof handler}'`));

        this.fallbackRoute = handler.bind(this.context);
    }

    addEndpoint(method, path, handler){

        const m = method.toUpperCase();
        const route = m + ' ' + path;

        const dup = route in this.routes;
        assert(!dup, new Error('Route for \'' + route + '\' is already defined'));

        assert(typeof handler == 'function',
            new TypeError(`'${route}' handler must be a function. Found '${typeof handler}'`));

        const nmHandler = handler.bind(this.context);

        this.routes[route] = true;

        if(path.indexOf('/:') < 0 && path.indexOf('*') < 0)
            return this.static[route] = nmHandler;

        this.dynamic[m] = this.dynamic[m] || [];
        const { regexp, params } = pathToRegexp(path);
        this.dynamic[m].push({ regexp, handler: nmHandler, params });
    }

    async trigger(method, path, input){
        method = method.toUpperCase();
        const params = {};

        const app = this.context;

        const signedCookies = {};
        const signedCookiesProxy = new Proxy(signedCookies, {
            get(target, p){
                app.log.warn('`signedCookies` is deprecated. This option will be dropped on `v0.14.0`. Signed cookies must be handled manually instead.');
                return target[p];
            }
        });

        input = {
            ...app.global, conf: app.conf, cookies: {}, headers: {}, query: {},
            ...input, params, log: app.log, signedCookies: signedCookiesProxy, method, path
        };

        input.ip = input.headers.forwarded ?? input.headers['x-forwarded-for']
            ?? input.body?.socket?.remoteAddress ?? '::1';

        input.call = (fn, ...args) => fn.call(app, input, ...args);
        input.keep = (k, v) => input[k] = v;

        const reqInfo = {
            method, path,
            host: input.headers?.host,
            agent: input.headers?.['user-agent'],
            type: 'request',
            msg: 'Received ' + method + ' request to ' + path
        };

        app.log.debug(reqInfo);

        const res = input.res = getDecoratedRes(input, reqInfo);

        const handler = matchRoute.call(this, method, path, params);

        cors(app.conf.cors, method, input.headers, res);
        if(res.finished)
            return Promise.resolve(res);

        try{
            res.notFound(!handler);

            input.body = getDecoratedBody(input);
            if(app._autoParseBody && !input.websocket)
                input.body = await input.body.parse();

            parseSignedCookies(app.conf.cookie, input);

            await handler(input);
        }
        catch(err){
            handleError(err, input);
        }

        return res.ended;
    }

}
