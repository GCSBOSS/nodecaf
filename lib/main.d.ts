import { Server, ServerResponse, IncomingMessage } from 'http'
import WebSocket from 'ws'

declare namespace Nodecaf {

    type DropFirst<T extends unknown[]> = T extends [unknown, ...infer U] ? U : never

    type GlobalHandlerArgs = {
	    /** A user controlled object whose properties wil be spread in route handler args. */
	    global: Record<string, unknown>
        /** A logging utility to output JSON lines to stdout. */
        log: Logger
        /** Call `fn` with the request handler args as the first parameter and spreading `args`. */
        call: <B extends GenericHandler>(fn: B, ...args: DropFirst<Parameters<B>>) => ReturnType<B>
        /** The current app configuration. */
        conf: ConfObject
    }

    type StandardGlobalHandler = (this: Nodecaf, input: GlobalHandlerArgs) => Promise<void> | void

    type GenericHandler = ((this: Nodecaf, input: GlobalHandlerArgs, ...args: any[]) => any)

    type ConfObject = {
        /** Controls logging output. */
        log?: {
            /** Define fields to be added to all log entries */
            defaults?: Record<string, unknown>,
            /** Only output log entries with specified `level` or above */
            level?: 'debug' | 'info' | 'warn' | 'error' | 'fatal',
            /** Only output log entries matching any `type` */
            only?: string | string[],
            /** Only output log entries not matching any `type` */
            except?: string | string[]
        },
        /** Creates an HTTP server that will be managed on the given port. */
        port?: number
    } & Record<string, unknown>

    type RunOptions = {
        /** Single or array of Conf object or file path */
        conf: ConfObject | string | (ConfObject | string)[],
        /** Path to the nodecaf module to be run */
        path: string
    }

    class Logger {
        debug(...args: unknown[]): void
        info(...args: unknown[]): void
        warn(...args: unknown[]): void
        error(...args: unknown[]): void
        fatal(...args: unknown[]): void
    }

    type CookieOpts = {
        expires?: Date,
        maxAge?: number,
        /**
         * @deprecated Setting `signed` cookies is deprecated. This option will be dropped on `v0.14.0`. Cookie signing must be done manually instead.
         */
        signed?: boolean,
        path?: string,
        domain?: string
        secure?: boolean
        httpOnly?: boolean
        overwrite?: boolean
        sameSite?:  "Strict" | "Lax" | "None"
    }

    class Response extends ServerResponse {

        /** In case `cond` is falsy, throws HTTP error with `status` and `message` as body printf-formated with `args` */
        assert(status: number, cond: boolean, message?: string, ...args: unknown[]): this
        /** In case `cond` is falsy, throws Error 400 with `message` as body printf-formated with `args` */
        badRequest(cond: boolean, message?: string, ...args: unknown[]): this
        /** In case `cond` is falsy, throws Error 401 with `message` as body printf-formated with `args` */
        unauthorized(cond: boolean, message?: string, ...args: unknown[]): this
        /** In case `cond` is falsy, throws Error 403 with `message` as body printf-formated with `args` */
        forbidden(cond: boolean, message?: string, ...args: unknown[]): this
        /** In case `cond` is falsy, throws Error 404 with `message` as body printf-formated with `args` */
        notFound(cond: boolean, message?: string, ...args: unknown[]): this
        /** In case `cond` is falsy, throws Error 409 with `message` as body printf-formated with `args` */
        conflict(cond: boolean, message?: string, ...args: unknown[]): this
        /** In case `cond` is falsy, throws Error 410 with `message` as body printf-formated with `args` */
        gone(cond: boolean, message?: string, ...args: unknown[]): this
        /** In case `cond` is falsy, throws Error 415 with `message` as body printf-formated with `args` */
        badType(cond: boolean, message?: string, ...args: unknown[]): this

        /** Respond with an HTTP error in `status` and `message` as body printf-formated with `args` */
        error(status: string | number, message?: string, ...args: unknown[]): void
        /** Respond with an Error 500 */
        error(status: unknown): void

        /** Append `chunk` to the response stream. */
        write(chunk: string | Buffer): this
        /** Finishes the request. If set, append `body` to the response stream. */
        end(body?: string | Buffer): void
        /** Respond with a json body and finishes the request. */
        json(data: unknown): void
        /** Respond with a text body and finishes the request. */
        text(data: number | boolean | string): void

        /** Set a request header. */
        set(k: string, v: string): this
        /** Append the header to the response. Allow sending duplicated header keys */
        append(k: string, v: string): this
        /** Set content-type header to a know type (json, text, urlencoded) or any mime-type */
        type(ct: string): this

        /** Send the request status to client. */
        status(s: number): this

        /** Set a cookie according to options. */
        cookie(name: string, value: string, opts?: CookieOpts): this
        /** Clear the cookie identified by `name` and `opts`. */
        clearCookie(name: string, opts?: CookieOpts): this
    }

    class RequestBody extends IncomingMessage {
        raw(): Promise<Buffer | unknown>
        text(): Promise<string>
        urlencoded(): Promise<Record<string, string>>
        json(): Promise<unknown>
        parse(): Promise<unknown>
    }

    type RouteHandlerArgs = {
        /** Object containing request headers as key-values. */
        headers: Record<string, string>,
        /** Object containing request URL query string as key-values. */
        query: Record<string, string>,
        /** A logging utility to output JSON lines to stdout. */
        log: Logger,
        /** Request body object (in case `opts.autoParseBody` is `true`, will contain the parsed data instead). */
        body: RequestBody | unknown,
        /** Request URL path. */
        path: string,
        /** Request HTTP method. */
        method: 'POST' | 'DELETE' | 'PATCH' | 'PUT' | 'GET',
        /** Response object used to compose a response to the client. */
        res: Response,
        /** Call `fn` with the request handler args as the first parameter and spreading `args`. */
        call: <Y, Z>(fn: (input: RouteHandlerArgs, ...args: Y[]) => Z, ...args: Y[]) => Z
        /** The current app configuration. */
        conf: ConfObject,
        /** Object containing the request cookies as key-values. */
        cookies: Record<string, string>,
        /**
         * Object containing the request signed cookies as key-values.
         * @deprecated `signedCookies` is deprecated. This option will be dropped on `v0.14.0`. Signed cookies must be handled manually instead.
         **/
        signedCookies: Record<string, string>,
        /** Object containing params parsed from URL segments as key-values. */
        params: Record<string, string>
        /** The remote address of the client performing the request. Standard proxy headers are considered. */
        ip: string,
        /** Store `value` under the name `key` in the handler args for the lifetime of the request. */
        keep: (key: string, value: unknown) => void,
        /** Accept WebSocket connection on upgrade. Only available when `opts.websocket` is set. */
        websocket: () => Promise<WebSocket.WebSocket>
    } & Record<string, unknown>

    type RouteHandler = (this: Nodecaf, input: RouteHandlerArgs) => Promise<void> | void

    type EndpointBuilders = {
        post: (path: string, handler: RouteHandler) => void,
        put: (path: string, handler: RouteHandler) => void,
        patch: (path: string, handler: RouteHandler) => void,
        get: (path: string, handler: RouteHandler) => void,
        del: (path: string, handler: RouteHandler) => void,
        all: (handler: RouteHandler) => void
    }

    type Route = {
        /** Endpoint HTTP method */
        method: string,
        /** Endpoint path starting with slash (e.g `/foo/:bar`) */
        path: string,
        /** Function to be called when endpoint is triggered */
        handler: RouteHandler
    }

    type AppOpts = {
        /** An array with your api endpoints */
        routes: Route[],
        /**
         * A function to build your api endpoints
         * @deprecated This option will be removed on `v0.14.0`. Use `routes` instead.
         **/
        api?: (this: Nodecaf, methods: Nodecaf.EndpointBuilders) => void,
        /** A function to run whenever the app is starting */
        startup?: StandardGlobalHandler,
        /** A function to run whenever the app is stopping */
        shutdown?: StandardGlobalHandler,
        /** App name, mainly used in log entries */
        name?: string,
        /** App version, mainly used in log entries */
        version?: string,
        /** Default config object or file path */
        conf?: Nodecaf.ConfObject | string,
        /** Whether request bodies should be parsed for known mime-types (json, text, urlencoded). Defaults to `false`. */
        autoParseBody?: boolean,
        /** A function that returns a custom HTTP server to be used by the app */
        server?: (args: Nodecaf) => Server,
        /** Whether to handle websocket upgrade requests. Defaults to `false`. */
        websocket?: boolean
    }

}

/**
 * A light RESTful App
 *
 * Example usage:
 * ```js
 * const app = new Nodecaf({
 *     api({ get }){
 *         get('/foo', function({ res }){
 *             res.text('bar');
 *         });
 *     }
 * });
 * await app.start();
 * const { status, body } = await app.trigger('get', '/bar');
 * console.log(status, body);
 * await app.stop();
 * ```
 */
declare class Nodecaf {

    /** Define a POST endpoint to `path` that when triggered will run the `handler` function */
    static post(path: string, handler: Nodecaf.RouteHandler): Nodecaf.Route
    /** Define a PUT endpoint to `path` that when triggered will run the `handler` function */
    static put(path: string, handler: Nodecaf.RouteHandler): Nodecaf.Route
    /** Define a PATCH endpoint to `path` that when triggered will run the `handler` function */
    static patch(path: string, handler: Nodecaf.RouteHandler): Nodecaf.Route
    /** Define a GET endpoint to `path` that when triggered will run the `handler` function */
    static get(path: string, handler: Nodecaf.RouteHandler): Nodecaf.Route
    /** Define a DELETE endpoint to `path` that when triggered will run the `handler` function */
    static del(path: string, handler: Nodecaf.RouteHandler): Nodecaf.Route
    /** Define a fallback `handler` function to be triggered when there are no matching routes */
    static all(handler: Nodecaf.RouteHandler): Nodecaf.Route

    /**
     * Run a given nodecaf app handling uncaught errors and node process signals
     * @deprecated This function will be dropped on `v0.14.0`. Use `app.run()` instead.
     */
    static run(opts: Nodecaf.RunOptions): void

    /**
     * Creates a new instance of an app in standby.
     */
    constructor(opts: Nodecaf.AppOpts)

    /**
     * Run a standby app. The returned `Promise` is resolved after the startup is
     * complete.
     */
    start(): Promise<'running' | 'starting'>

    /**
     * Stop a running app. The returned `Promise` is resolved after the shutdown
     * is complete.
     */
    stop(): Promise<'standby' | 'stopping'>

    /**
     * Restart a running app, applying configuration if sent. The returned
     * `Promise` is resolved once the app is fully started up.
     */
    restart(conf: Nodecaf.ConfObject | string): Promise<void>

    /**
     * Apply configuration from an object or reading from a config file in one
     * of the supported formats (JSON, TOML, YAML).
     */
    setup(...conf: (Nodecaf.ConfObject | string)[]): void

    /**
     * Trigger an app endpoint with given input data. Returns a `Promise`
     * resolving to the normalized response data.
     */
    trigger(method: string, path: string, input?: {
        body?: BodyInit,
        headers?: Record<string, string>,
        query?: Record<string, string>,
        cookies?: Record<string, string>
    }): Promise<{
        status: number,
        headers: Record<string, string>,
        body: unknown
    }>

    /**
     * Run the app handling uncaught errors and node process signals.
     */
    run(opts: Nodecaf.RunOptions): Promise<Nodecaf>

}

export = Nodecaf
