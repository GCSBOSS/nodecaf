const assert = require('assert');
const querystring = require('querystring');
const { pathToRegexp } = require('path-to-regexp');

const { URL } = require('url');

const { execHandler, normalizeHandler, prepareHandling, handleCORS, handleError } = require('./handle');
const resMethods = require('./response');

const PRG_OPTS = { sensitive: true, strict: true };

function findDynamicRouteMatch(req, pool = []){
    for(let route of pool){
        let match = route.regexp.exec(req.path);
        if(match){
            route.params.forEach( (p, i) => req.params[p.name] = match[i + 1]);
            return route.handler;
        }
    }
}

const normalizePath = p => (p.slice(-1) == '/' ? p.slice(0, -1) : p) || '/';

function buildStack(chain){
    let nextHandler = null;
    return chain.reverse().map(h => {
        assert(typeof h == 'function',
            new TypeError('Invalid route option \'' + typeof h + '\''));
        h = normalizeHandler(h.bind(this.app));
        h.next = nextHandler;
        return nextHandler = h;
    }).reverse();
}

function routeRequest(router, req){
    let url = new URL(req.url, 'http://0.0.0.0');
    req.path = normalizePath(url.pathname);
    router.app.log.debug({ req });

    req.params = {};
    req.flash = {};
    req.query = querystring.parse(url.search.slice(1));

    let route = req.method + ' ' + req.path;
    return router.static[route] ||
        findDynamicRouteMatch(req, router.dynamic[req.method]);
}

module.exports = class Router {

    constructor(app){
        this.app = app;
        this.clear();
    }

    clear(){
        this.routes = {};
        this.static = {};
        this.dynamic = {};
    }

    addRoute(method, path, ...chain){

        let m = method.toUpperCase();
        let route = m + ' ' + path;

        let dup = !this.app._alwaysRebuildAPI && route in this.routes;
        assert(!dup, new Error('Route for \'' + route + '\' is already defined'));

        assert(chain.length > 0, new Error('Route is empty at \'' + path + '\''));
        let stack = buildStack.apply(this, [ chain ]);

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

    async handle(req, res){
        try{

            let handler = routeRequest(this, req);

            res.req = req;
            res.on('finish', () => this.app.log.debug({ res }));
            Object.assign(res, resMethods);

            if(req.method == 'OPTIONS')
                return handleCORS(this.app, req, res);

            if(!handler)
                return res.status(404).end();

            await prepareHandling(this.app, req, res);

            execHandler(this.app, handler, req, res);
        }
        catch(err) /* istanbul ignore next */ {
            handleError(err, res.input || { res, log: this.app.log });
            throw err;
        }
    }

}
