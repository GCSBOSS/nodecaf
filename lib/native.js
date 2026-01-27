/* global Bun, Deno, window */

/** @typedef {import('./main')} Nodecaf */

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
 * @property {(app: Nodecaf, port: number) => Promise<NativeServerHandles>} createServer
 */



let nativeModule;

if(typeof Deno !== 'undefined') {
    // Your code is running in Deno
    throw new Error('Deno runtime is not yet supported');
}
else if(typeof Bun !== 'undefined') {
    // Your code is running in Deno
    throw new Error('Bun runtime is not yet supported');
}
else if(typeof process !== 'undefined' && process.release.name === 'node')
    nativeModule = require('./native_node');
else if(typeof window !== 'undefined') {
    // Your code is running in a browser
    throw new Error('Browser runtime is not supported');
}
else
    throw new Error('Your Javascript runtime is not supported');

module.exports = nativeModule;