
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
 */

/** @type {NativeModule} */
let nativeModule;

if(typeof globalThis.Deno !== 'undefined') 
    // Your code is running in Deno
    throw new Error('Deno runtime is not yet supported');

else if(typeof globalThis.Bun !== 'undefined') 
    // Your code is running in Deno
    throw new Error('Bun runtime is not yet supported');

else if(typeof globalThis.process !== 'undefined' && globalThis.process.release.name === 'node')
    nativeModule = require('./native_node');
else if(typeof globalThis.window !== 'undefined') 
    // Your code is running in a browser
    throw new Error('Browser runtime is not supported');

else
    throw new Error('Your Javascript runtime is not supported');

module.exports = nativeModule;