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
 * @property {(header: string, value: string|string[]) => void} setHeader Set a response header
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
export let nativeModule;

/**
 * Detect runtime environment and import appropriate native module
 * Supports Node.js, with planned support for Bun and Deno
 */
/* c8 ignore next 4 */
if(typeof globalThis.Deno !== 'undefined') 
    throw new Error('Deno runtime is not yet supported');
else if(typeof globalThis.Bun !== 'undefined') 
    throw new Error('Bun runtime is not yet supported');
else if(typeof globalThis.process !== 'undefined' && globalThis.process.release.name === 'node')
    nativeModule = (await import('./native_node.js')).nativeNodeModule;
/* c8 ignore next 4 */
else if(typeof globalThis.window !== 'undefined') 
    throw new Error('Browser runtime is not supported');
else
    throw new Error('Your Javascript runtime is not supported');
