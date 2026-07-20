/**
 * @module instance
 * @description Core application instance management. Defines the EstelarInstance class which encapsulates the application lifecycle, including startup, shutdown, request handling, and internal
 * API triggering. Manages application state, configuration, logging, and integrates with the routing and native modules to handle HTTP requests and WebSocket connections.
 * @example
 * const app = new EstelarInstance(apiSpec, { http: 3000 });
 * await app.start();
 * // Trigger internal API call without HTTP overhead
 * const response = await app.trigger('GET', '/internal-endpoint', { query: { foo: 'bar' } });
 * console.log(response.status, response.body);
 * await app.stop();
 */

import { layerConf } from './conf.js';
import { getDataTypeFromContentType, getContentTypeFromData, getDataFromBytesAndTypes, formatDuration, getRandomId } from './utils.js';
import { Logger } from './logger.js';
import { nativeModule } from './native.js';
import { Response } from './response.js';
import { cors } from './cors.js';
import { buildHTTPError, handleError } from './error.js';
import { Body } from './body.js';
import { parse } from './cookie.js';

/**
 * @typedef {'starting'|'running'|'stopping'|'standby'|'stuck'} AppState
 */


/**
 * Retry a function after a short delay
 * @param {() => Promise<any>} fn Async function to retry
 * @returns {Promise<any>} Result of the function
 */
function retryShortly(fn){
    return new Promise(done => setTimeout(() => fn().then(done), 1000));
}

/**
 * Check if a Uint8Array uses a standard ArrayBuffer (not SharedArrayBuffer)
 * @param {Uint8Array} bytes The byte array to check
 * @returns {bytes is Uint8Array<ArrayBuffer>} True if using standard ArrayBuffer
 */
function isStandardBuffer(bytes) {
    return !(bytes.buffer instanceof SharedArrayBuffer);
}

/**
 * @template Globals
 * @typedef APIContext
 * @property {object} conf Configuration object
 * @property {import('./logger.js').Logger} log Logger instance
 * @property {number} reqBodyTimeout Request body parse timeout in milliseconds
 * @property {Globals} global Global context object
 */

/**
 * @typedef RequestInput
 * @property {ReadableStream<Uint8Array>} reqStream
 * @property {import('./native.js').NativeResponseHandles} resHandles
 * @property {Object.<string, string|string[]>} headers
 * @property {Object.<string, string>} query
 * @property {Object.<string, string>|string} cookies
 * @property {string} [ip]
 * @property {() => Promise<WebSocket>} [websocket]
 */

/**
 * @typedef InstanceOptions
 * @property {number} [http] HTTP port number to listen on
 * @property {Object.<string, unknown>} [conf] Configuration object or path
 * @property {boolean} [enableUncaughtErrorHandler] Whether to setup a global uncaught error handler
 * @property {import('./cors.js').CORSOptions} [cors]
 * @property {import('./logger.js').LogLevel} [logLevel]
 * @property {boolean} [disableLogs]
 */

/**
 * @template Globals
 * @class
 */
export class EstelarInstance {

    /** @type {import('./native.js').NativeServerHandles} */
    #_serverHandles;

    /** @type {AppState} */
    #_state;

    /** @type {number|undefined} */
    #_http;

    /** @type {Object.<string, unknown>} */
    #_conf;

    /** @type {import('./api.js').APISpec<Globals>} */
    #_apiSpec;

    /** @type {(() => void)|undefined} */
    #_clearSignalHandler;

    /** @type {(() => void)|undefined} */
    #_clearUncaughtErrorHandler;

    /** @type {Globals} */
    #_global;

    /** @type {Logger} */
    #_log;

    /** @type {import('./cors.js').CORSOptions} */
    #_corsOptions;

    /** @type {Number|undefined} */
    #_startedAt;

    /**
     * @param {import('./api.js').APISpec<Globals>} spec
     * @param {InstanceOptions} [opts]
     */
    constructor(spec, opts = {}){
        this.#_apiSpec = spec;
        this.#_conf = { ...opts.conf };
        this.#_state = 'standby';
        this.#_http = opts.http;

        if(opts.http && typeof this.#_http != 'number')
            throw new TypeError('HTTP port number must be of type \'number\'');

        if(opts.enableUncaughtErrorHandler ?? nativeModule.env() === 'production')
            this.#_clearUncaughtErrorHandler = nativeModule.setupUncaughtErrorHandler((err) => {
                this.#_log.fatal({ err, type: 'crash' });
            });

        this.#_clearSignalHandler = nativeModule.setupSignalHandler(() => {
            this.stop();
        });

        this.#_log = new Logger({
            level: opts.logLevel,
            disabled: opts.disableLogs,
            appName: this.#_apiSpec.name
        });

        this.#_corsOptions = opts.cors;
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
     * @param {...Object.<string, unknown>} objectOrPath Configuration object or path
     * @returns {void}
     */
    setup(...objectOrPath){
        this.#_conf = layerConf(this.#_conf, ...objectOrPath);
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

        if(this.#_apiSpec.startup || this.#_apiSpec.globalsGenerator)
            this.#_log.debug({ type: 'app' }, 'Starting up %s...', this.#_apiSpec.name);

        this.#_global = await this.#_apiSpec.globalsGenerator?.({
            conf: this.#_conf,
            log: this.#_log,
        });

        if(!this.#_apiSpec.router.list().find(r => r.method == 'GET' && r.path == '/health'))
            this.#_apiSpec.router.add('GET', '/health', ({ res }) => res.json({
                uptime: formatDuration(Date.now() - (this.#_startedAt ?? 0))
            }));

        // Handle exceptions in user code to maintain proper app state
        try{
            await this.#_apiSpec.startup?.({
                call: (fn, ...args) => 
                    fn.call(null, {
                        ...this.#_global,
                        conf: this.#_conf,
                        log: this.#_log,
                        global: this.#_global
                    }, ...args),
                conf: this.#_conf,
                log: this.#_log,
                global: this.#_global,
            });
        }
        catch(err){
            this.#_state = 'stuck';
            await this.stop();
            throw err;
        }

        if(this.#_http){
            this.#_serverHandles = await nativeModule.createServer(this.#_handleRequest.bind(this), this.#_http, this.#_apiSpec.websocketEnabled);
            this.#_log.info({ type: 'app' }, '%s has started on port %s', this.#_apiSpec.name, this.#_http);
        }
        else
            this.#_log.info({ type: 'app' }, '%s has started', this.#_apiSpec.name);

        this.#_startedAt = Date.now();

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
            await this.#_apiSpec.shutdown?.({
                call: (fn, ...args) => 
                    fn.call(null, {
                        ...this.#_global,
                        conf: this.#_conf,
                        log: this.#_log,
                        global: this.#_global
                    }, ...args),
                conf: this.#_conf,
                log: this.#_log,
                global: this.#_global,
            });
        }
        catch(err){
            if(startupFailed)
                this.#_log.error({ err, type: 'app' }, 'Error during shutdown process after failed startup');
            else
                throw err;
        }
        finally{
            await serverClosePromise;
            const uptime = formatDuration(Date.now() - (this.#_startedAt ?? 0));
            this.#_log.info({ type: 'app', uptime }, 'Stopped');
            this.#_state = 'standby';
            this.#_startedAt = undefined;
            this.#_clearSignalHandler?.();
            this.#_clearUncaughtErrorHandler?.();
        }

        return this.#_state;
    }

    /**
     * Trigger a request to the internal API
     * Useful for testing or internal calls without HTTP overhead
     * @param {string} method HTTP method (GET, POST, etc)
     * @param {string} path URL path
     * @param {Object} [input] Request input options
     * @param {unknown} [input.body] Request body (Uint8Array, ReadableStream, object, or string)
     * @param {{ [header: string]: string | string[] }} [input.headers] Request headers
     * @param {{ [key: string]: string }} [input.query] Query parameters
     * @param {{ [key: string]: string }} [input.cookies] Cookies
     * @returns {Promise<import('./response.js').ResponseInfo>} Response information including status, headers, and body
     */
    async trigger(method, path, input = {}){

        const originalHeaders = input.headers ?? {};
        const contentType = getContentTypeFromData(input.body);
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

        const resInfo = await this.#_handleRequest(method, path, {
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
     * Restart the application
     * Stops the current instance, updates configuration if provided, and starts again
     * @param {Object.<string, unknown>|string} [conf] New configuration object or file path to load
     * @returns {Promise<void>}
     */
    async restart(conf){
        await this.stop();
        if(typeof conf == 'object'){
            this.#_log.debug({ type: 'app' }, 'Reloaded settings');
            this.setup(conf);
        }
        await this.start();
    }

    /**
     * @param {string} method HTTP method
     * @param {string} path HTTP path
     * @param {RequestInput} input Input object
     * @returns {Promise<import('./response.js').ResponseInfo>} The response object
     */
    async #_handleRequest(method, path, input){
        const startTime = Date.now();
        method = method.toUpperCase();

        /** @type {APIContext<Globals>} */
        const ctx = {
            conf: this.#_conf,
            log: this.#_log,
            reqBodyTimeout: this.#_apiSpec.reqBodyTimeout,
            global: this.#_global,
        };

        /** @type {Response} */
        const res = new Response({
            resHandles: input.resHandles,
        });

        const correlationId = input.headers?.['x-correlation-id']
            ? String(input.headers['x-correlation-id'])
            : getRandomId(12);

        /** @type {import('./api.js').RouteHandlerArgs<Globals>} */
        const args = {
            ...ctx.global,
            params: {},
            body: null,
            res,
            websocket: input.websocket,
            conf: ctx.conf, 
            cookies: typeof input.cookies == 'string'
                ? parse(input.cookies)
                : input.cookies ?? {}, 
            headers: input.headers ?? {}, 
            query: input.query ?? {}, 
            log: ctx.log.extend({ 
                correlationId 
            }), 
            method, 
            path,
            ip: String(input.headers?.forwarded 
                ?? input.headers?.['x-forwarded-for']
                ?? input.ip 
                ?? '::1'),
            call: (fn, ...fargs) => fn.call(ctx, { ...args, ...ctx.global }, ...fargs),
            correlationId
        };
        
        const reqInfo = {
            method, path,
            host: String(args.headers.host),
            agent: String(args.headers['user-agent']),
            type: 'request',
            msg: 'Received ' + method + ' request to ' + path
        };

        this.#_log.debug(reqInfo);

        res.ended.then(resInfo => {
            const duration = Date.now() - startTime;
            this.#_log.debug({
                ...reqInfo,
                status: resInfo.status,
                level: resInfo.status > 499 ? 'warn' : 'debug',
                type: 'response',
                duration: duration + 'ms',
                msg: 'Sent ' + resInfo.status + ' response to ' + reqInfo.method + ' ' + reqInfo.path
            })
        });

        res.set('x-correlation-id', correlationId);

        cors(this.#_corsOptions, method, args.headers, res);
        if(res.finished)
            return res.ended;

        const result = this.#_apiSpec.router.match(method, path);
        const handler = result ? result.handler : this.#_apiSpec.fallbackRoute;
        args.params = result ? result.params : {};

        try{
            
            if(!handler)
                throw buildHTTPError(404);

            args.body = new Body({
                timeout: ctx.reqBodyTimeout,
                reqStream: input.reqStream,
                headers: args.headers
            });

            await handler.call(ctx, { ...ctx.global, ...args });
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
