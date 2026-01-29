const { handleError, buildHTTPError } = require('./error');
const { Response } = require('./response');
const { Body } = require('./body');
const { cors } = require('./cors');

/**
 * @typedef RequestInfo
 * @property {string} method
 * @property {string} path
 * @property {string} host
 * @property {string} agent
 * @property {string} type
 * @property {string} msg
 */

/**
 * @typedef BaseInputObject
 * @property {object} conf Configuration object
 * @property {object} cookies Parsed cookies
 * @property {object} headers Request headers
 * @property {object} query Parsed query parameters
 * @property {object} params Route parameters
 * @property {string} method HTTP method
 * @property {string} path HTTP path
 * @property {string} ip Client IP address
 * @property {import('./logger').Logger} log Logger instance
 * @property {import('./response').Response} res HTTP response object
 * @property {import('./body').Body} body Request body parser or data
 * @property {() => Promise<any>} [websocket] Whether the request is a WebSocket upgrade
 * @property {(fn: Function, ...args: any[]) => any} call Call a function with the current context
 */

/**
 * @typedef {Partial<BaseInputObject> & { 
 *      reqStream: ReadableStream,
 *      resStream: WritableStream,
 *      resHandles: import('./native').NativeResponseHandles 
 * }} PertialInputObject
 */

/**
 * @typedef APITriggerInput
 * @property {ReadableStream} reqStream
 * @property {WritableStream} resStream
 * @property {import('./native').NativeResponseHandles} [resHandles]
 * @property {object} headers
 * @property {object} query
 * @property {object} cookies
 * @property {string} [ip]
 * @property {() => Promise<WebSocket>} [websocket]
 */

/**
 * @typedef { BaseInputObject & { [globalKey: string]: unknown } } RouteHandlerArgs
 */

/**
 * @typedef DynamicRouteSpec
 * @property {RegExp} regexp
 * @property {RouteHandler} [handler]
 * @property {string[]} params
 */

/**
 * @typedef {(args: BaseInputObject) => Promise<void>|void} RouteHandler
 */

/**
 * Converts a path string to a RegExp and extracts parameter names
 * @param {string} path The path string
 * @returns {DynamicRouteSpec} The RegExp and parameter names 
 */
function pathToRegexp(path){

    /** @type {DynamicRouteSpec} */
    const r = { params: [], regexp: null };
    let regexp = '';

    path.split('/').forEach(seg => {
        if(!seg)
            return;

        if(seg[0] == ':'){
            r.params.push(seg.slice(1));
            regexp += '\\/([\\%\\w\\d\\-\\._~]+)';
            return;
        }

        regexp += '\\/' + seg;
    });

    r.regexp = new RegExp('^' + regexp + '$');
    return r;
}

/**
 * @typedef RouteSpec
 * @property {string} method HTTP method
 * @property {string} path HTTP path
 * @property {RouteHandler} handler Route handler
 * @property {boolean} [all] Whether this is a fallback route for all methods
 */

/**
 * @typedef {{ [param: string]: string }} ParamsObject
 */

/**
 * @typedef APIContext
 * @property {object} conf Configuration object
 * @property {import('./logger').Logger} log Logger instance
 * @property {number} reqBodyTimeout Request body parse timeout in milliseconds
 * @property {boolean} autoParseBody Whether to auto-parse request bodies
 * @property {object} global Global context object
 */

class API {

    /** @type {{ [method: string]: DynamicRouteSpec[] }} */
    #_dynamic;

    /** @type {{ [route: string]: RouteHandler }} */
    #_static;

    /** @type {APIContext} */
    #_context;

    /** @type {RouteHandler|null} */
    #_fallbackRoute;

    /** @type {{ [route: string]: boolean }} */
    #_routeIndex;

    /**
     * @param {APIContext} context The API context
     * @param {RouteSpec[]} [spec] The API specification
     */
    constructor(context, spec){
        this.#_routeIndex = {};
        this.#_static = {};
        this.#_dynamic = {};
        this.#_context = context;
        this.#_fallbackRoute = null;

        spec?.forEach(r => r.all
            ? this.setFallbackRoute(r.handler)
            : this.addEndpoint(r.method.toLowerCase(), r.path, r.handler));
    }

    setFallbackRoute(handler){
        if(this.#_fallbackRoute)
            throw new Error('Route for \'ALL\' is already defined');
        if(typeof handler != 'function')
            throw new TypeError(`'ALL' handler must be a function. Found '${typeof handler}'`);

        this.#_fallbackRoute = handler.bind(this.#_context);
    }

    /**
     * Adds an endpoint to the API
     * @param {string} method HTTP method
     * @param {string} path HTTP path
     * @param {Function} handler Route handler
     */
    addEndpoint(method, path, handler){

        const m = method.toUpperCase();
        const route = m + ' ' + path;

        const dup = route in this.#_routeIndex;
        if(dup)
            throw new Error('Route for \'' + route + '\' is already defined');

        if(typeof handler != 'function')
            throw new TypeError(`'${route}' handler must be a function. Found '${typeof handler}'`);

        const nmHandler = handler.bind(this.#_context);

        this.#_routeIndex[route] = true;

        if(path.indexOf('/:') < 0 && path.indexOf('*') < 0)
            return this.#_static[route] = nmHandler;

        this.#_dynamic[m] = this.#_dynamic[m] || [];
        const { regexp, params } = pathToRegexp(path);
        this.#_dynamic[m].push({ regexp, handler: nmHandler, params });
    }

    /**
     * Triggers a route handler
     * @param {string} method HTTP method
     * @param {string} path HTTP path
     * @param {APITriggerInput} input Input object
     * @returns {Promise<import('./response').ResponseInfo>} The response object
     */
    async trigger(method, path, input){
        method = method.toUpperCase();

        const ctx = this.#_context;

        /** @type {RouteHandlerArgs} */
        const args = {
            ...ctx.global,
            websocket: input.websocket,
            conf: ctx.conf, 
            cookies: input.cookies ?? {}, 
            headers: input.headers ?? {}, 
            query: input.query ?? {}, 
            log: ctx.log, 
            method, 
            path,
            ip: input.headers.forwarded 
                ?? input.headers['x-forwarded-for']
                ?? input.ip 
                ?? '::1',
            call: (fn, ...fargs) => fn.call(ctx, { ...args, ...ctx.global }, ...fargs)
        };

        
        const reqInfo = {
            method, path,
            host: input.headers?.host,
            agent: input.headers?.['user-agent'],
            type: 'request',
            msg: 'Received ' + method + ' request to ' + path
        };

        ctx.log.debug(reqInfo);

        /** @type {Response} */
        const res = args.res = new Response({
            resStream: input.resStream,
            resHandles: input.resHandles,
        });

        res.ended.then(resInfo => {
            ctx.log.debug({
                ...reqInfo,
                status: resInfo.status,
                level: resInfo.status > 499 ? 'warn' : 'debug',
                type: 'response',
                msg: 'Sent ' + resInfo.status + ' response to ' + reqInfo.method + ' ' + reqInfo.path
            });
        });

        cors(ctx.conf.cors, method, input.headers, res);
        if(res.finished)
            return res.ended;


        const { handler, params } = this.#_matchRoute(method, path);
        args.params = params;

        try{
            
            if(!handler)
                throw buildHTTPError(404);

            args.body = new Body({
                timeout: ctx.reqBodyTimeout,
                reqStream: input.reqStream,
                headers: args.headers
            });

            if(ctx.autoParseBody && !input.websocket)
                args.body = await args.body.parse();

            await handler({ ...ctx.global, ...args });
        }
        catch(err){
            handleError(err, {
                reqInfo,
                res,
                log: ctx.log
            });
        }

        return res.ended;
    }

    
    /**
     * Matches a route and extracts parameters
     * @param {string} method HTTP method
     * @param {string} path HTTP path
     * @returns {{ handler: RouteHandler|false, params: ParamsObject }}
     */
    #_matchRoute(method, path){
        const route = method + ' ' + path;

        /** @type {ParamsObject} */
        const paramsReceiver = {};

        /** @type {RouteHandler|false} */
        let handler = false;
        
        if(route in this.#_static)
            handler = this.#_static[route];

        else if(this.#_dynamic[method])
            for(const r of this.#_dynamic[method]){
                const match = r.regexp.exec(path);
                if(match){
                    r.params.forEach( (p, i) => paramsReceiver[p] = decodeURIComponent(match[i + 1]));
                    handler = r.handler;
                }
            }
        
        else if(this.#_fallbackRoute)
            handler = this.#_fallbackRoute;

        return  {
            handler,
            params: paramsReceiver
        }
    }

}

module.exports.API = API;
