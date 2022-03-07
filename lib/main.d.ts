import { Server } from 'http';

declare namespace Nodecaf {

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
        signed?: boolean,
        path?: string,
        domain?: string
        secure?: boolean
        httpOnly?: boolean
        overwrite?: boolean
        sameSite?:  "Strict" | "Lax" | "None"
    }

    class Response {

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
        end(body?: string | Buffer): this
        /** Respond with a json body and finishes the request. */
        json(data: unknown): this
        /** Respond with a text body and finishes the request. */
        text(data: number | boolean | string): this

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

    class RequestBody {
        req: Request
        raw(): Promise<Buffer | unknown>
        text(): Promise<string>
        urlencoded(): Promise<Record<string, string>>
        json(): Promise<unknown>
        parse(): Promise<Buffer | string | Record<string, string> | unknown>
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
        call: <T>(fn: (input: RouteHandlerArgs, ...args: unknown[]) => T, ...args: unknown[]) => T
        /**
         * Run an express middleware `fn` and returns a `Promise` resolving when `next` is called, or rejecting in case of exceptions
         * @deprecated This property is going to be removed on v0.13.0.
         */
        fork: (fn: RouteHandler) => Promise<void>,
        /** The current app configuration. */
        conf: ConfObject,
        /** Object containing the request unsigned cookies as key-values. */
        cookies: Record<string, string>,
        /** Object containing the request signed cookies as key-values. */
        signedCookies: Record<string, string>,
        /** Object containing params parsed from URL segments as key-values. */
        params: Record<string, string>,
        /**
         * Run next function in the handler chain
         * @deprecated This method is going to be removed on v0.13.0.
         */
        next: <T>(fn: (input: RouteHandlerArgs, ...args: unknown[]) => T, ...args: unknown[]) => T,
        /**
         * Object where you can store values to be persisted across the middleware chain
         * @deprecated This property is going to be removed on v0.13.0.
         */
        flash: Record<string, string>
    } & Record<string, unknown>;

    type RouteHandler = (this: Nodecaf, input: RouteHandlerArgs) => Promise<void> | void

    type EndpointBuilders = {
        post: (path: string, handler: RouteHandler) => void,
        put: (path: string, handler: RouteHandler) => void,
        patch: (path: string, handler: RouteHandler) => void,
        get: (path: string, handler: RouteHandler) => void,
        del: (path: string, handler: RouteHandler) => void,
        all: (handler: RouteHandler) => void
    }

    type AppOpts = {
        /** A function to build your api endpoints */
        api?: (this: Nodecaf, methods: Nodecaf.EndpointBuilders) => void,
        /** A function to run whenever the app is starting */
        startup?: (args: Nodecaf) => void,
        /** A function to run whenever the app is stopping */
        shutdown?: (args: Nodecaf) => void,
        /** App name, mainly used in log entries */
        name?: string,
        /** App version, mainly used in log entries */
        version?: string,
        /** Default config object or file path */
        conf?: Nodecaf.ConfObject | string,
        /** whether request bodies should be parsed for known mime-types (json, text, urlencoded) */
        autoParseBody?: boolean,
        /** A function tthat returns a custom HTTP server to be used by the app */
        server?: (args: Nodecaf) => Server
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

    /** A user controlled object whose properties wil be spread in route handler args. */
    global: Record<string, unknown>
    /** The current app configuration. */
    conf: Nodecaf.ConfObject
    /** A logging utility to output JSON lines to stdout. */
    log: Nodecaf.Logger
    /** Call `fn` with the app global args as the first parameter and spreading `args`. */
    call: <T>(fn: (app: Nodecaf, ...args: unknown[]) => T, ...args: unknown[]) => T

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
    restart(conf: Record<string, unknown> | string): Promise<void>

    /**
     * Apply configuration from an object or reading from a config file in one
     * of the supported formats (JSON, TOML, YAML).
     */
    setup(conf: Record<string, unknown> | string): void

    /**
     * Trigger an app endpoint with given input data. Returns a `Promise`
     * resolving to the normalized response data.
     */
    trigger(method: string, path: string, input: {
        body?: BodyInit,
        headers?: Record<string, string>,
        query?: Record<string, string>,
        cookies?: Record<string, string>
    }): Promise<{
        status: number,
        headers: Record<string, string>,
        body: unknown
    }>
}

export = Nodecaf
