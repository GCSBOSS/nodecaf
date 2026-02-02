declare module "cookie" {
    /**
     * Parses a cookie header string into an object
     * @param {string} header
     * @return {Object}
     */
    export function parse(header: string): any;
    /**
     * @typedef {Object} CookieOptions
     * @property {number} [maxAge]
     * @property {string} [domain]
     * @property {string} [path]
     * @property {Date} [expires]
     * @property {boolean} [httpOnly]
     * @property {boolean} [secure]
     * @property {'low'|'medium'|'high'} [priority]
     * @property {boolean|'lax'|'strict'|'none'} [sameSite]
     */
    /**
     * Serializes a cookie name-value pair into a cookie string
     * @param {string} key
     * @param {string} val
     * @param {CookieOptions} [options]
     * @return {string}
     */
    export function serialize(key: string, val: string, options?: CookieOptions): string;
    export type CookieOptions = {
        maxAge?: number;
        domain?: string;
        path?: string;
        expires?: Date;
        httpOnly?: boolean;
        secure?: boolean;
        priority?: "low" | "medium" | "high";
        sameSite?: boolean | "lax" | "strict" | "none";
    };
}
declare module "native_node" {
    /**
     * @type {import('./native').NativeModule}
     */
    export const nativeNodeModule: import("native").NativeModule;
}
declare module "native" {
    /**
     * @module native
     * @description Runtime abstraction layer. Detects the JavaScript runtime environment (Node.js, Bun, Deno)
     * and provides a consistent interface for platform-specific operations (HTTP servers, streams, filesystem).
     * @example
     * // Automatically selects native_node.js for Node.js
     * const nativeModule = require('./native.js');
     * const server = await nativeModule.createServer(api, 3000);
     */
    /**
     * @typedef NativeResponseHandles
     * @property {(statusCode: number) => any} setStatus Set the response status code
     * @property {(header: string, value: string|string[]) => any} setHeader Set a response header
     * @property {(chunk: Uint8Array|string) => Promise<void>} write Write a chunk to the response body
     * @property {() => Promise<void>} end End the response
     */
    /**
     * @typedef NativeServerHandles
     * @property {() => Promise<void>} close
     */
    /**
     * @typedef PackageInfo
     * @property {string} name
     * @property {string} version
     */
    /**
     * NativeModule (runtime bridge)
     *
     * This typedef describes the small runtime-specific bridge that adapts Nodecaf to
     * the host JavaScript environment (Node.js, Bun, Deno, etc.). The native module
     * is responsible for all environment-dependent operations such as creating an
     * HTTP server, converting native streams to Web Streams, filesystem access and
     * registering global process-level handlers.
     *
     * Architecture and responsibilities
     * - Synchronous export: the module should export a plain object matching this
     *   interface. Loading the module (require/import) should not perform heavy
     *   work; long-running initialization must be performed by `createServer`.
     * - `createServer(api, port, websocketEnabled?)`:
     *   - Create and bind a HTTP server integrated with the provided `api`.
     *   - Return a Promise resolving to `NativeServerHandles` that exposes a
     *     `close()` method which gracefully shuts down the server and waits for
     *     open connections to drain before resolving.
     * - `nativeDataToWebStream(data)`:
     *   - Convert runtime-native stream/reader objects (e.g. Node.js `Readable`)
     *     into a Web Streams `ReadableStream<Uint8Array>` when possible.
     *   - Return `false` when conversion is not applicable. The returned stream
     *     must preserve ownership semantics (do not transfer SharedArrayBuffer).
     * - `readFile(path)`:
     *   - Read a text file (usually UTF-8) and return its contents as a string.
     * - `setupGlobalHandlers(termCallback, dieCallback)`:
     *   - Register process/global-level termination and uncaught exception
     *     handlers appropriate for the runtime.
     *   - Return a function that removes those handlers (cleanup).
     * - `env()`:
     *   - Return a short string identifying the runtime environment (e.g. 'development',
     *     'production', or custom environment value).
     * - `getPackageInfo()`:
     *   - Return the package identification object { name, version } for logging and
     *     defaults. Implementations should not crash if package.json is missing;
     *     instead return safe defaults.
     *
     * Implementation notes
     * - The module should map the Nodecaf `NativeResponseHandles` interface to the
     *   underlying runtime response primitives; `write()` and `end()` must
     *   coordinate backpressure and promise-based completion semantics.
     * - `createServer` must not swallow user errors: fatal bootstrap errors should
     *   reject the returned promise so the caller can react.
     * - WebSocket support is optional and gated by the `websocketEnabled` flag.
     * - The Node-specific implementation lives in `native_node.js` and is the
     *   reference implementation for other runtimes.
     *
     * @public
     * @typedef NativeModule
     *
     * @property {(api: import('./api').API, port: number, websocketEnabled?: boolean) => Promise<NativeServerHandles>} createServer
     * @property {(data: unknown) => ReadableStream<Uint8Array>|false} nativeDataToWebStream
     * @property {(path: string) => Promise<string>} readFile
     * @property {(
     *      termCallback: () => void,
     *      dieCallback: (err: Error) => void
     * ) => () => void} setupGlobalHandlers
     * @property {() => string} env
     * @property {() => PackageInfo} getPackageInfo
     */
    /** @type {NativeModule} */
    export let nativeModule: NativeModule;
    export type NativeResponseHandles = {
        /**
         * Set the response status code
         */
        setStatus: (statusCode: number) => any;
        /**
         * Set a response header
         */
        setHeader: (header: string, value: string | string[]) => any;
        /**
         * Write a chunk to the response body
         */
        write: (chunk: Uint8Array | string) => Promise<void>;
        /**
         * End the response
         */
        end: () => Promise<void>;
    };
    export type NativeServerHandles = {
        close: () => Promise<void>;
    };
    export type PackageInfo = {
        name: string;
        version: string;
    };
    /**
     * NativeModule (runtime bridge)
     *
     * This typedef describes the small runtime-specific bridge that adapts Nodecaf to
     * the host JavaScript environment (Node.js, Bun, Deno, etc.). The native module
     * is responsible for all environment-dependent operations such as creating an
     * HTTP server, converting native streams to Web Streams, filesystem access and
     * registering global process-level handlers.
     *
     * Architecture and responsibilities
     * - Synchronous export: the module should export a plain object matching this
     *   interface. Loading the module (require/import) should not perform heavy
     *   work; long-running initialization must be performed by `createServer`.
     * - `createServer(api, port, websocketEnabled?)`:
     *   - Create and bind a HTTP server integrated with the provided `api`.
     *   - Return a Promise resolving to `NativeServerHandles` that exposes a
     *     `close()` method which gracefully shuts down the server and waits for
     *     open connections to drain before resolving.
     * - `nativeDataToWebStream(data)`:
     *   - Convert runtime-native stream/reader objects (e.g. Node.js `Readable`)
     *     into a Web Streams `ReadableStream<Uint8Array>` when possible.
     *   - Return `false` when conversion is not applicable. The returned stream
     *     must preserve ownership semantics (do not transfer SharedArrayBuffer).
     * - `readFile(path)`:
     *   - Read a text file (usually UTF-8) and return its contents as a string.
     * - `setupGlobalHandlers(termCallback, dieCallback)`:
     *   - Register process/global-level termination and uncaught exception
     *     handlers appropriate for the runtime.
     *   - Return a function that removes those handlers (cleanup).
     * - `env()`:
     *   - Return a short string identifying the runtime environment (e.g. 'development',
     *     'production', or custom environment value).
     * - `getPackageInfo()`:
     *   - Return the package identification object { name, version } for logging and
     *     defaults. Implementations should not crash if package.json is missing;
     *     instead return safe defaults.
     *
     * Implementation notes
     * - The module should map the Nodecaf `NativeResponseHandles` interface to the
     *   underlying runtime response primitives; `write()` and `end()` must
     *   coordinate backpressure and promise-based completion semantics.
     * - `createServer` must not swallow user errors: fatal bootstrap errors should
     *   reject the returned promise so the caller can react.
     * - WebSocket support is optional and gated by the `websocketEnabled` flag.
     * - The Node-specific implementation lives in `native_node.js` and is the
     *   reference implementation for other runtimes.
     */
    export type NativeModule = {
        createServer: (api: import("api").API, port: number, websocketEnabled?: boolean) => Promise<NativeServerHandles>;
        nativeDataToWebStream: (data: unknown) => ReadableStream<Uint8Array> | false;
        readFile: (path: string) => Promise<string>;
        setupGlobalHandlers: (termCallback: () => void, dieCallback: (err: Error) => void) => () => void;
        env: () => string;
        getPackageInfo: () => PackageInfo;
    };
}
declare module "logger" {
    /**
     * Formats a string by replacing %s placeholders with the given arguments.
     * @param {string} str String with %s placeholders
     * @param  {...unknown} args Arguments to replace placeholders
     * @returns {string} Formatted string
     */
    export function format(str: string, ...args: unknown[]): string;
    /**
     * @typedef {Object} LoggerOptions
     * @property {LogLevel} [level] Minimum log level
     * @property {boolean} [disabled] Disable logging if set to false
     * @property {string} [appName] Define the value of the 'app' log entry key
     */
    /**
     * Logger class
     * @class
     * @property {string} level Current log level
     * @property {string} _appName Application name
     */
    export class Logger {
        /**
         * @param {LoggerOptions} [options] Logger configuration
         */
        constructor(options?: LoggerOptions);
        /**
         * Logs a debug message.
         * @param  {...unknown} args Log arguments
         * @returns {LogEntry|false} Log entry or false if level is too low
         */
        debug(...args: unknown[]): LogEntry | false;
        /**
         * Logs an info message.
         * @param  {...unknown} args Log arguments
         * @returns {LogEntry|false} Log entry or false if level is too low
         */
        info(...args: unknown[]): LogEntry | false;
        /**
         * Logs a warning message.
         * @param  {...unknown} args Log arguments
         * @returns {LogEntry|false} Log entry or false if level is too low
         */
        warn(...args: unknown[]): LogEntry | false;
        /**
         * Logs an error message.
         * @param  {...unknown} args Log arguments
         * @returns {LogEntry|false} Log entry or false if level is too low
         */
        error(...args: unknown[]): LogEntry | false;
        /**
         * Logs a fatal error message.
         * @param  {...unknown} args Log arguments
         * @returns {LogEntry|false} Log entry or false if level is too low
         */
        fatal(...args: unknown[]): LogEntry | false;
        #private;
    }
    export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";
    export type LogEntry = {
        /**
         * Log level
         */
        level: LogLevel;
        /**
         * Log type
         */
        type: string;
        /**
         * Log message
         */
        msg?: string;
        /**
         * Log time
         */
        time: Date;
        /**
         * Application name
         */
        app: string;
        /**
         * Error class name
         */
        class?: string;
        /**
         * Error message
         */
        message?: string;
        /**
         * Filtered error stack trace
         */
        stack?: string[];
        /**
         * Filtered stack trace at log capture point
         */
        capture?: string[];
        /**
         * Unique error identifier
         */
        errorId?: string;
        /**
         * Full error stack trace (only in dev environment)
         */
        fullStack?: string;
    };
    export type ErrorProps = {
        /**
         * Error class name
         */
        class?: string;
        /**
         * Error message
         */
        message?: string;
        /**
         * Filtered error stack trace
         */
        stack?: string[];
        /**
         * Error message (duplicate for convenience)
         */
        msg?: string;
        /**
         * Filtered stack trace at log capture point
         */
        capture?: string[];
        /**
         * Unique error identifier
         */
        errorId?: string;
        /**
         * Full error stack trace (only in dev environment)
         */
        fullStack?: string;
    };
    export type LoggerOptions = {
        /**
         * Minimum log level
         */
        level?: LogLevel;
        /**
         * Disable logging if set to false
         */
        disabled?: boolean;
        /**
         * Define the value of the 'app' log entry key
         */
        appName?: string;
    };
}
declare module "types" {
    /**
     * @module types
     * @description Data type detection and conversion. Determines MIME types from data,
     * parses content-type headers, and converts between binary and string formats.
     * @example
     * const contentType = getContentTypeFromData({ foo: 'bar' }); // 'application/json'
     * const { type, charset } = getDataTypeFromContentType('application/json; charset=utf-8');
     * const bytes = await readStream(readableStream);
     */
    /**
     * @typedef {'utf8'|'utf-8'|'utf16le'|'utf-16le'} BufferEncoding
     */
    /**
     * @typedef {'text'|'json'|'urlencoded'|'binary'} ShortType
     */
    /**
     * Get content type header value from data
     * @param {unknown} data Data to determine content type for
     * @returns {'application/json'|'text/plain'|undefined} Content type header value or undefined
     */
    export function getContentTypeFromData(data: unknown): "application/json" | "text/plain" | undefined;
    /**
     * Get data type from content type header value
     * @param {string|string[]|void} [contentType] Content type
     * @returns {{ type?: ShortType, charset?: BufferEncoding }} Data type and charset
     */
    export function getDataTypeFromContentType(contentType?: string | string[] | void): {
        type?: ShortType;
        charset?: BufferEncoding;
    };
    /**
     * Reads all data from a ReadableStream and returns it as a Uint8Array
     * @param {ReadableStream<Uint8Array>} stream The readable stream to read from
     * @returns {Promise<Uint8Array>} The complete stream data as bytes
     */
    export function readStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array>;
    /**
     * Converts a Uint8Array to a string using the specified encoding
     * @param {Uint8Array} bytes The bytes to convert
     * @param {BufferEncoding} encoding The character encoding to use (utf-8, utf-16le, etc)
     * @returns {string} The decoded string
     */
    export function bytesToString(bytes: Uint8Array, encoding: BufferEncoding): string;
    /**
     * Parse binary data according to its type and encoding
     * @param {Uint8Array} bytes The raw bytes to parse
     * @param {ShortType} type The data type (json, urlencoded, text, etc)
     * @param {BufferEncoding} charset The character encoding to use
     * @returns {Object|null|Uint8Array|string|boolean|number} Parsed data (object for json/urlencoded, string for text, raw bytes otherwise)
     */
    export function getDataFromBytesAndTypes(bytes: Uint8Array, type: ShortType, charset: BufferEncoding): any | null | Uint8Array | string | boolean | number;
    export type BufferEncoding = "utf8" | "utf-8" | "utf16le" | "utf-16le";
    export type ShortType = "text" | "json" | "urlencoded" | "binary";
}
declare module "response" {
    /**
     * @typedef ResponseBuildInput
     * @property {import('./native').NativeResponseHandles} [resHandles]
     */
    /**
     * @typedef ResponseInfo
     * @property {number} status
     * @property {{ [header: string]: string | string[] }} headers
     * @property {Response} body
     */
    export class Response {
        /**
         * @param {ResponseBuildInput} input
         */
        constructor(input: ResponseBuildInput);
        /** @type {Promise<ResponseInfo>} */
        ended: Promise<ResponseInfo>;
        /**
         * Write data to the response.
         * @this {Response}
         * @param {string|Uint8Array} chunk
         * @returns {Promise<Response>}
         */
        write(this: Response, chunk: string | Uint8Array): Promise<Response>;
        /**
         * End the response.
         * @this {Response}
         * @param {string|Uint8Array} [body]
         * @returns {Promise<ResponseInfo>}
         */
        end(this: Response, body?: string | Uint8Array): Promise<ResponseInfo>;
        finished: boolean;
        /**
         * Handle an error response
         * Converts various error types to HTTPError and sends appropriate response
         * @param {unknown} statusOrError HTTP status code or Error object
         * @param {string} [message] Error message (required if statusOrError is a number)
         * @param  {...any} args Arguments for message formatting
         * @returns {import('./error').HTTPError} The handled HTTPError instance
         */
        error(statusOrError: unknown, message?: string, ...args: any[]): import("error").HTTPError;
        /**
         * Assert a condition, throwing an HTTPError if the condition is true
         * @param {number} status HTTP status code to return if assertion fails
         * @param {boolean} cond Condition to assert (throws if true)
         * @param {string} [message] Error message
         * @param  {...any} args Arguments for message formatting
         * @returns {void}
         */
        assert(status: number, cond: boolean, message?: string, ...args: any[]): void;
        /**
         * Get a response header.
         * @param {string} k
         * @returns {string|string[]|void}
         */
        get(k: string): string | string[] | void;
        /**
         * Set a response header.
         * @this {Response}
         * @param {string} k
         * @param {string|string[]} v
         * @returns {Response}
         */
        set(this: Response, k: string, v: string | string[]): Response;
        /**
         * Append a value to a response header.
         * @this {Response}
         * @param {string} k
         * @param {string} v
         * @returns {Response}
         */
        append(this: Response, k: string, v: string): Response;
        /**
         * Set the response status code.
         * @this {Response}
         * @param {number} s
         * @returns {Response}
         */
        status(this: Response, s: number): Response;
        /**
         * Set the Content-Type header.
         * @this {Response}
         * @param {string} ct
         * @returns {Response}
         */
        type(this: Response, ct: string): Response;
        /**
         * Send a JSON response.
         * @this {Response}
         * @param {any} data
         * @returns {Response}
         */
        json(this: Response, data: any): Response;
        /**
         * Send a text response.
         * @this {Response}
         * @param {string} data
         * @returns {Response}
         */
        text(this: Response, data: string): Response;
        /**
         * Clear a cookie by setting expiration to past date
         * @param {string} name Cookie name
         * @param {object} [opts] Cookie options (path defaults to '/')
         * @returns {Response} This Response object for chaining
         */
        clearCookie(name: string, opts?: object): Response;
        /**
         * Set a cookie in the response
         * @param {string} name Cookie name
         * @param {string} value Cookie value
         * @param {import('./cookie').CookieOptions} [opts] Cookie options
         * @returns {Response} This Response object for chaining
         */
        cookie(name: string, value: string, opts?: import("cookie").CookieOptions): Response;
        /**
         * Assert a 400 Bad Request condition
         * Throws if the condition is true
         * @param {boolean} cond Condition to assert
         * @param {string} [message] Error message
         * @param  {...any} args Arguments for message formatting
         * @returns {void}
         */
        badRequest(cond: boolean, message?: string, ...args: any[]): void;
        /**
         * Assert a 401 Unauthorized condition
         * Throws if the condition is true
         * @param {boolean} cond Condition to assert
         * @param {string} [message] Error message
         * @param  {...any} args Arguments for message formatting
         * @returns {void}
         */
        unauthorized(cond: boolean, message?: string, ...args: any[]): void;
        /**
         * Assert a 403 Forbidden condition
         * Throws if the condition is true
         * @param {boolean} cond Condition to assert
         * @param {string} [message] Error message
         * @param  {...any} args Arguments for message formatting
         * @returns {void}
         */
        forbidden(cond: boolean, message?: string, ...args: any[]): void;
        /**
         * Assert a 404 Not Found condition
         * Throws if the condition is true
         * @param {boolean} cond Condition to assert
         * @param {string} [message] Error message
         * @param  {...any} args Arguments for message formatting
         * @returns {void}
         */
        notFound(cond: boolean, message?: string, ...args: any[]): void;
        /**
         * Assert a 409 Conflict condition
         * Throws if the condition is true
         * @param {boolean} cond Condition to assert
         * @param {string} [message] Error message
         * @param  {...any} args Arguments for message formatting
         * @returns {void}
         */
        conflict(cond: boolean, message?: string, ...args: any[]): void;
        /**
         * Assert a 410 Gone condition
         * Throws if the condition is true
         * @param {boolean} cond Condition to assert
         * @param {string} [message] Error message
         * @param  {...any} args Arguments for message formatting
         * @returns {void}
         */
        gone(cond: boolean, message?: string, ...args: any[]): void;
        /**
         * Assert a 415 Unsupported Media Type condition
         * Throws if the condition is true
         * @param {boolean} cond Condition to assert
         * @param {string} [message] Error message
         * @param  {...any} args Arguments for message formatting
         * @returns {void}
         */
        badType(cond: boolean, message?: string, ...args: any[]): void;
        /**
         * Get the response stream for manual writing
         * After calling this, you are responsible for closing the stream.
         * Do not use other methods that write to response body after calling this.
         * @returns {WritableStream<Uint8Array|string>} A Web Streams API WritableStream
         */
        stream(): WritableStream<Uint8Array | string>;
        #private;
    }
    export type ResponseBuildInput = {
        resHandles?: import("native").NativeResponseHandles;
    };
    export type ResponseInfo = {
        status: number;
        headers: {
            [header: string]: string | string[];
        };
        body: Response;
    };
    import * as cookie from "cookie";
}
declare module "error" {
    /**
     * Convert any thrown value into an HTTPError instance
     * Maps common error types to appropriate HTTP errors
     * @param {unknown} thing Any value to convert
     * @returns {HTTPError} An HTTPError instance with appropriate status code
     */
    export function anythingToError(thing: unknown): HTTPError;
    /**
     * Builds an HTTPError instance from status and message
     * @param {number} status HTTP status code
     * @param {unknown} message Error message or data
     * @param  {...any} args Arguments for message formatting (if message is a string)
     * @returns {HTTPError} HTTPError instance
     */
    export function buildHTTPError(status: number, message: unknown, ...args: any[]): HTTPError;
    /**
     * @typedef HandleErrorInput
     * @property {import('./api').RequestInfo} reqInfo Request info object
     * @property {import('./response').Response} res HTTP response object
     * @property {import('./logger').Logger} log Logger instance
     */
    /**
     * Handle and respond to errors thrown in route handlers
     * Converts errors to HTTPError, logs appropriately, and sends response
     * @param {unknown} err The thrown/rejected error or value
     * @param {HandleErrorInput} input
     * @returns {HTTPError} The handled HTTPError instance
     */
    export function handleError(err: unknown, { reqInfo, res, log }: HandleErrorInput): HTTPError;
    /**
     * HTTP Error class and handler
     */
    export class HTTPError {
        /**
         * @param {number} status HTTP status code
         * @param {string} [message] Error message
         * @param {import('./types').ShortType} [type] Data type of the message (e.g. 'text', 'json', 'binary')
         */
        constructor(status: number, message?: string, type?: import("types").ShortType);
        status: number;
        type: import("types").ShortType;
        message: string;
    }
    export type HandleErrorInput = {
        /**
         * Request info object
         */
        reqInfo: import("api").RequestInfo;
        /**
         * HTTP response object
         */
        res: import("response").Response;
        /**
         * Logger instance
         */
        log: import("logger").Logger;
    };
}
declare module "body" {
    /**
     * @typedef RequestBodyInput
     * @property {number} [timeout=3000]
     * @property {{ [header: string]: string | string[] }} headers
     * @property {ReadableStream} reqStream
     */
    /**
     * Request body parser class
     */
    export class Body {
        /**
         * @param {RequestBodyInput} input Options
         */
        constructor(input: RequestBodyInput);
        /**
         * Get the underlying request stream
         * @returns {ReadableStream<Uint8Array>} The readable stream
         */
        stream(): ReadableStream<Uint8Array>;
        /**
         * Read raw body data without parsing
         * @returns {Promise<Uint8Array>} The raw body bytes
         */
        raw(): Promise<Uint8Array>;
        /**
         * Parse body as text
         * @returns {Promise<string>} The body text
         */
        text(): Promise<string>;
        /**
         * Parse body as JSON
         * @returns {Promise<any>} The parsed JSON object
         */
        json(): Promise<any>;
        /**
         * Parse body as URL-encoded form data
         * @returns {Promise<Object>} The parsed form data
         */
        urlencoded(): Promise<any>;
        /**
         * Parse body data according to content type
         * @returns {Promise<any>} The parsed body data (object, string, or binary)
         */
        parse(): Promise<any>;
        #private;
    }
    export type RequestBodyInput = {
        timeout?: number;
        headers: {
            [header: string]: string | string[];
        };
        reqStream: ReadableStream;
    };
}
declare module "cors" {
    /**
     * @typedef CORSOptions
     * @property {string|string[]|RegExp|((origin: string) => boolean)} [origin='*']
     * @property {boolean} [credentials=false]
     * @property {string|string[]} [methods='GET,HEAD,PUT,PATCH,POST,DELETE']
     * @property {string|string[]} [allowedHeaders]
     * @property {string|string[]} [exposedHeaders]
     * @property {number|string} [maxAge]
     * @property {boolean} [preflightContinue=false]
     */
    /**
     * Handle CORS headers for a request (both preflight and actual requests)
     * @param {CORSOptions|false} opts CORS options or false to disable CORS
     * @param {string} method HTTP method
     * @param {{ [header: string]: string }} headers Request headers
     * @param {import('./response').Response} res HTTP response object
     * @returns {void}
     */
    export function cors(opts: CORSOptions | false, method: string, headers: {
        [header: string]: string;
    }, res: import("response").Response): void;
    export type CORSOptions = {
        origin?: string | string[] | RegExp | ((origin: string) => boolean);
        credentials?: boolean;
        methods?: string | string[];
        allowedHeaders?: string | string[];
        exposedHeaders?: string | string[];
        maxAge?: number | string;
        preflightContinue?: boolean;
    };
}
declare module "api" {
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
    export class API {
        /**
         * @param {APIContext} context The API context
         * @param {RouteSpec[]} [spec] The API specification
         */
        constructor(context: APIContext, spec?: RouteSpec[]);
        /**
         * Set the fallback route handler for all requests
         * This handler is called only if no route matches
         * @param {import('./api').RouteHandler} handler The fallback route handler
         * @returns {void}
         * @throws {Error} If fallback route is already defined
         * @throws {TypeError} If handler is not a function
         */
        setFallbackRoute(handler: import("api").RouteHandler): void;
        /**
         * Adds an endpoint to the API
         * @param {string} method HTTP method (lowercase or uppercase)
         * @param {string} path HTTP path (with optional :params and * wildcards)
         * @param {import('./api').RouteHandler} handler Route handler function
         * @returns {void}
         * @throws {TypeError} If handler is not a function or path is not a string
         * @throws {Error} If route is already registered
         */
        addEndpoint(method: string, path: string, handler: import("api").RouteHandler): void;
        /**
         * Triggers a route handler
         * @param {string} method HTTP method
         * @param {string} path HTTP path
         * @param {APITriggerInput} input Input object
         * @returns {Promise<import('./response').ResponseInfo>} The response object
         */
        trigger(method: string, path: string, input: APITriggerInput): Promise<import("response").ResponseInfo>;
        #private;
    }
    export type RequestInfo = {
        method: string;
        path: string;
        host: string;
        agent: string;
        type: string;
        msg: string;
    };
    export type BaseInputObject = {
        /**
         * Configuration object
         */
        conf: object;
        /**
         * Parsed cookies
         */
        cookies: object;
        /**
         * Request headers
         */
        headers: object;
        /**
         * Parsed query parameters
         */
        query: object;
        /**
         * Route parameters
         */
        params: object;
        /**
         * HTTP method
         */
        method: string;
        /**
         * HTTP path
         */
        path: string;
        /**
         * Client IP address
         */
        ip: string;
        /**
         * Logger instance
         */
        log: import("logger").Logger;
        /**
         * HTTP response object
         */
        res: import("response").Response;
        /**
         * Request body parser or data
         */
        body: import("body").Body;
        /**
         * Whether the request is a WebSocket upgrade
         */
        websocket?: () => Promise<any>;
        /**
         * Call a function with the current context
         */
        call: (fn: Function, ...args: any[]) => any;
    };
    export type PertialInputObject = Partial<BaseInputObject> & {
        reqStream: ReadableStream;
        resHandles: import("native").NativeResponseHandles;
    };
    export type APITriggerInput = {
        reqStream: ReadableStream<Uint8Array>;
        resHandles: import("native").NativeResponseHandles;
        headers: object;
        query: object;
        cookies: object;
        ip?: string;
        websocket?: () => Promise<WebSocket>;
    };
    export type RouteHandlerArgs = BaseInputObject & {
        [globalKey: string]: unknown;
    };
    export type DynamicRouteSpec = {
        regexp: RegExp;
        handler?: RouteHandler;
        params: string[];
    };
    export type RouteHandler = (args: BaseInputObject) => Promise<void> | void;
    export type RouteSpec = {
        /**
         * HTTP method
         */
        method: string;
        /**
         * HTTP path
         */
        path: string;
        /**
         * Route handler
         */
        handler: RouteHandler;
        /**
         * Whether this is a fallback route for all methods
         */
        all?: boolean;
    };
    export type ParamsObject = {
        [param: string]: string;
    };
    export type APIContext = {
        /**
         * Configuration object
         */
        conf: object;
        /**
         * Logger instance
         */
        log: import("logger").Logger;
        /**
         * Request body parse timeout in milliseconds
         */
        reqBodyTimeout: number;
        /**
         * Whether to auto-parse request bodies
         */
        autoParseBody: boolean;
        /**
         * Global context object
         */
        global: object;
    };
    import { Response } from "response";
    import { Body } from "body";
}
declare module "conf" {
    /**
     * Layer (merge) multiple configuration objects together
     * Recursively combines configuration objects, with later arguments taking precedence
     * @param  {...(string|Object)} subjects Configuration objects or paths to configuration files
     * @returns {Object} A new merged configuration object
     */
    export function layerConf(...subjects: (string | any)[]): any;
}
declare module "main" {
    export class Nodecaf {
        /**
         * Create a GET route.
         * @param {string} path HTTP path
         * @param {import('./api').RouteHandler} handler Route handler
         * @returns {import('./api').RouteSpec}
         */
        static get(path: string, handler: import("api").RouteHandler): import("api").RouteSpec;
        /**
         * Create a POST route.
         * @function
         * @param {string} path HTTP path
         * @param {import('./api').RouteHandler} handler Route handler
         * @returns {import('./api').RouteSpec}
         */
        static post(path: string, handler: import("api").RouteHandler): import("api").RouteSpec;
        /**
         * Create a DELETE route.
         * @function
         * @param {string} path HTTP path
         * @param {import('./api').RouteHandler} handler Route handler
         * @returns {import('./api').RouteSpec}
         */
        static delete(path: string, handler: import("api").RouteHandler): import("api").RouteSpec;
        /**
         * Create a PUT route.
         * @function
         * @param {string} path HTTP path
         * @param {import('./api').RouteHandler} handler Route handler
         * @returns {import('./api').RouteSpec}
         */
        static put(path: string, handler: import("api").RouteHandler): import("api").RouteSpec;
        /**
         * Create a PATCH route.
         * @function
         * @param {string} path HTTP path
         * @param {import('./api').RouteHandler} handler Route handler
         * @returns {import('./api').RouteSpec}
         */
        static patch(path: string, handler: import("api").RouteHandler): import("api").RouteSpec;
        /**
         * Create a DELETE route.
         * @function
         * @param {string} path HTTP path
         * @param {import('./api').RouteHandler} handler Route handler
         * @returns {import('./api').RouteSpec}
        */
        static del(path: string, handler: import("api").RouteHandler): import("api").RouteSpec;
        /**
         * @param {Function} handler
         * @returns {{ all: true, handler: Function }}
         */
        static all(handler: Function): {
            all: true;
            handler: Function;
        };
        /**
         * @param {AppOptions} [opts]
         */
        constructor(opts?: AppOptions);
        /**
         * Returns the current app state
         * @returns {AppState}
         */
        state(): AppState;
        /**
         * Setup or update the application configuration.
         * @this {Nodecaf}
         * @param {...Object} objectOrPath Configuration object or path
         * @returns {void}
         */
        setup(this: Nodecaf, ...objectOrPath: any[]): void;
        log: Logger;
        /**
         * Start the application.
         * @returns {Promise<AppState>} The final state
         */
        start(): Promise<AppState>;
        /**
         * Stop the application.
         * @returns {Promise<AppState>} The final state
         */
        stop(): Promise<AppState>;
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
         * @returns {Promise<import('./response').ResponseInfo>} Response information including status, headers, and body
         */
        trigger(method: string, path: string, input?: {
            body?: unknown;
            headers?: {
                [header: string]: string | string[];
            };
            query?: {
                [key: string]: string;
            };
            cookies?: {
                [key: string]: string;
            };
        }): Promise<import("response").ResponseInfo>;
        /**
         * Restart the application
         * Stops the current instance, updates configuration if provided, and starts again
         * @param {Object|string} [conf] New configuration object or file path to load
         * @returns {Promise<void>}
         */
        restart(conf?: any | string): Promise<void>;
        /**
         * Run the application with configuration file loading
         * Loads configuration files (TOML/JSON), starts the app, and sets up signal handlers
         * @param {RunOptions} [opts] Runtime options
         * @returns {Promise<Nodecaf>} The Nodecaf instance
         */
        run(opts?: RunOptions): Promise<Nodecaf>;
        #private;
    }
    export type RunOptions = {
        /**
         * Configuration object or path
         */
        conf?: any | (any | string)[] | string;
    };
    export type AppState = "starting" | "running" | "stopping" | "standby" | "stuck";
    export type GlobalHandlerArgs = {
        /**
         * A user controlled object whose properties wil be spread in route handler args.
         */
        global: Record<string, unknown>;
        /**
         * A logging utility to output JSON lines to stdout.
         */
        log: import("logger").Logger;
        /**
         * Call `fn` with the request handler args as the first parameter and spreading `args`.
         */
        call: GlobalCall;
        /**
         * The current app configuration.
         */
        conf: any;
    };
    export type GenericHandler = ((this: Nodecaf, input: GlobalHandlerArgs, ...args: any[]) => any);
    export type GlobalCall = <B extends GenericHandler>(fn: B, ...args: DropFirst<Parameters<B>>) => ReturnType<B>;
    export type AppOptions = {
        /**
         * HTTP port number
         */
        http?: number;
        /**
         * Whether to enable WebSocket support
         */
        websocket?: boolean;
        /**
         * Application routes
         */
        routes?: import("api").RouteSpec[];
        /**
         * Startup handler
         */
        startup?: (args: GlobalHandlerArgs) => Promise<void> | void;
        /**
         * Shutdown handler
         */
        shutdown?: (args: GlobalHandlerArgs) => Promise<void> | void;
        /**
         * Custom server builder
         */
        server?: (app: Nodecaf) => import("node:http").Server;
        /**
         * Application name
         */
        name?: string;
        /**
         * Application version
         */
        version?: string;
        /**
         * Initial configuration object or path
         */
        conf?: any;
        /**
         * Whether to auto-parse request bodies
         */
        autoParseBody?: boolean;
        /**
         * Request body parse timeout in milliseconds
         */
        reqBodyTimeout?: number;
    };
    import { Logger } from "logger";
}
