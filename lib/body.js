
const querystring = require('querystring');
const contentType = require('content-type');

const FALLBACK_CONTENT_TYPE = { type: 'text/plain', parameters: { charset: 'utf-8' } };

function parseContentType(headers){
    try{
        var ct = contentType.parse(headers['content-type']);
    }
    catch(err){
        ct = FALLBACK_CONTENT_TYPE;
    }

    ct.textCharset = ct.parameters.charset || 'utf-8';
    ct.originalCharset = ct.parameters.charset;

    return ct;
}

function readStream(){
    var complete, buffer = [];

    this.req.on('data', chunk => buffer.push(chunk));

    this.req.on('close', () => {
        buffer = null;
        this.req.removeAllListeners('aborted');
        this.req.removeAllListeners('data');
        this.req.removeAllListeners('end');
        this.req.removeAllListeners('error');
        this.req.removeAllListeners('close');
    });

    return new Promise((resolve, reject) => {

        this.req.on('aborted', () =>
            this.req.emit('error', new Error('Request aborted by the client')));

        this.req.on('end', () => {
            !complete && resolve(Buffer.concat(buffer));
            complete = true;
        });

        this.req.on('error', err => {
            !complete && reject(err);
            complete = true;
        });
    });
}

async function read(parse){

    if(!this.res.res)
        return this.origBody;

    let out = await readStream.call(this);

    if(typeof parse == 'function')
        out = parse(out);

    return out;
}

module.exports = class RequestBody {

    constructor({ res, headers, body }, stream){
        Object.assign(this, parseContentType(headers));
        this.req = stream;
        this.res = res;
        this.origBody = body;
        this.length = headers['content-length'];
    }

    raw(){
        return read.call(this);
    }

    async text(){
        this.res.badType(!this.originalCharset && this.type.slice(0, 4) != 'text');
        return await read.call(this, raw => raw.toString(this.textCharset));
    }

    async urlencoded(){
        this.res.badType(this.type != 'application/x-www-form-urlencoded');
        return await read.call(this, raw =>
            querystring.parse(raw.toString(this.textCharset)));
    }

    async json(){
        this.res.badType(this.type.slice(-4) != 'json');
        return await read.call(this, raw =>
            JSON.parse(raw.toString(this.textCharset)));
    }

    parse(){

        if(this.type.slice(-4) == 'json')
            return this.json();

        if(this.type == 'application/x-www-form-urlencoded')
            return this.urlencoded();

        if(this.originalCharset || this.type.slice(0, 4) == 'text')
            return this.text();

        return this.raw();
    }

}
