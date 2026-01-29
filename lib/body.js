const { HTTPError } = require('./error');
const { getDataTypeFromContentType, readStream, bytesToString, getDataFromBytesAndTypes } = require('./types');

/**
 * @typedef RequestBodyInput
 * @property {number} [timeout=3000]
 * @property {{ [header: string]: string | string[] }} headers
 * @property {ReadableStream} reqStream
 */

/**
 * Request body parser class
 */
class Body {

    /** @type {import('./types').ShortType} */
    #_type;

    /** @type {BufferEncoding} */
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

    stream(){
        return this.#_stream;
    }
    
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

    async text(){
        const bytes = await this.raw();
        try{
            return bytesToString(bytes, this.#_charset);
        }
        catch(err){
            console.log('----------------------------------------------------------------------->', err);
            throw new HTTPError(415, 'Invalid text encoding', 'text');
        }
    }

    async json(){
        const bytes = await this.raw();
        if(this.#_type != 'json')
            throw new HTTPError(415, 'Required content type application/json', 'text');
        const str = bytesToString(bytes, 'utf-8');
        try{
            return JSON.parse(str);
        }
        catch(err){
            if(err instanceof SyntaxError)
                throw new HTTPError(400, 'Invalid JSON format', 'text');
            throw err;
        }
    }

    async urlencoded(){
        if(this.#_type != 'urlencoded')
            throw new HTTPError(415);
        return await this.parse();
    }

    async parse(){
        const bytes = await this.raw();
        try{
            return getDataFromBytesAndTypes(bytes, this.#_type, this.#_charset);
        }
        catch(err){
            if(err instanceof SyntaxError)
                throw new HTTPError(400, 'Invalid format', 'text');
            console.log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~>', err);
            throw new HTTPError(400, 'Invalid format', 'text');
        }
    }
}

module.exports = { Body };

