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

module.exports = class API {

    constructor(context, spec){
        this.routes = {};
        this.static = {};
        this.dynamic = {};
        this.context = context;
        this.fallbackRoute = null;

        spec?.forEach(r => r.all
            ? this.setFallbackRoute(r.handler)
            : this.addEndpoint(r.method.toLowerCase(), r.path, r.handler));
    }

    setFallbackRoute(handler){
        if(this.fallbackRoute)
            throw new Error('Route for \'ALL\' is already defined');
        if(typeof handler != 'function')
            throw new TypeError(`'ALL' handler must be a function. Found '${typeof handler}'`);

        this.fallbackRoute = handler.bind(this.context);
    }

    addEndpoint(method, path, handler){

        const m = method.toUpperCase();
        const route = m + ' ' + path;

        const dup = route in this.routes;
        if(dup)
            throw new Error('Route for \'' + route + '\' is already defined');

        if(typeof handler != 'function')
            throw new TypeError(`'${route}' handler must be a function. Found '${typeof handler}'`);

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

        input = {
            conf: app.conf, cookies: {}, headers: {}, query: {},
            ...input, params, log: app.log, method, path
        };

        input.ip = input.headers.forwarded ?? input.headers['x-forwarded-for']
            ?? input.body?.socket?.remoteAddress ?? '::1';

        input.call = (fn, ...args) => fn.call(app, { ...app.global, ...input }, ...args);
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

        cors(app.conf.cors, method, input.headers, res);
        if(res.finished)
            return Promise.resolve(res);

        const handler = matchRoute.call(this, method, path, params);

        try{
            res.notFound(!handler);

            input.body = getDecoratedBody(input, app);
            if(app._autoParseBody && !input.websocket)
                input.body = await input.body.parse();

            await handler({ ...app.global, ...input });
        }
        catch(err){
            handleError(err, input);
        }

        return res.ended;
    }

}
