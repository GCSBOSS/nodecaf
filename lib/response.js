const { sign } = require('cookie-signature');
const cookie = require('./cookie');

const { HTTPError, handleError } = require('./error');
const { getContentTypeFromDataType } = require('./types');

const SHORT_CONTENT_TYPES = {
    'text': 'text/plain',
    'json': 'application/json'
};

const ASSERTS = {
    badRequest: 400,
    unauthorized: 401,
    forbidden: 403,
    notFound: 404,
    conflict: 409,
    gone: 410,
    badType: 415
};

function format(str, ...args){
    let lastPos = 0;
    while(args.length > 0){
        const pos = str.indexOf('%s', lastPos);
        
        if(pos == -1)
            break;

        lastPos = pos;
        if(pos > 0 && str.charAt(pos - 1) == '%'){
            str = str.replace('%%s', '%s', lastPos);
            continue;
        }

        str = str.replace('%s', String(args.shift()));
    }

    if(args.length > 0)
        str += ' ' + args.join(' ');

    return str;
}

const decorator = {

    end(body){

        if(this.finished)
            this.input.log.warn({ err: new Error('Called `res.end()` after response was already finished') });

        body && this.write(body);
        this._realEnd();

        this.input.log.debug({
            ...this.reqInfo,
            status: this.statusCode,
            level: this.statusCode > 499 ? 'warn' : 'debug',
            type: 'response',
            msg: 'Sent ' + this.statusCode + ' response to ' + this.reqInfo.method + ' ' + this.reqInfo.path
        });

        this.finished = true;
        return this.resolve({
            status: this.statusCode,
            headers: this.headers,
            body: this
        });
    },

    // Not necessarily an APP error, but a client Error
    error(status, message, ...args){

        // If it's NOT a status, handle as an Error
        if(!Number.isInteger(status))
            return handleError(status, this.input);

        this.status(status);
        const type = getContentTypeFromDataType(message);

        if(typeof message == 'string')
            message = format(message, ...args);
        else if(type == 'application/json')
            message = JSON.stringify(message);
        else if(type == 'text/plain')
            message = String(message);

        type && this.type(type);
        this.end(message);

        return new HTTPError(status, message, type);
    },

    assert(status, cond, message, ...args){
        if(!cond)
            return true;
        throw this.error(status, message, ...args);
    },

    get(k){
        return this.headers[k.toLowerCase()];
    },

    set(k, v){
        this.setHeader?.(k, v);
        this.headers[k] = v;
        return this;
    },

    append(k, v){
        const prev = this.headers[k];
        prev && (v = Array.isArray(prev)
            ? prev.concat(v)
            : [ prev, v ]);
        return this.set(k, v);
    },

    status(s){
        this.statusCode = s;
        return this;
    },

    type(ct){
        this.set('Content-Type', SHORT_CONTENT_TYPES[ct] || ct);
        return this;
    },

    json(data){
        this.type('json');
        this.end(JSON.stringify(data));
        return this;
    },

    text(data){
        this.type('text');
        this.end(String(data));
        return this;
    },

    clearCookie(name, opts) {
        opts = { path: '/', ...opts, expires: new Date(1) };
        delete opts.maxAge;
        return this.cookie(name, '', opts);
    },

    cookie(name, value, opts = {}) {
        if(opts.signed)
            this.input.log.warn('Setting `signed` cookies is deprecated. This option will be dropped on `v0.14.0`. Cookie signing must be done manually instead.');

        if(value && opts.signed && !this.input.conf.cookie?.secret)
            throw new Error('Trying to sign cookies when secret is not defined');

        if(opts.signed && value)
            value = sign(value, this.input.conf.cookie.secret);
  
        this.append('Set-Cookie', cookie.serialize(name, value, opts));

        return this;
    }
};

module.exports.getDecoratedRes = function (input, reqInfo) {
    const res = input.res;

    res.reqInfo = reqInfo;
    res.input = input;
    res.ended = new Promise((resolve, reject) => {
        res.resolve = resolve;
        res.reject = reject;
    });
    res.headers = {};
    res.statusCode = 200;

    res._realEnd = res.end;

    Object.assign(res, decorator);

    for(const name in ASSERTS)
        res[name] = res.assert.bind(res, ASSERTS[name]);

    return res;
}

// TODO 406 notAcceptable:
// TODO 405 methodNotAllowed
// TODO 408 Request Timeout
// TODO 411 Length Required
// TODO 413 Payload Too Large
// TODO 414 Request-URI Too Long
// TODO for WS: 426 Upgrade Required
// TODO 429 Too Many Requests
// TODO 431 Request Header Fields Too Large
