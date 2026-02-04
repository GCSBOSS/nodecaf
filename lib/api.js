/**
 * @module api
 * @description REST API routing engine. Manages HTTP endpoint registration and request dispatching
 * with support for dynamic path parameters, static routes, and fallback handlers.
 * @example
 * const api = new API(context, [
 *   { method: 'GET', path: '/users/:id', handler: async (args) => { ... } }
 * ]);
 * const response = await api.trigger('GET', '/users/123', input);
 */

import { handleError, buildHTTPError } from './error.js';
import { Response } from './response.js';
import { Body } from './body.js';
import { cors } from './cors.js';
import { Router } from './router.js';

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
 * @property {() => Promise<WebSocket>} [websocket] Whether the request is a WebSocket upgrade
 * @property {(fn: Function, ...args: unknown[]) => unknown} call Call a function with the current context
 */

/**
 * @typedef APITriggerInput
 * @property {ReadableStream<Uint8Array>} reqStream
 * @property {import('./native').NativeResponseHandles} resHandles
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
 * @typedef {(args: RouteHandlerArgs) => Promise<void>|void} RouteHandler
 */

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
 * @property {object} global Global context object
 */

export class API {

    /** @type {APIContext} */
    #_context;

    /** @type {RouteHandler|null} */
    #_fallbackRoute;

    /** @type {Router} */
    #_router;

    /**
     * @param {APIContext} context The API context
     * @param {RouteSpec[]} [spec] The API specification
     */
    constructor(context, spec){
        this.#_context = context;
        this.#_fallbackRoute = null;
        this.#_router = new Router();

        spec?.forEach(r => r.all
            ? this.setFallbackRoute(r.handler)
            : this.#_router.add(r.method, r.path, r.handler));
    }

    /**
     * Set the fallback route handler for all requests
     * This handler is called only if no route matches
     * @param {import('./api').RouteHandler} handler The fallback route handler
     * @returns {void}
     * @throws {Error} If fallback route is already defined
     * @throws {TypeError} If handler is not a function
     */
    setFallbackRoute(handler){
        if(this.#_fallbackRoute)
            throw new Error('Route for \'ALL\' is already defined');
        if(typeof handler != 'function')
            throw new TypeError(`'ALL' handler must be a function. Found '${typeof handler}'`);

        this.#_fallbackRoute = handler.bind(this.#_context);
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
            ip: input.headers?.forwarded 
                ?? input.headers?.['x-forwarded-for']
                ?? input.ip 
                ?? '::1',
            call: (fn, ...fargs) => fn.call(ctx, { ...args, ...ctx.global }, ...fargs)
        };

        
        const reqInfo = {
            method, path,
            host: args.headers.host,
            agent: args.headers['user-agent'],
            type: 'request',
            msg: 'Received ' + method + ' request to ' + path
        };

        ctx.log.debug(reqInfo);

        /** @type {Response} */
        const res = args.res = new Response({
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

        cors(ctx.conf.cors, method, args.headers, res);
        if(res.finished)
            return res.ended;

        const result = this.#_router.match(method, path);
        const handler = result ? result.handler : this.#_fallbackRoute;
        args.params = result ? result.params : {};

        try{
            
            if(!handler)
                throw buildHTTPError(404);

            args.body = new Body({
                timeout: ctx.reqBodyTimeout,
                reqStream: input.reqStream,
                headers: args.headers
            });

            await handler.call(this.#_context, { ...ctx.global, ...args });
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
}
