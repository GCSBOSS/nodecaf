
const { getDataTypeFromContentType, parseBuffer } = require('./types');

function readStream(){
    var complete, buffer = [];

    this.stream.on('data', chunk => buffer.push(chunk));

    this.stream.on('close', () => {
        buffer = null;
        this.stream.removeAllListeners('aborted');
        this.stream.removeAllListeners('data');
        this.stream.removeAllListeners('end');
        this.stream.removeAllListeners('error');
        this.stream.removeAllListeners('close');
    });

    return new Promise((resolve, reject) => {

        this.stream.on('aborted', () =>
            this.stream.emit('error', new Error('Request aborted by the client')));

        this.stream.on('end', () => {
            !complete && resolve(Buffer.concat(buffer));
            complete = true;
        });

        this.stream.on('error', err => {
            !complete && reject(err);
            complete = true;
        });
    });
}

async function read(parse){

    let out = await readStream.call(this);

    if(typeof parse == 'function')
        out = parse(out);

    return out;
}

module.exports = class RequestBody {

    constructor({ res, headers, body }){
        const t = getDataTypeFromContentType(headers['content-type']);
        this.type = t.type;
        this.charset = t.charset;
        this.stream = body;
        this.res = res;
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
