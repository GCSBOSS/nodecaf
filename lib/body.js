/**
 * @module body
 * @description Request body parser. Reads and decodes incoming HTTP request bodies with support for
 * JSON, URL-encoded, text, and binary formats.
 * @example
 * const body = new Body({ reqStream, headers, timeout: 5000 });
 * const jsonData = await body.json();
 * const textData = await body.text();
 */

import { HTTPError } from './error.js';
import { getDataTypeFromContentType, readStream, bytesToString, getDataFromBytesAndTypes } from './types.js';

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

    /** @type {import('./types').ShortType} */
    #_type;

    /** @type {import('./types').BufferEncoding} */
    #_charset;

    /** @type {number|void} */
    #_length;

    /** @type {number} */
    #_timeout;

    /** @type {ReadableStream} */
    #_stream;

    /**
     * @param {RequestBodyInput} input Options
     */
    constructor(input){
        const t = getDataTypeFromContentType(input.headers['content-type']);
        this.#_type = t.type;
        this.#_charset = t.charset;
        if(input.headers['content-length'])
            this.#_length = Number(input.headers['content-length']);
        this.#_timeout = input.timeout ?? 3000;
        this.#_stream = input.reqStream;
    }

    /** 
     * Get the underlying request stream
     * @returns {ReadableStream<Uint8Array>} The readable stream
     */
    stream(){
        return this.#_stream;
    }
    
    /**
     * Read raw body data without parsing
     * @returns {Promise<Uint8Array>} The raw body bytes
     */
    async raw(){
        // if(!this.#_length && !this.#_type)
        //     throw new HTTPError(411, 'Content-Length header required', 'text');

        let rto;

        const streamP = readStream(this.#_stream);

        const toP = new Promise((_, reject) =>
            rto = setTimeout(
                () => reject(
                    new HTTPError(408, 'Client took too long to finish sending request body', 'text')
                ), 
                this.#_timeout
            ));

        try{
            return await Promise.race([
                streamP,
                toP
            ]);
        }
        catch(err){
            if(err.status === 408)
                streamP.catch(() => {}); 
            

            // Normal error handling
            if(err.code === 'ECONNRESET' || err.message.includes('aborted'))
                throw new HTTPError(400, 'Request aborted by client'); 
            
            throw err;
        }
        finally{
            clearTimeout(rto);
        }
    }

    /**
     * Parse body as text
     * @returns {Promise<string>} The body text
     */
    async text(){
        const bytes = await this.raw();
        return bytesToString(bytes, this.#_charset);
    }

    /**
     * Parse body as JSON
     * @returns {Promise<number|null|string|boolean|Object.<string, unknown>>} The parsed JSON object
     */
    async json(){
        if(this.#_type != 'json')
            throw new HTTPError(415, 'Required content type application/json', 'text');
        const bytes = await this.raw();
        const str = bytesToString(bytes, 'utf-8');
        try{
            return JSON.parse(str);
        }
        catch(err){
            // JSON.parse only throws SyntaxError; if charset were invalid,
            // bytesToString would have thrown above
            if(err instanceof SyntaxError)
                throw new HTTPError(400, 'Invalid JSON format', 'text');
            // This should never execute in practice
            /* c8 ignore next */
            throw err;
        }
    }

    /**
     * Parse body as URL-encoded form data
     * @returns {Promise<Object.<string, string>>} The parsed form data
     */
    async urlencoded(){
        if(this.#_type != 'urlencoded')
            throw new HTTPError(415, 'Required content type application/x-www-form-urlencoded', 'text');
        const bytes = await this.raw();
        const str = bytesToString(bytes, 'utf-8');
        const params = new URLSearchParams(str);
        /** @type {Object.<string, string>} */
        const result = {};
        for(const [ key, value ] of params.entries())
            result[key] = value;
        return result;
    }

    /**
     * Parse body data according to content type
     * @returns {Promise<number|null|string|boolean|Object.<string, unknown>|Uint8Array>} The parsed body data (object, string, or binary)
     */
    async parse(){
        const bytes = await this.raw();
        try{
            return getDataFromBytesAndTypes(bytes, this.#_type, this.#_charset);
        }
        catch(err){
            if(err instanceof SyntaxError)
                throw new HTTPError(400, 'Invalid format', 'text');

            // This should never execute in practice since only JSON.parse can throw SyntaxError
            // inside 'getDataFromBytesAndTypes'
            /* c8 ignore next */
            throw new HTTPError(400, 'Invalid format', 'text');
        }
    }
}
