const assert = require('assert');
const { METHODS } = require('http');
const cookieSignature = require('cookie-signature');

const resMethods = require('./response');
const { handleError } = require('./error');
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

        if(seg[0] == '('){
            regexp += seg;
            r.params.push('path');
            return;
        }

        regexp += '\\/' + seg;
    });

    r.regexp = new RegExp(regexp);
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
                r.params.forEach( (p, i) => params[p] = match[i + 1]);
                return r.handler;
            }
        }

    return false;
}

function runHandler(input, handler, done){

    if(input.res.stackAborted)
        return;

    input.next = handler.next
        ? () => runHandler(input, handler.next, done)
        : () => done();

    handler(input).catch(err => handleError(err, input));
}

function generateResponseObject(method, url, req){

    return {
        headers: {},
        req,
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

function generateRequestObject(method, path, input){
    let obj = { method, path };
    input.headers && Object.assign(obj, input.headers);
    return obj;
}

function parseSignedCookies(cconf, input){
    for(let key in input.cookies)
        // TODO 's:' needed??
        if(input.cookies[key].substr(0, 2) == 's:'){
            let val = cookieSignature.unsign(input.cookies[key].substr(2), cconf.secret);
            if(val){
                input.signedCookies[key] = val;
                delete input.cookies[key];
            }
        }
}

function fork(input, func){
    // this => app
    return new Promise((resolve, reject) => {
        func = normalizeHandler(func.bind(this));
        func({ ...input, next: resolve }).catch(reject);
    });
}

function buildHook(hookName, ...chain){
    let stack = buildStack(this.context, chain);
    this[hookName] = stack[0];
    stack.slice(-1)[0].tail = true;
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

        proxy.all = (...chain) => METHODS.forEach(m =>
            this.addEndpoint(m.toLowerCase(), '(.*)', ...chain));

        proxy.pre = buildHook.bind(this, 'preHook');
        proxy.pos = buildHook.bind(this, 'posHook');

        spec.call(context, proxy);
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

        if(path.indexOf('/:') < 0 && path.indexOf('*') < 0)
            return this.static[route] = stack[0];

        this.dynamic[m] = this.dynamic[m] || [];
        let { regexp, params } = pathToRegexp(path);
        this.dynamic[m].push({ regexp, handler: stack[0], params });
    }

    async trigger(method, path, input = {}){
        method = method.toUpperCase();
        let params = {};

        let app = this.context;

        input = {
            ...app.global, conf: app.conf, flash: {}, cookies: {}, headers: {},
            query: {}, ...input, params, log: app.log, signedCookies: {}
        };
        input.fork = fork.bind(app, input);

        let req = input.req = input.req || generateRequestObject(method, path, input);
        let res = input.res = input.res || generateResponseObject(method, path, req);
        res.req = req;
        res.input = input;
        Object.assign(res, resMethods);

        app.log.debug({ req });

        req.body = input.body = new RequestBody(input);
        if(app._shouldParseBody)
            input.body = await input.body.parse();

        let handler = matchRoute.call(this, method, path, params);

        if(app.conf.cookie)
            res.cookieSecret = app.conf.cookie.secret;
        parseSignedCookies(app.conf.cookie, input);

        let masterPromise = new Promise(done => { res.routeEnded = done });

        if(!handler){
            res.status(404).end();
            return masterPromise;
        }

        this.preHook && await new Promise(done => runHandler(input, this.preHook, done));

        let warn = () => app.log.warn({ type: 'route' },
            'next() was called when the chain is finished');

        runHandler(input, handler, this.posHook
            ? () => runHandler(input, this.posHook, warn) : warn);

        return masterPromise;
    }

}
