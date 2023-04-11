
const { getDataTypeFromContentType, parseBuffer } = require('./types');

function readStream(){
    let complete, buffer = [];

    const fbto = setTimeout(() => {
        this.emit('error', new Error('Client took too long before starting to send request body'), 408)
    }, 3000);

    this.on('data', chunk => {
        clearTimeout(fbto);
        buffer.push(chunk);
    });

    this.on('close', () => {
        buffer = null;
        this.removeAllListeners();
    });

    this.on('aborted', () =>
        this.emit('error', new Error('Request aborted by the client')));

    return new Promise((resolve, reject) => {

        this.on('end', () => {
            clearTimeout(fbto);
            !complete && resolve(Buffer.concat(buffer));
            complete = true;
        });

        this.on('error', (err, code) => {
            !complete && reject(this.res.error(code ?? 400, err.message));
            complete = true;
        });
    });
}

async function read(parse){
    if(!this.length && !this.type)
        return;

    let out = await readStream.call(this);

    try{
        if(typeof parse == 'function')
            out = parse(out);
    }
    catch(err){
        throw this.res.error(400, 'Invalid format');
    }

    return out;
}

const decorator = {

    raw(){
        return read.call(this);
    },

    text(){
        this.res.badType(!this.charset && this.type != 'text');
        return read.call(this, raw => raw.toString(this.charset));
    },

    json(){
        this.res.badType(this.type != 'json');
        return read.call(this, raw => JSON.parse(raw.toString(this.charset)));
    },

    urlencoded(){
        this.res.badType(this.type != 'urlencoded');
        return read.call(this, raw =>
            Object.fromEntries(new URLSearchParams(raw.toString(this.charset)).entries()));
    },

    parse(){
        return read.call(this, raw => parseBuffer(raw, this.type, this.charset));
    }

};

module.exports.getDecoratedBody = function({ res, headers, body }) {

    const t = getDataTypeFromContentType(headers['content-type']);

    if(!headers['content-type'] && headers['transfer-encoding'] == 'chunked')
        t.type = 'chunked';

    body.type = t.type;
    body.charset = t.charset;
    body.res = res;
    body.length = Number(headers['content-length']);

    Object.assign(body, decorator);

    return body;
}
