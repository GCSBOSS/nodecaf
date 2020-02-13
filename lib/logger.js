const util = require('util');
const LEVELS = [ 'debug', 'info', 'warn', 'error', 'fatal' ];

function getEntry(level, ...args){
    let time = new Date();
    let data = typeof args[0] == 'object' ? args.shift() : {};
    let msg = util.format(...args);
    let klass = data.class ? data.class.toUpperCase() : '';

    return { ...data, name: this.name, pid: process.pid, level, msg, time,
        class: klass || 'EVENT' }
}

function log(level, ...args){
    let entry = getEntry(level, ...args);
    let utime = entry.time.toString().split(' ').slice(0, 5).join(' ');
    let uword = entry.class == 'EVENT' ? level : entry.class;

    /* istanbul ignore next */
    if(!process.env.NODE_ENV)
        console.log(`[${utime}] ${uword} - ${entry.msg}`);
    else if(process.env.NODE_ENV == 'production')
        /* istanbul ignore next */
        console.log(JSON.stringify(entry));

    return entry;
}

module.exports = class Logger {

    constructor(app){
        LEVELS.forEach(l => this[l] = log.bind(app, l.toUpperCase()));
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

};
