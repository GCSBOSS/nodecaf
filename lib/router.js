const pathToRegexp = require('path-to-regexp');

const { URL } = require('url');

const { execHandler, normalizeHandler } = require('./handle');

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
        this.routes[route] = true;

        for(let o of opts){

            // TODO accepts
            // TODO parsers
            // TODO filterss

            if(typeof o == 'function'){
                let h = normalizeHandler(o);
                stack.length > 0 && (stack[stack.length - 1].next = h);
                stack.push(h);
            }
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
            this.static[route] = stack[0];
    }

    handle(req, res){

        let url = new URL(req.url, 'http://0.0.0.0');

        let reqPath = (url.pathname.slice(-1) == '/'
            ? url.pathname.slice(0, -1) : url.pathname) || '/';

        this.app.log.req(req);
        res.on('finish', () => this.app.log.res(res, req));

        let route = req.method + ' ' + reqPath;

        res.status = s => {
            res.statusCode = s;
            return res;
        };

        req.params = {};
        req.flash = {};

        // TODO check how query string is handled

        let handler = false;

        req.hasBody = Boolean(req.headers['content-length']);

        // TODO parse body if needed

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
            return res.status(404).end();


        execHandler(this.app, handler, req, res);


        // TODO errors module

        res.end(); // TODO remove this
    }

}
