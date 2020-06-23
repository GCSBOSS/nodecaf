const querystring = require('querystring');
const { pathToRegexp } = require('path-to-regexp');

const { URL } = require('url');

const { execHandler, normalizeHandler, prepareHandling, handleCORS, handleError } = require('./handle');
const resMethods = require('./response');

const PRG_OPTS = { sensitive: true, strict: true };

module.exports = class Router {

    constructor(app){
        this.routes = {};
        this.static = {};
        this.dynamic = {};
        this.app = app;
    }

    addRoute(method, path, ...opts){

        let stack = [];
        let m = method.toUpperCase();
        let route = m + ' ' + path;

        if(route in this.routes)
            throw new Error('Route for \'' + route + '\' is already defined');

        for(let o of opts)
            if(typeof o == 'function'){
                let h = normalizeHandler(o.bind(this.app));
                stack.length > 0 && (stack[stack.length - 1].next = h);
                stack.push(h);
            }
            else
                throw new TypeError('Invalid route option \'' + typeof o + '\'');

        if(stack.length == 0)
            throw new Error('Route is empty at \'' + path + '\'');

        stack.slice(-1)[0].tail = true;

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
            this.static[route] = stack[0];

        this.routes[route] = true;
    }

    async handle(req, res){
        try{
            let url = new URL(req.url, 'http://0.0.0.0');

            let reqPath = (url.pathname.slice(-1) == '/'
                ? url.pathname.slice(0, -1) : url.pathname) || '/';

            res.req = req;

            this.app.log.debug({ req });
            res.on('finish', () => this.app.log.debug({ res }));

            let route = req.method + ' ' + reqPath;

            Object.assign(res, resMethods);

            req.params = {};
            req.flash = {};
            req.query = querystring.parse(url.search.slice(1));

            let handler = false;

            if(req.method == 'OPTIONS')
                return handleCORS(this.app, req, res);

            if(route in this.static)
                handler = this.static[route];
            else if(req.method in this.dynamic)
                for(let route of this.dynamic[req.method]){
                    let match = route.regexp.exec(reqPath);
                    if(match){
                        route.params.forEach( (p, i) => req.params[p.name] = match[i + 1]);
                        handler = route.handler;
                        break;
                    }
                }

            if(!handler)
                res.status(404).end();

            await  prepareHandling(this.app, req, res);

            execHandler(this.app, handler, req, res);
        }
        catch(err) /* istanbul ignore next */ {
            handleError(err, res.input || { res, log: this.app.log });
            throw err;
        }
    }

}
