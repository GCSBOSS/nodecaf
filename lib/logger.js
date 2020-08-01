const util = require('util');
const stdout = require('stdout-stream');
const LEVELS = {
    debug: { w: 0, c: '\x1b[30;5;1m' },
    info: { w: 1, c: '\x1b[0m' },
    warn: { w: 2, c: '\x1b[33m' },
    error: { w: 3, c: '\x1b[31m' },
    fatal: { w: 4, c: '\x1b[41;5;1m' }
};

function output(entry){
    let env = process.env.NODE_ENV;

    // Output friendly log for dev or undfined env
    /* istanbul ignore next */
    if(!env || env === 'development'){
        let uword = (entry.type == 'event' ? entry.level : entry.type).toUpperCase();
        entry.time.setMinutes(entry.time.getMinutes() - entry.time.getTimezoneOffset());
        let utime = entry.time.toISOString().slice(11, -5);
        stdout.write(LEVELS[entry.level].c + utime + ': ' + uword + ' - ' + entry.msg + '\x1b[0m\n');
    }

    // Output complete JSON log for production and staging
    /* istanbul ignore next */
    else if(env !== 'testing')
        stdout.write(JSON.stringify(entry) + '\n');
}

function getEntry(level, ...args){
    let time = new Date();
    let data = typeof args[0] == 'object' ? args.shift() : {};
    let msg = util.format(...args);
    let type = data.type || 'event';
    let pid = process.pid != 1 ? process.pid : null;
    return { ...data, pid, level, msg, time, type };
}

function log(level, ...args){
    let entry = getEntry(level, ...args);
    entry.app = this._app._name;

    let badLevel = LEVELS[this._conf.level].w > LEVELS[level].w;
    let badClass = this._conf.type && entry.type !== this._conf.type;
    if(badClass || badLevel)
        return false;

    output(entry);

    return entry;
}

module.exports = class Logger {

    constructor(app){
        this._app = app;

        let op = app.conf.log === false ? () => false : log;

        this._conf = app.conf.log || {};
        this._conf.level = this._conf.level || 'debug';

        for(let l in LEVELS)
            this[l] = op.bind(this, l);
    }

    server(...args){
        this.info({
            version: this.version,
            port: this.port,
            type: 'server'
        }, ...args);
    }

    err(err, klass, level = 'error'){
        if(!(err instanceof Error))
            err = new Error(err);

        let stack = err.stack.split(/[\r\n]+\s*/g);
        return this[level]({
            ...err,
            code: err.code,
            class: err.constructor.name,
            message: err.message,
            stack: stack.slice(1, -1),
            type: klass
        }, stack[0] + ' ' + stack[1]);
    }

    req(req){
        return this.debug({
            method: req.method,
            path: req.url,
            host: req.headers.host,
            agent: req.headers['user-agent'],
            type: 'request',
        }, 'Received %s request to %s', req.method, req.url);
    }

    res(res, req){
        let level = res.statusCode > 499 ? 'warn' : 'debug';
        return this[level]({
            type: 'response',
            path: req.url,
            status: res.statusCode
        }, 'Sent %s response for %s', res.statusCode, req.url);
    }

    ws(client, req, level, message){
        let addr = req.connection.remoteAddress;
        return this[level]({
            type: 'websocket',
            client: addr
        }, message, addr)
    }

};
