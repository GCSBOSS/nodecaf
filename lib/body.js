const { HTTPError } = require('./error');
const { getDataTypeFromContentType, parseBuffer, readStream, bytesToString, getDataFromBytesAndTypes } = require('./types');

/**
 * @typedef RequestBodyOptions
 * @property {number} [timeout=3000]
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

    /** @type {RequestBodyOptions} */
    #_options;

    /** @type {ReadableStream} */
    #_stream;

    /**
     * @param {import('./api').PertialInputObject} input Input object
     * @param {RequestBodyOptions} options Options
     */
    constructor(input, options = {}){
        const t = getDataTypeFromContentType(input.headers['content-type']);
        this.#_type = t.type;
        this.#_charset = t.charset;
        if(input.headers['content-length'])
            this.#_length = Number(input.headers['content-length']);
        this.#_options = options;
        this.#_stream = input.reqStream;
    }

    async stream(){
        return this.#_stream;
    }
    
    async raw(){
        // if(!this.#_length && !this.#_type)
        //     throw new HTTPError(411, 'Content-Length header required', 'text');

        let rto;

        const toP = new Promise((_, reject) =>
            rto = setTimeout(
                () => reject(
                    new HTTPError(408, 'Client took too long to finish sending request body', 'text')
                ), 
                this.#_options.timeout ?? 3000
            ));

        const out = await Promise.race([
            readStream(this.#_stream),
            toP
        ]);

        clearTimeout(rto);

        return out;
    }

    async text(){
        const bytes = await this.raw();
        try{
            return bytesToString(bytes, this.#_charset);
        }
        catch(err){
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
            throw new HTTPError(415, 'Invalid JSON format', 'text');
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
            throw new HTTPError(400, 'Invalid format', 'text');
        }
    }
}

module.exports = { Body };

