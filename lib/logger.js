const util = require('util');
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
        let uword = (entry.class == 'event' ? entry.level : entry.class).toUpperCase();
        entry.time.setMinutes(entry.time.getMinutes() - entry.time.getTimezoneOffset());
        let utime = entry.time.toISOString().slice(11, -5);
        console.log(LEVELS[entry.level].c + utime + ':', uword, '-', entry.msg + '\x1b[0m');
    }

    // Output complete JSON log for production and staging
    /* istanbul ignore next */
    else if(env !== 'testing')
        console.log(JSON.stringify(entry));
}

function getEntry(level, ...args){
    let time = new Date();
    let data = typeof args[0] == 'object' ? args.shift() : {};
    let msg = util.format(...args);
    let klass = data.class || '';

    return { ...data, pid: process.pid, level, msg, time, class: klass || 'event' };
}

function log(level, ...args){
    let entry = getEntry(level, ...args);
    entry.name = this.name;

    let conf = this.conf.log;
    let badLevel = LEVELS[conf.level].w > LEVELS[level].w;
    let badClass = conf.class && entry.class !== conf.class;
    if(badClass || badLevel)
        return false;

    output(entry);

    return entry;
}

module.exports = class Logger {

    constructor(app){
        app.conf.log = app.conf.log || {};
        app.conf.log.level = app.conf.log.level || 'debug';

        for(let l in LEVELS)
            this[l] = log.bind(app, l);
    }

    server(...args){
        this.info({
            version: this.version,
            port: this.port,
            class: 'server'
        }, ...args);
    }

    err(err, klass, level = 'error'){
        if(!(err instanceof Error))
            err = new Error(err);

        let stack = err.stack.split(/[\r\n]+\s*/g);
        return this[level]({
            ...err,
            code: err.code,
            type: err.constructor.name,
            message: err.message,
            stack: stack.slice(1, -1),
            class: klass
        }, stack[0] + ' ' + stack[1]);
    }

    req(req){
        return this.debug({
            method: req.method,
            path: req.url,
            host: req.headers.host,
            agent: req.headers['user-agent'],
            class: 'request',
        }, 'Received %s request to %s', req.method, req.url);
    }

    res(res, req){
        let level = res.statusCode > 499 ? 'warn' : 'debug';
        return this[level]({
            class: 'response',
            path: req.url,
            status: res.statusCode
        }, 'Sent %s response for %s', res.statusCode, req.url);
    }

    ws(client, req, level, message){
        let addr = req.connection.remoteAddress;
        return this[level]({
            class: 'websocket',
            client: addr
        }, message, addr)
    }

};
