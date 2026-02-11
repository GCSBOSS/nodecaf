declare module "conf" {
    /**
     * Layer (merge) multiple configuration objects together
     * Recursively combines configuration objects, with later arguments taking precedence
     * @param  {...Object.<string, unknown>} subjects Configuration objects or paths to configuration files
     * @returns {Object.<string, unknown>} A new merged configuration object
     */
    export function layerConf(...subjects: {
        [x: string]: unknown;
    }[]): {
        [x: string]: unknown;
    };
}
declare module "utils" {
    /**
     * @module utils
     * @description Utility functions for various simple and reusable operations.
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
     * @returns {Object.<string, unknown>|null|Uint8Array|string|boolean|number} Parsed data (object for json/urlencoded, string for text, raw bytes otherwise)
     */
    export function getDataFromBytesAndTypes(bytes: Uint8Array, type: ShortType, charset: BufferEncoding): {
        [x: string]: unknown;
    } | null | Uint8Array | string | boolean | number;
    /**
     * Formats a string by replacing %s placeholders with the given arguments.
     * @param {string} str String with %s placeholders
     * @param  {...unknown} args Arguments to replace placeholders
     * @returns {string} Formatted string
     */
    export function format(str: string, ...args: unknown[]): string;
    /**
     * Formats a number of milliseconds into a human-readable string with appropriate units (ms, s, m, h, d).
     * @param {number} ms Duration in milliseconds
     * @returns {string} Formatted duration string
     */
    export function formatDuration(ms: number): string;
    /**
     * Generates a new random id of 12 alphanumeric characters.
     * Based on https://github.com/simplyhexagonal/short-unique-id
     * @param {number} length Length of the generated ID
     * @returns {string}
     */
    export function getRandomId(length: number): string;
    export class DestroyedRequestError extends Error {
    }
    export type BufferEncoding = "utf8" | "utf-8" | "utf16le" | "utf-16le";
    export type ShortType = "text" | "json" | "urlencoded" | "binary";
}
declare module "logger" {
    /**
     * @typedef LoggerOptions
     * @property {LogLevel} [level] Minimum log level
     * @property {boolean} [disabled] Disable logging if set to false
     * @property {string} [appName] Define the value of the 'app' log entry key
     * @property {Object.<string, unknown>} [extraProps] Extra properties to include in all log entries
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
        /**
         * Creates a new logger instance with the same configuration but extended with the given properties.
         * @param {Object.<string, unknown>} props Extra properties to include in all log entries of the new logger
         * @returns {Logger} New logger instance with extended properties
         */
        extend(props: {
            [x: string]: unknown;
        }): Logger;
        #private;
    }
    export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";
    export type LogEntryProps = {
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
        msg: string;
        /**
         * Log time
         */
        time: Date;
        /**
         * Application name
         */
        app: string;
    };
    export type LogEntry = ErrorProps & LogEntryProps & {
        [x: string]: unknown;
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
        /**
         * Extra properties to include in all log entries
         */
        extraProps?: {
            [x: string]: unknown;
        };
    };
}
declare module "cookie" {
    /**
     * Parses a cookie header string into an object
     * @param {string} header
     * @return {Object.<string, string>}
     */
    export function parse(header: string): {
        [x: string]: string;
    };
    /**
     * @typedef CookieOptions
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
declare module "body" {
    /**
     * @typedef RequestBodyInput
     * @property {number} [timeout=3000]
     * @property {{ [header: string]: string | string[] }} headers
     * @property {ReadableStream} reqStream
     */
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
         * @returns {Promise<number|null|string|boolean|Object.<string, unknown>>} The parsed JSON object
         */
        json(): Promise<number | null | string | boolean | {
            [x: string]: unknown;
        }>;
        /**
         * Parse body as URL-encoded form data
         * @returns {Promise<Object.<string, string>>} The parsed form data
         */
        urlencoded(): Promise<{
            [x: string]: string;
        }>;
        /**
         * Parse body data according to content type
         * @returns {Promise<number|null|string|boolean|Object.<string, unknown>|Uint8Array>} The parsed body data (object, string, or binary)
         */
        parse(): Promise<number | null | string | boolean | {
            [x: string]: unknown;
        } | Uint8Array>;
        #private;
    }
    export type RequestBodyInput = {
        timeout?: number;
        headers: {
            [header: string]: string | string[];
        };
        reqStream: ReadableStream;
    };
    export type RequestInfo = {
        method: string;
        path: string;
        host: string;
        agent: string;
        type: string;
        msg: string;
    };
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
     * @param  {...unknown} args Arguments for message formatting (if message is a string)
     * @returns {HTTPError} HTTPError instance
     */
    export function buildHTTPError(status: number, message: unknown, ...args: unknown[]): HTTPError;
    /**
     * @typedef HandleErrorInput
     * @property {import('./body.js').RequestInfo} reqInfo Request info object
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
         * @param {import('./utils.js').ShortType} [type] Data type of the message (e.g. 'text', 'json', 'binary')
         */
        constructor(status: number, message?: string, type?: import("utils").ShortType);
        status: number;
        type: import("utils").ShortType;
        message: string;
    }
    export type HandleErrorInput = {
        /**
         * Request info object
         */
        reqInfo: import("body").RequestInfo;
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
declare module "response" {
    /**
     * @typedef ResponseBuildInput
     * @property {import('./native').NativeResponseHandles} [resHandles]
     */
    /**
     * @typedef ResponseInfo
     * @property {number} status
     * @property {{ [header: string]: string | string[] }} headers
     * @property {Uint8Array|string|null|number|boolean|Object.<string, unknown>|ReadableStream} [body]
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
         * @param  {...unknown} args Arguments for message formatting
         * @returns {import('./error').HTTPError} The handled HTTPError instance
         */
        error(statusOrError: unknown, message?: string, ...args: unknown[]): import("error").HTTPError;
        /**
         * Assert a condition, throwing an HTTPError if the condition is true
         * @param {number} status HTTP status code to return if assertion fails
         * @param {boolean} cond Condition to assert (throws if true)
         * @param {string} [message] Error message
         * @param  {...unknown} args Arguments for message formatting
         * @returns {void}
         */
        assert(status: number, cond: boolean, message?: string, ...args: unknown[]): void;
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
         * @param {string} v
         * @returns {Response}
         */
        set(this: Response, k: string, v: string): Response;
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
         * @param {null|string|number|boolean|Object.<string, unknown>} data
         * @returns {Response}
         */
        json(this: Response, data: null | string | number | boolean | {
            [x: string]: unknown;
        }): Response;
        /**
         * Send a text response.
         * @this {Response}
         * @param {string} data
         * @returns {Response}
         */
        text(this: Response, data: string, type?: string): Response;
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
         * @param  {...unknown} args Arguments for message formatting
         * @returns {void}
         */
        badRequest(cond: boolean, message?: string, ...args: unknown[]): void;
        /**
         * Assert a 401 Unauthorized condition
         * Throws if the condition is true
         * @param {boolean} cond Condition to assert
         * @param {string} [message] Error message
         * @param  {...unknown} args Arguments for message formatting
         * @returns {void}
         */
        unauthorized(cond: boolean, message?: string, ...args: unknown[]): void;
        /**
         * Assert a 403 Forbidden condition
         * Throws if the condition is true
         * @param {boolean} cond Condition to assert
         * @param {string} [message] Error message
         * @param  {...unknown} args Arguments for message formatting
         * @returns {void}
         */
        forbidden(cond: boolean, message?: string, ...args: unknown[]): void;
        /**
         * Assert a 404 Not Found condition
         * Throws if the condition is true
         * @param {boolean} cond Condition to assert
         * @param {string} [message] Error message
         * @param  {...unknown} args Arguments for message formatting
         * @returns {void}
         */
        notFound(cond: boolean, message?: string, ...args: unknown[]): void;
        /**
         * Assert a 409 Conflict condition
         * Throws if the condition is true
         * @param {boolean} cond Condition to assert
         * @param {string} [message] Error message
         * @param  {...unknown} args Arguments for message formatting
         * @returns {void}
         */
        conflict(cond: boolean, message?: string, ...args: unknown[]): void;
        /**
         * Assert a 410 Gone condition
         * Throws if the condition is true
         * @param {boolean} cond Condition to assert
         * @param {string} [message] Error message
         * @param  {...unknown} args Arguments for message formatting
         * @returns {void}
         */
        gone(cond: boolean, message?: string, ...args: unknown[]): void;
        /**
         * Assert a 415 Unsupported Media Type condition
         * Throws if the condition is true
         * @param {boolean} cond Condition to assert
         * @param {string} [message] Error message
         * @param  {...unknown} args Arguments for message formatting
         * @returns {void}
         */
        badType(cond: boolean, message?: string, ...args: unknown[]): void;
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
        body?: Uint8Array | string | null | number | boolean | {
            [x: string]: unknown;
        } | ReadableStream;
    };
    import * as cookie from "cookie";
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
     * @param {{ [header: string]: string|string[] }} headers Request headers
     * @param {import('./response').Response} res HTTP response object
     * @returns {void}
     */
    export function cors(opts: CORSOptions | false, method: string, headers: {
        [header: string]: string | string[];
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
declare module "instance" {
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
    export class EstelarInstance<Globals> {
        /**
         * @param {import('./api.js').APISpec<Globals>} spec
         * @param {InstanceOptions} [opts]
         */
        constructor(spec: import("api").APISpec<Globals>, opts?: InstanceOptions);
        /**
         * Returns the current app state
         * @returns {AppState}
         */
        state(): AppState;
        /**
         * Setup or update the application configuration.
         * @param {...Object.<string, unknown>} objectOrPath Configuration object or path
         * @returns {void}
         */
        setup(...objectOrPath: {
            [x: string]: unknown;
        }[]): void;
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
         * @returns {Promise<import('./response.js').ResponseInfo>} Response information including status, headers, and body
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
         * @param {Object.<string, unknown>|string} [conf] New configuration object or file path to load
         * @returns {Promise<void>}
         */
        restart(conf?: {
            [x: string]: unknown;
        } | string): Promise<void>;
        #private;
    }
    export type AppState = "starting" | "running" | "stopping" | "standby" | "stuck";
    export type APIContext<Globals> = {
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
         * Global context object
         */
        global: Globals;
    };
    export type RequestInput = {
        reqStream: ReadableStream<Uint8Array>;
        resHandles: import("native").NativeResponseHandles;
        headers: {
            [x: string]: string | string[];
        };
        query: {
            [x: string]: string;
        };
        cookies: {
            [x: string]: string;
        } | string;
        ip?: string;
        websocket?: () => Promise<WebSocket>;
    };
    export type InstanceOptions = {
        /**
         * HTTP port number to listen on
         */
        http?: number;
        /**
         * Configuration object or path
         */
        conf?: {
            [x: string]: unknown;
        };
        /**
         * Whether to setup a global uncaught error handler
         */
        enableUncaughtErrorHandler?: boolean;
        cors?: import("cors").CORSOptions;
        logLevel?: import("logger").LogLevel;
        disableLogs?: boolean;
    };
    import { Logger } from "logger";
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
     * @property {(statusCode: number) => void} setStatus Set the response status code
     * @property {(header: string, value: string) => void} setHeader Set a response header
     * @property {(header: string, value: string) => void} appendHeader
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
     * @typedef {(
     *  method: string,
     *  path: string,
     *  input: import('./instance.js').RequestInput
     * ) => Promise<import('./response.js').ResponseInfo>} APITriggerFunction
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
     * @property {(triggerFunction: APITriggerFunction, port: number, websocketEnabled?: boolean) => Promise<NativeServerHandles>} createServer
     * @property {(data: unknown) => ReadableStream<Uint8Array>|false} nativeDataToWebStream
     * @property {(path: string) => Promise<string>} readFile
     * @property {(handler: () => void) => () => void} setupSignalHandler
     * @property {(handler: (err: Error) => void) => () => void} setupUncaughtErrorHandler
     * @property {() => string} env
     * @property {() => PackageInfo} getPackageInfo
     * @property {() => string[]} argv
     */
    /** @type {NativeModule} */
    export let nativeModule: NativeModule;
    export type NativeResponseHandles = {
        /**
         * Set the response status code
         */
        setStatus: (statusCode: number) => void;
        /**
         * Set a response header
         */
        setHeader: (header: string, value: string) => void;
        appendHeader: (header: string, value: string) => void;
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
    export type APITriggerFunction = (method: string, path: string, input: import("instance").RequestInput) => Promise<import("response").ResponseInfo>;
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
        createServer: (triggerFunction: APITriggerFunction, port: number, websocketEnabled?: boolean) => Promise<NativeServerHandles>;
        nativeDataToWebStream: (data: unknown) => ReadableStream<Uint8Array> | false;
        readFile: (path: string) => Promise<string>;
        setupSignalHandler: (handler: () => void) => () => void;
        setupUncaughtErrorHandler: (handler: (err: Error) => void) => () => void;
        env: () => string;
        getPackageInfo: () => PackageInfo;
        argv: () => string[];
    };
}
declare module "router" {
    /**
     * @typedef MatchResult
     * @property {Function} handler The matched route handler
     * @property {Object.<string, string>} [params] The captured route parameters
     */
    /**
     * Router class for managing HTTP routes with static and dynamic path segments.
     */
    export class Router {
        /**
         * Matches a method and path, returning the handler and captured parameters.
         * @param {string} method HTTP method (e.g., 'GET', 'POST')
         * @param {string} path Request path
         * @returns {MatchResult|false}
         */
        match(method: string, path: string): MatchResult | false;
        /**
         * Adds a new route to the router
         * @param {string} method HTTP method (e.g., 'GET', 'POST')
         * @param {string} path Route path (can include :param and ...wildcard)
         * @param {Function} handler Route handler function
         */
        add(method: string, path: string, handler: Function): void;
        list(): {
            method: string;
            path: string;
        }[];
        #private;
    }
    export type Trie = {
        /**
         * Static children nodes
         */
        static: {
            [x: string]: Trie;
        };
        /**
         * Named parameter child node
         */
        param: Trie | null;
        /**
         * Wildcard child node
         */
        wildcard: Trie | null;
        /**
         * Route handler function
         */
        handler: Function | null;
        /**
         * Named parameter or wildcard name
         */
        paramName: string | null;
    };
    export type MatchResult = {
        /**
         * The matched route handler
         */
        handler: Function;
        /**
         * The captured route parameters
         */
        params?: {
            [x: string]: string;
        };
    };
}
declare module "toml" {
    /**
     * Parses a TOML string and returns the corresponding JavaScript object.
     * @param {string} tomlString - The TOML string to parse.
     * @returns {object} The JavaScript object representation of the TOML string.
     * @throws {SyntaxError} If the TOML string is invalid.
     */
    export function parse(tomlString: string): object;
}
declare module "api" {
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
    export class Estelar<Globals extends {
        [x: string]: unknown;
    }> {
        /**
         * Creates a new Estelar instance
         * @param {APIOptions<Globals>} opts
         */
        constructor(opts?: APIOptions<Globals>);
        /**
         * Create a GET route.
         * @param {string} path HTTP path
         * @param {RouteHandler<Globals>} handler Route handler
         */
        get(path: string, handler: RouteHandler<Globals>): void;
        /**
         * Create a POST route.
         * @function
         * @param {string} path HTTP path
         * @param {RouteHandler<Globals>} handler Route handler
         */
        post(path: string, handler: RouteHandler<Globals>): void;
        /**
         * Create a DELETE route.
         * @function
         * @param {string} path HTTP path
         * @param {RouteHandler<Globals>} handler Route handler
         */
        delete(path: string, handler: RouteHandler<Globals>): void;
        /**
         * Create a PUT route.
         * @function
         * @param {string} path HTTP path
         * @param {RouteHandler<Globals>} handler Route handler
         */
        put(path: string, handler: RouteHandler<Globals>): void;
        /**
         * Create a PATCH route.
         * @function
         * @param {string} path HTTP path
         * @param {RouteHandler<Globals>} handler Route handler
         */
        patch(path: string, handler: RouteHandler<Globals>): void;
        /**
         * Create a DELETE route.
         * @function
         * @param {string} path HTTP path
         * @param {RouteHandler<Globals>} handler Route handler
        */
        del(path: string, handler: RouteHandler<Globals>): void;
        /**
         * Set the fallback route handler for all requests
         * This handler is called only if no route matches
         * @param {RouteHandler<Globals>} handler The fallback route handler
         * @returns {void}
         * @throws {Error} If fallback route is already defined
         * @throws {TypeError} If handler is not a function
         */
        all(handler: RouteHandler<Globals>): void;
        /**
         * @param {RunOptions} [opts] Runtime options
         * @returns {Promise<EstelarInstance>} The Estelar instance
         */
        run(opts?: RunOptions): Promise<EstelarInstance<any>>;
        listRoutes(): {
            method: string;
            path: string;
        }[];
        #private;
    }
    export type APISpec<Globals> = {
        /**
         * Application name
         */
        name: string;
        /**
         * Application version
         */
        version: string;
        /**
         * Function to generate app-wide globals
         */
        globalsGenerator?: (args: GlobalHandlerArgs) => Promise<Globals> | Globals;
        startup?: GlobalHandler<Globals>;
        shutdown?: GlobalHandler<Globals>;
        websocketEnabled?: boolean;
        router: Router;
        api: Estelar<any>;
        /**
         * Request body parse timeout in milliseconds
         */
        reqBodyTimeout: number;
        /**
         * Fallback route handler for all requests
         */
        fallbackRoute?: RouteHandler<Globals>;
    };
    export type RouteCall<Globals> = <B extends (input: RouteHandlerArgs<Globals>, ...args: any[]) => any>(fn: B, ...args: DropFirst<Parameters<B>>) => ReturnType<B>;
    export type BaseInputObject<Globals> = {
        /**
         * Configuration object
         */
        conf: {
            [x: string]: unknown;
        };
        /**
         * Parsed cookies
         */
        cookies: {
            [x: string]: string;
        };
        /**
         * Request headers
         */
        headers: {
            [x: string]: string | string[];
        };
        /**
         * Parsed query parameters
         */
        query: {
            [x: string]: string;
        };
        /**
         * Route parameters
         */
        params: ParamsObject;
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
        websocket?: () => Promise<WebSocket>;
        /**
         * Call a function with the current context
         */
        call: RouteCall<Globals>;
        /**
         * Correlation ID for tracing requests across services
         */
        correlationId: string;
    };
    export type RouteHandlerArgs<Globals> = BaseInputObject<Globals> & Globals;
    export type RouteHandler<Globals> = (args: RouteHandlerArgs<Globals>) => Promise<void> | void;
    export type ParamsObject = {
        [param: string]: string;
    };
    export type RunOptions = {
        /**
         * Configuration object or path
         */
        conf?: {
            [x: string]: unknown;
        } | string;
        /**
         * HTTP port number
         */
        http?: number;
        /**
         * Whether to catch global errors
         */
        enableUncaughtErrorHandler?: boolean;
        cors?: import("cors").CORSOptions;
        logLevel?: import("logger").LogLevel;
        disableLogs?: boolean;
        readConfFromArgv?: boolean;
    };
    export type DropFirst<T extends unknown[]> = T extends [unknown, ...infer U] ? U : [];
    export type GlobalHandlerArgs = {
        /**
         * A logging utility to output JSON lines to stdout.
         */
        log: import("logger").Logger;
        /**
         * The current app configuration.
         */
        conf: {
            [x: string]: unknown;
        };
    };
    export type GlobalCall<Globals> = <Fn extends (input: GlobalHandlerArgs & {
        global: Globals;
    }, ...args: any[]) => any>(fn: Fn, ...args: DropFirst<Parameters<Fn>>) => ReturnType<Fn>;
    export type GlobalHandler<Globals> = (args: GlobalHandlerArgs & {
        global: Globals;
        call: GlobalCall<Globals>;
    }) => Promise<void> | void;
    export type APIOptions<Globals> = {
        /**
         * HTTP port number
         */
        http?: number;
        /**
         * Whether to enable WebSocket support
         */
        websocket?: boolean;
        /**
         * Function to generate app-wide globals
         */
        globals?: (args: GlobalHandlerArgs) => Promise<Globals> | Globals;
        /**
         * Startup handler
         */
        startup?: GlobalHandler<Globals>;
        /**
         * Shutdown handler
         */
        shutdown?: GlobalHandler<Globals>;
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
        conf?: {
            [x: string]: unknown;
        };
        /**
         * Request body parse timeout in milliseconds
         */
        reqBodyTimeout?: number;
    };
    import { EstelarInstance } from "instance";
    import { Router } from "router";
}
declare module "main" {
    export { Estelar } from "./api.js";
}
