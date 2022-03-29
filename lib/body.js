
const { getDataTypeFromContentType, parseBuffer } = require('./types');

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

    if(!this.req)
        return this.origBody;

    let out = await readStream.call(this);

    if(typeof parse == 'function')
        out = parse(out);

    return out;
}

module.exports = class RequestBody {

    constructor({ res, headers, body }, stream){
        const t = getDataTypeFromContentType(headers['content-type']);
        this.type = t.type;
        this.charset = t.charset;
        this.req = stream;
        this.res = res;
        this.origBody = body;
        this.length = headers['content-length'];
    }

    raw(){
        return read.call(this);
    }

    text(){
        this.res.badType(!this.charset && this.type != 'text');
        return read.call(this, raw => raw.toString(this.charset));
    }

    json(){
        this.res.badType(this.type != 'json');
        return read.call(this, raw => JSON.parse(raw.toString(this.charset)));
    }

    urlencoded(){
        this.res.badType(this.type != 'urlencoded');
        return read.call(this, raw =>
            Object.fromEntries(new URLSearchParams(raw.toString(this.charset)).entries()));
    }

    parse(){
        return read.call(this, raw => parseBuffer(raw, this.type, this.charset));
    }

}
