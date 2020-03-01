const util = require('util');
const LEVELS = {
    debug: { w: 0 },
    info: { w: 1 },
    warn: { w: 2 },
    error: { w: 3 },
    fatal: { w: 4 }
};

function output(entry){
    let env = process.env.NODE_ENV;

    // Output friendly log for dev or undfined env
    /* istanbul ignore next */
    if(!env || env === 'development'){
        let uword = (entry.class == 'event' ? entry.level : entry.class).toUpperCase();
        let utime = '[' + entry.time.toString().split(' ').slice(0, 5).join(' ') + ']';
        console.log(utime, uword, '-', entry.msg);
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

    return { ...data, name: this.name, pid: process.pid, level, msg, time,
        class: klass || 'event' }
}

function log(level, ...args){
    let entry = getEntry(level, ...args);

    let conf = this.settings.log;
    let badLevel = LEVELS[conf.level].w > LEVELS[level].w;
    let badClass = conf.class && entry.class !== conf.class;
    if(badClass || badLevel)
        return false;

    output(entry);

    return entry;
}

module.exports = class Logger {

    constructor(app){
        app.settings.log = app.settings.log || {};
        app.settings.log.level = app.settings.log.level || 'debug';

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
        return this.info({
            method: req.method,
            path: req.url,
            host: req.headers.host,
            agent: req.headers['user-agent'],
            class: 'request',
        }, 'Received %s request to %s', req.method, req.url);
    }

    res(res, req){
        return this.info({
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
