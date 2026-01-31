const { layerConf } = require('./conf');
const { API } = require('./api');
const { getDataTypeFromContentType, getContentTypeFromData: getContentTypeFromDataType, getDataFromBytesAndTypes } = require('./types');
const { Logger } = require('./logger');
const nativeModule = require('./native');

/**
 * @typedef RunOptions
 * @property {Object|(Object|string)[]|string} [conf] Configuration object or path 
 */

/**
 * @typedef {'starting'|'running'|'stopping'|'standby'|'stuck'} AppState
 */

/**
 * @typedef GlobalHandlerArgs
 * @property {Record<string, unknown>} global A user controlled object whose properties wil be spread in route handler args.
 * @property {import('./logger').Logger} log A logging utility to output JSON lines to stdout.
 * @property {GlobalCall} call Call `fn` with the request handler args as the first parameter and spreading `args`.
 * @property {Object} conf The current app configuration.
 */

/**
 * @typedef {((this: Nodecaf, input: GlobalHandlerArgs, ...args: any[]) => any)} GenericHandler
 */

/**
 * @typedef {<B extends GenericHandler>(fn: B, ...args: DropFirst<Parameters<B>>) => ReturnType<B>} GlobalCall
 */

/**
 * @typedef AppOptions
 * @property {number} [http] HTTP port number
 * @property {boolean} [websocket] Whether to enable WebSocket support
 * @property {import('./api').RouteSpec[]} [routes] Application routes
 * @property {(args: GlobalHandlerArgs) => Promise<void>|void} [startup] Startup handler
 * @property {(args: GlobalHandlerArgs) => Promise<void>|void} [shutdown] Shutdown handler
 * @property {(app: Nodecaf) => import('http').Server} [server] Custom server builder
 * @property {string} [name] Application name
 * @property {string} [version] Application version
 * @property {Object} [conf] Initial configuration object or path
 * @property {boolean} [autoParseBody] Whether to auto-parse request bodies
 * @property {number} [reqBodyTimeout] Request body parse timeout in milliseconds
 */

/** @var {NodeJS.Module} module */


/**
 * Find package.json info from the parent module.
 * @returns { { name: string, version: string } } 
 */
function findPkgInfo(){
    try{
        return require(module.parent.path + '/../package.json');
    }
    catch{
        /* istanbul ignore next */
        return { name: 'Untitled', version: '0.0.0' };
    }
}

/**
 * Retry a function after a short delay.
 * @param {() => Promise<any>} fn Function to retry
 * @returns {Promise<any>}
 */
function retryShortly(fn){
    return new Promise(done => setTimeout(() => fn().then(done), 1000));
}

/**
 * @param {Uint8Array} bytes
 * @returns {bytes is Uint8Array<ArrayBuffer>}
 */
function isStandardBuffer(bytes) {
    return !(bytes.buffer instanceof SharedArrayBuffer);
}

/** 
 * Create a route specification for the given HTTP method.
 * @param {string} method HTTP method
 * @param {string} path HTTP path
 * @param {import('./api').RouteHandler} handler Route handler
 * @return {import('./api').RouteSpec} The route specification
 */
function buildRoute(method, path, handler){
    if(typeof handler != 'function')
        throw new TypeError(`'${method.toUpperCase()}' handler must be a function. Found '${typeof handler}'`);
    return { method, path, handler };
}

/**
 * Configuration loaders
 * @type {{ [type: string]: (path: string) => Object }}
 */
const loaders = {
    toml: conf => require('toml').parse(conf),
    json: conf => JSON.parse(conf)
}

class Nodecaf {

    /** @type {import('./native').NativeServerHandles} */
    #_serverHandles;

    /** @type {AppState} */
    #_state;

    /** @type {string} */
    #_name;

    /** @type {string} */
    #_version;

    /** @type {boolean} */
    #_websocket;

    /** @type {(args: GlobalHandlerArgs) => Promise<void>|undefined} */
    #_startup;

    /** @type {(args: GlobalHandlerArgs) => Promise<void>|undefined} */
    #_shutdown;

    /** @type {number|undefined} */
    #_http;

    /** @type {Object} */
    #_conf;

    /** @type {API} */
    #_api;
    
    /** @type {import('./api').APIContext} */
    #_apiContext;

    /** @type {() => void} */
    #_clearGlobalHandlers;

    /**
     * @param {AppOptions} [opts]
     */
    constructor(opts = {}){
        this.#_validateOpts.call(this, opts);

        this.#_conf = {};
        this.#_state = 'standby';

        this.#_apiContext = {
            conf: this.#_conf,
            log: this.log,
            global: null,
            reqBodyTimeout: opts.reqBodyTimeout ?? 3000,
            autoParseBody: opts.autoParseBody ?? false
        };

        this.setup(opts.conf);

        this.#_api = new API(this.#_apiContext, opts.routes ?? []);
    }

    #_validateOpts(opts){
        if(typeof opts != 'object')
            throw new TypeError('Options argument must be an object');

        this.#_websocket = opts.websocket;
        this.#_startup = opts.startup;
        this.#_shutdown = opts.shutdown;
        this.#_http = opts.http;

        const { name, version } = findPkgInfo();
        this.#_name = opts.name ?? name;
        this.#_version = opts.version ?? version;

        if(opts.routes && !Array.isArray(opts.routes))
            throw new TypeError('Routes must be an array');

        if(opts.startup && typeof this.#_startup != 'function')
            throw new TypeError('Startup handler must be a function');

        if(opts.shutdown && typeof this.#_shutdown != 'function')
            throw new TypeError('Shutdown handler must be a function');

        if(opts.http && typeof this.#_http != 'number')
            throw new TypeError('HTTP port number must be of type \'number\'');
    }

    /**
     * Returns the current app state
     * @returns {AppState}
     */
    state(){
        return this.#_state;
    }

    /**
     * Setup or update the application configuration.
     * @this {Nodecaf}
     * @param {...Object} objectOrPath Configuration object or path
     * @returns {void}
     */
    setup(...objectOrPath){
        this.#_conf = layerConf(this.#_conf, ...objectOrPath);
        this.#_conf.log = this.#_conf.log ?? {};
        
        this.log = new Logger({
            level: this.#_conf.log.level,
            disabled: this.#_conf.log === false,
            appName: this.#_name
        });

        this.#_apiContext.conf = this.#_conf;
        this.#_apiContext.log = this.log;
    }

    /**
     * Start the application.
     * @returns {Promise<AppState>} The final state
     */
    async start(){

        if(this.#_state in { running: 1, starting: 1 })
            return this.#_state;
        if(this.#_state == 'stopping')
            return await retryShortly(() => this.start());

        this.#_state = 'starting';

        this.#_apiContext.global = {};

        if(this.#_startup)
            this.log.debug({ type: 'app' }, 'Starting up %s...', this.#_name);

        // Handle exceptions in user code to maintain proper app state
        try{
            await this.#_startup?.({
                call: (fn, ...args) => 
                    fn.call(this.#_apiContext, {
                        ...this.#_apiContext.global,
                        conf: this.#_conf,
                        log: this.log,
                    }, ...args),
                conf: this.#_conf,
                log: this.log,
                global: this.#_apiContext.global,
            });
        }
        catch(err){
            this.#_state = 'stuck';
            await this.stop();
            throw err;
        }

        if(this.#_http){
            this.#_serverHandles = await nativeModule.createServer(this.#_api, this.#_http, this.#_websocket);
            this.log.info({ type: 'app' }, '%s has started', this.#_name);
        }

        return this.#_state = 'running';
    }

    /**
     * Stop the application.
     * @returns {Promise<AppState>} The final state
     */
    async stop(){
        if(this.#_state in { stopping: 1, standby: 1 })
            return this.#_state;

        const startupFailed = this.#_state == 'stuck';

        if(this.#_state == 'starting')
            return await retryShortly(() => this.stop());

        this.#_state = 'stopping';

        const serverClosePromise = this.#_serverHandles
            ? this.#_serverHandles.close()
            : Promise.resolve();

        // Handle exceptions in user code to maintain proper app state
        try{
            await this.#_shutdown?.({
                call: (fn, ...args) => 
                    fn.call(this.#_apiContext, {
                        ...this.#_apiContext.global,
                        conf: this.#_conf,
                        log: this.log,
                    }, ...args),
                conf: this.#_conf,
                log: this.log,
                global: this.#_apiContext.global
            });
        }
        catch(err){
            if(startupFailed)
                this.log.error({ err, type: 'app' }, 'Error during shutdown process after failed startup');
            else
                throw err;
        }
        finally{
            await serverClosePromise;
            this.log.info({ type: 'app' }, 'Stopped');
            this.#_state = 'standby';
            if(typeof this.#_clearGlobalHandlers == 'function')
                this.#_clearGlobalHandlers();
        }

        return this.#_state;
    }

    /**
     * Trigger a request to the internal API.
     * @this {Nodecaf}
     * @param {string} method
     * @param {string} path
     * @param {Object} [input]
     * @param {unknown} [input.body] - Accepts byte arrays, streams and plain objects. Anything else will be treated as a string.
     * @param {Object} [input.headers]
     * @param {Object} [input.query]
     * @param {Object} [input.cookies]
     * @returns {Promise<import('./response').ResponseInfo>}
     */
    async trigger(method, path, input = {}){

        const originalHeaders = input.headers ?? {};
        const contentType = getContentTypeFromDataType(input.body);
        if(!originalHeaders['content-type'] && !originalHeaders['Content-Type'] && contentType)
            input = { ...input, headers: { ...originalHeaders, 'content-type': contentType } };
        
        let reqStream;
        const fromNative = nativeModule.nativeDataToWebStream(input.body);

        if(input.body instanceof ReadableStream)
            reqStream = input.body;
        else if(fromNative)
            reqStream = fromNative;
        else{
            const originalBody = input.body;
            
            /** @type {Uint8Array} */
            let bodyBytes;            

            if(originalBody === undefined || originalBody === null || originalBody === '') 
                bodyBytes = new Uint8Array(0);
            else if(originalBody instanceof Uint8Array && originalBody.buffer instanceof SharedArrayBuffer)
                bodyBytes = new Uint8Array(originalBody);
            else if(originalBody instanceof Uint8Array){
                // POOL PROTECTION: Create a copy. 
                // Passing a Buffer from the shared pool to a ReadableStream 
                // can cause the stream to 'transfer' (detach) the pool, crashing 
                // subsequent tests that try to use Buffer.allocUnsafe.
                bodyBytes = new Uint8Array(originalBody.length);
                bodyBytes.set(originalBody);
            }
            else if(typeof originalBody == 'object')
                bodyBytes = new TextEncoder().encode(JSON.stringify(originalBody));
            else
                bodyBytes = new TextEncoder().encode(String(originalBody));

            reqStream = new ReadableStream({
                type: 'bytes',
                start(controller) {
                    if(!isStandardBuffer(bodyBytes))
                        throw new TypeError('Cannot enqueue SharedArrayBuffer to ReadableStream');
                    bodyBytes.byteLength > 0 && controller.enqueue(bodyBytes);
                    controller.close();
                }
            });
        }

        const chunks = [];

        const resInfo = await this.#_api.trigger(method, path, {
            reqStream,
            resHandles: {
                setStatus: () => undefined,
                setHeader: () => undefined,
                write: (chunk) => {
                    const buf = typeof chunk === 'string' 
                        ? new TextEncoder().encode(chunk) 
                        : new Uint8Array(chunk);
                    
                    chunks.push(buf);
                    return Promise.resolve();
                },
                end: () => Promise.resolve()
            },
            headers: input.headers,
            query: input.query,
            cookies: input.cookies,
        });

        if(chunks.length > 0){
            const ct = resInfo.headers?.['content-type'] ?? resInfo.headers?.['Content-Type'];
            const { type, charset } = getDataTypeFromContentType(ct);
            const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
            const merged = new Uint8Array(totalLength);
            let offset = 0;
            for(const chunk of chunks) {
                merged.set(chunk, offset);
                offset += chunk.length;
            }
            resInfo.body = getDataFromBytesAndTypes(merged, type, charset);
        }

        return resInfo;
    }

    /**
     * Restart the application.
     * @param {Object|string} [conf] New configuration object or path
     */
    async restart(conf){
        await this.stop();
        if(typeof conf == 'object'){
            this.log.debug({ type: 'app' }, 'Reloaded settings');
            this.setup(conf);
        }
        await this.start();
    }

    /**
     * Run the application.
     * @param {RunOptions} [opts]
     */
    async run(opts = {}){
        const confs = [].concat(opts.conf);

        for(const idx in confs){
            const path = confs[idx]; 
            if(typeof path == 'string'){

                const type = path.split(/\./g).at(-1);
                if(typeof loaders[type] !== 'function')
                    throw new Error('Conf type not supported: ' + type);

                const textFile = await nativeModule.readFile(path);
                confs[idx] = loaders[type](textFile);
            }
        }

        this.setup(...confs);

        this.#_clearGlobalHandlers = nativeModule.setupGlobalHandlers(
            () => {
                this.stop();
            },

            err => {
                this.log.fatal({ err, type: 'crash' });
                process.env.NODE_ENV !== 'production' &&
                    console.log(err);
            }
        );

        await this.start();

        return this;
    }

    /**
     * Create a GET route.
     * @param {string} path HTTP path
     * @param {import('./api').RouteHandler} handler Route handler
     * @returns {import('./api').RouteSpec}
     */
    static get(path, handler){ 
        return buildRoute('get', path, handler) 
    };

    /** 
     * Create a POST route.
     * @function
     * @param {string} path HTTP path
     * @param {import('./api').RouteHandler} handler Route handler
     * @returns {import('./api').RouteSpec}
     */
    static post(path, handler){ 
        return buildRoute('post', path, handler) 
    }

    /** 
     * Create a DELETE route.
     * @function
     * @param {string} path HTTP path
     * @param {import('./api').RouteHandler} handler Route handler
     * @returns {import('./api').RouteSpec}
     */
    static delete(path, handler){ 
        return buildRoute('delete', path, handler) 
    }

    /** 
     * Create a PUT route.
     * @function
     * @param {string} path HTTP path
     * @param {import('./api').RouteHandler} handler Route handler
     * @returns {import('./api').RouteSpec}
     */
    static put(path, handler){ 
        return buildRoute('put', path, handler) 
    }

    /** 
     * Create a PATCH route.
     * @function
     * @param {string} path HTTP path
     * @param {import('./api').RouteHandler} handler Route handler
     * @returns {import('./api').RouteSpec}
     */
    static patch(path, handler){ 
        return buildRoute('patch', path, handler) 
    }

    /** 
     * Create a DELETE route.
     * @function
     * @param {string} path HTTP path
     * @param {import('./api').RouteHandler} handler Route handler
     * @returns {import('./api').RouteSpec}
    */
    // Needed because it's not possible to call a function named 'delete' without preffix
    static del(path, handler){ 
        return buildRoute('delete', path, handler) 
    }

    /**
     * @param {Function} handler
     * @returns {{ all: true, handler: Function }}
     */
    static all(handler){
        if(typeof handler != 'function')
            throw new TypeError(`'ALL' handler must be a function. Found '${typeof handler}'`)
        return { all: true, handler }
    }

}



module.exports = Nodecaf;

