
/**
 * @typedef NativeResponseHandles
 * @property {(statusCode: number) => any} setStatus Set the response status code
 * @property {(header: string, value: string|string[]) => any} setHeader Set a response header
 */

/**
 * @typedef NativeServerHandles
 * @property {() => Promise<void>} close
 */

/**
 * @public
 * @typedef NativeModule
 * 
 * @property {(api: import('./api').API, port: number) => Promise<NativeServerHandles>} createServer
 */

let nativeModule;

if(typeof globalThis.Deno !== 'undefined') 
    // Your code is running in Deno
    throw new Error('Deno runtime is not yet supported');

else if(typeof globalThis.Bun !== 'undefined') 
    // Your code is running in Deno
    throw new Error('Bun runtime is not yet supported');

else if(typeof globalThis.process !== 'undefined' && process.release.name === 'node')
    nativeModule = require('./native_node');
else if(typeof globalThis.window !== 'undefined') 
    // Your code is running in a browser
    throw new Error('Browser runtime is not supported');

else
    throw new Error('Your Javascript runtime is not supported');

module.exports = nativeModule;