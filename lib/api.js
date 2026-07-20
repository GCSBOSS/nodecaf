/**
 * @module api
 * @description Main API class. Defines the Estelar class which provides a high-level interface for defining HTTP routes, managing application lifecycle, and running the server. Integrates with the Router for route management and the EstelarInstance for request handling and server lifecycle.
 * @example
 * const api = new Estelar({
 *  name: 'MyApp',
 * version: '1.0.0',
 *  globals: async ({ log }) => {
 *    log.info('Generating globals...');
 *    return { db: await createDatabaseConnection() };
 *  },
 *  startup: async ({ log, global }) => {
 *    log.info('Starting up...');
 *    await global.db.connect();
 *  },
 *  shutdown: async ({ log, global }) => {
 *    log.info('Shutting down...');
 *    await global.db.disconnect();
 *  }
 * });
 * api.get('/users/:id', async ({ params, global }) => {
 *  return await global.db.getUser(params.id);
 * });
 * await api.run({ http: 3000 });
 */

import { nativeModule } from './native.js';
import { EstelarInstance } from './instance.js';
import { Router } from './router.js';
import { layerConf } from './conf.js';
import { parse } from './toml.js';

/**
 * @template Globals
 * @typedef APISpec
 * @property {string} name Application name
 * @property {string} version Application version
 * @property {(args: GlobalHandlerArgs) => Promise<Globals>|Globals} [globalsGenerator] Function to generate app-wide globals
 * @property {GlobalHandler<Globals>} [startup]
 * @property {GlobalHandler<Globals>} [shutdown]
 * @property {boolean} [websocketEnabled]
 * @property {Router} router
 * @property {Estelar} api
 * @property {number} reqBodyTimeout Request body parse timeout in milliseconds
 * @property {RouteHandler<Globals>} [fallbackRoute] Fallback route handler for all requests
 */

/**
 * @template Globals
 * @typedef {<B extends (input: RouteHandlerArgs<Globals>, ...args: any[]) => any>(fn: B, ...args: DropFirst<Parameters<B>>) => ReturnType<B>} RouteCall
 */

/**
 * @template Globals
 * @typedef BaseInputObject
 * @property {Object.<string, unknown>} conf Configuration object
 * @property {Object.<string, string>} cookies Parsed cookies
 * @property {Object.<string, string|string[]>} headers Request headers
 * @property {Object.<string, string>} query Parsed query parameters
 * @property {ParamsObject} params Route parameters
 * @property {string} method HTTP method
 * @property {string} path HTTP path
 * @property {string} ip Client IP address
 * @property {import('./logger.js').Logger} log Logger instance
 * @property {import('./response.js').Response} res HTTP response object
 * @property {import('./body.js').Body} body Request body parser or data
 * @property {() => Promise<WebSocket>} [websocket] Whether the request is a WebSocket upgrade
 * @property {RouteCall<Globals>} call Call a function with the current context
 * @property {string} correlationId Correlation ID for tracing requests across services
 */

/**
 * @template Globals
 * @typedef { BaseInputObject<Globals> & Globals } RouteHandlerArgs
 */

/**
 * @template Globals
 * @typedef {(args: RouteHandlerArgs<Globals>) => Promise<void>|void} RouteHandler
 */

/**
 * Find package.json metadata from the calling module
 * @returns {{ name: string, version: string }} Package name and version or defaults
 */
function findPkgInfo(){
    try{
        return nativeModule.getPackageInfo();
    }
    catch{
        return { name: 'Untitled', version: '0.0.0' };
    }
}

/**
 * @typedef {{ [param: string]: string }} ParamsObject
 */

/**
 * @typedef RunOptions
 * @property {Object.<string, unknown>|string} [conf] Configuration object or path 
 * @property {number} [http] HTTP port number
 * @property {boolean} [enableUncaughtErrorHandler] Whether to catch global errors
 * @property {import('./cors.js').CORSOptions} [cors]
 * @property {import('./logger.js').LogLevel} [logLevel]
 * @property {boolean} [disableLogs]
 * @property {boolean} [readConfFromArgv]
 */

/**
 * @template {unknown[]} T
 * @typedef {T extends [unknown, ...infer U] ? U : []} DropFirst
 */

/**
 * @typedef GlobalHandlerArgs
 * @property {import('./logger.js').Logger} log A logging utility to output JSON lines to stdout.
 * @property {Object.<string, unknown>} conf The current app configuration.
 */

/**
 * @template Globals
 * @typedef {<Fn extends (input: GlobalHandlerArgs & { global: Globals }, ...args: any[]) => any>(fn: Fn, ...args: DropFirst<Parameters<Fn>>) => ReturnType<Fn>} GlobalCall
 */

/**
 * @template Globals
 * @typedef {(args: GlobalHandlerArgs & { 
 *  global: Globals,
 *  call: GlobalCall<Globals>
 * }) => Promise<void>|void} GlobalHandler
 */


/**
 * @template Globals
 * @typedef APIOptions
 * @property {number} [http] HTTP port number
 * @property {boolean} [websocket] Whether to enable WebSocket support
 * @property {(args: GlobalHandlerArgs) => Promise<Globals>|Globals} [globals] Function to generate app-wide globals
 * @property {GlobalHandler<Globals>} [startup] Startup handler
 * @property {GlobalHandler<Globals>} [shutdown] Shutdown handler
 * @property {string} [name] Application name
 * @property {string} [version] Application version
 * @property {Object.<string, unknown>} [conf] Initial configuration object or path
 * @property {number} [reqBodyTimeout] Request body parse timeout in milliseconds
 */

/**
 * @template {Object.<string, unknown>} Globals
 * @class
 */
export class Estelar {

    /** @type {RouteHandler<Globals>|null} */
    #_fallbackRoute;

    /** @type {string} */
    #_name;

    /** @type {string} */
    #_version;

    /** @type {boolean} */
    #_websocket;

    /** @type {GlobalHandler<Globals>} */
    #_startup;

    /** @type {GlobalHandler<Globals>} */
    #_shutdown;

    /** @type {Router} */
    #_router;

    /** @type {number} */
    #_reqBodyTimeout;

    /** @type {(args: GlobalHandlerArgs) => Promise<Globals>|Globals} */
    #_globalsGenerator;

    /** @type {Object.<string, unknown>} */
    #_initialConf;

    /** @type {number} */
    #_defaultHttp;

    /**
     * Creates a new Estelar instance
     * @param {APIOptions<Globals>} opts 
     */
    constructor(opts = {}){

        if(typeof opts != 'object')
            throw new TypeError('Options argument must be an object');

        this.#_startup = opts.startup;
        this.#_shutdown = opts.shutdown;
        this.#_globalsGenerator = opts.globals;
        this.#_reqBodyTimeout = Number(opts.reqBodyTimeout ?? 3000);
        this.#_initialConf = opts.conf;
        this.#_websocket = Boolean(opts.websocket);
        this.#_defaultHttp = opts.http;

        const { name, version } = findPkgInfo();
        this.#_name = opts.name ?? name;
        this.#_version = opts.version ?? version;

        if(opts.startup && typeof this.#_startup != 'function')
            throw new TypeError('Startup handler must be a function');

        if(opts.shutdown && typeof this.#_shutdown != 'function')
            throw new TypeError('Shutdown handler must be a function');

        if(opts.globals && typeof this.#_globalsGenerator != 'function')
            throw new TypeError('Globals handler must be a function');

        if(opts.conf && typeof this.#_initialConf != 'object')
            throw new TypeError('Conf object must be a function');

        if(opts.http && typeof this.#_defaultHttp != 'number')
            throw new TypeError('HTTP option must be a port number');

        this.#_router = new Router();
        this.#_fallbackRoute = null;
    }

    /** 
     * Create a route specification for the given HTTP method
     * @param {string} method HTTP method (get, post, put, patch, delete)
     * @param {string} path HTTP path with optional parameters (e.g., '/users/:id')
     * @param {RouteHandler<Globals>} handler Route handler function
     */
    #_buildRoute(method, path, handler){
        if(typeof handler != 'function')
            throw new TypeError(`'${method.toUpperCase()}' handler must be a function. Found '${typeof handler}'`);
        this.#_router.add(method, path, handler);        
    }

    /**
     * Create a GET route.
     * @param {string} path HTTP path
     * @param {RouteHandler<Globals>} handler Route handler
     */
    get(path, handler){ 
        this.#_buildRoute('get', path, handler) 
    }

    /** 
     * Create a POST route.
     * @function
     * @param {string} path HTTP path
     * @param {RouteHandler<Globals>} handler Route handler
     */
    post(path, handler){ 
        this.#_buildRoute('post', path, handler) 
    }

    /** 
     * Create a DELETE route.
     * @function
     * @param {string} path HTTP path
     * @param {RouteHandler<Globals>} handler Route handler
     */
    delete(path, handler){ 
        this.#_buildRoute('delete', path, handler) 
    }

    /** 
     * Create a PUT route.
     * @function
     * @param {string} path HTTP path
     * @param {RouteHandler<Globals>} handler Route handler
     */
    put(path, handler){ 
        this.#_buildRoute('put', path, handler) 
    }

    /** 
     * Create a PATCH route.
     * @function
     * @param {string} path HTTP path
     * @param {RouteHandler<Globals>} handler Route handler
     */
    patch(path, handler){ 
        this.#_buildRoute('patch', path, handler) 
    }

    /** 
     * Create a DELETE route.
     * @function
     * @param {string} path HTTP path
     * @param {RouteHandler<Globals>} handler Route handler
    */
    // Needed because it's not possible to call a function named 'delete' without preffix
    del(path, handler){ 
        this.#_buildRoute('delete', path, handler) 
    }

    /**
     * Set the fallback route handler for all requests
     * This handler is called only if no route matches
     * @param {RouteHandler<Globals>} handler The fallback route handler
     * @returns {void}
     * @throws {Error} If fallback route is already defined
     * @throws {TypeError} If handler is not a function
     */
    all(handler){
        if(this.#_fallbackRoute)
            throw new Error('Route for \'ALL\' is already defined');
        if(typeof handler != 'function')
            throw new TypeError(`'ALL' handler must be a function. Found '${typeof handler}'`);

        this.#_fallbackRoute = handler;
    }

    /**
     * @param {RunOptions} [opts] Runtime options
     * @returns {Promise<EstelarInstance>} The Estelar instance
     */
    async run(opts = {}){

        const sourceConfs = [ this.#_initialConf, opts.conf ?? {} ];
        const confs = [];

        if(opts.readConfFromArgv){
            const argv = nativeModule.argv();
            const index = argv.findIndex(arg => arg === '-c' || arg === '--conf');
            if(index > -1 && argv[index + 1])
                sourceConfs.push(argv[index + 1]);
        }

        for(const c of sourceConfs){
            if(typeof c != 'string'){
                confs.push(c);
                continue;
            }
            const textFile = await nativeModule.readFile(c);
            confs.push(parse(textFile));
        }

        const i = new EstelarInstance({
            name: this.#_name,
            version: this.#_version,
            websocketEnabled: this.#_websocket,
            startup: this.#_startup,
            shutdown: this.#_shutdown,
            router: this.#_router,
            api: this,
            reqBodyTimeout: this.#_reqBodyTimeout,
            fallbackRoute: this.#_fallbackRoute,
            globalsGenerator: this.#_globalsGenerator,
        }, {
            http: opts.http ?? this.#_defaultHttp,
            conf: layerConf(...confs),
            enableUncaughtErrorHandler: opts.enableUncaughtErrorHandler,
            cors: opts.cors
        });

        await i.start();

        return i;
    }

    listRoutes(){
        return this.#_router.list();
    }

}
