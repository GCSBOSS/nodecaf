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

function parseErr({ err }){
    if(!err)
        return {};

    if(!(err instanceof Error))
        err = new Error(err);

    let stack = err.stack.split(/[\r\n]+\s*/g);

    return {
        err: null,
        code: err.code,
        class: err.constructor.name,
        message: err.message,
        stack: stack.slice(1, -1),
        msg: stack[0] + ' ' + stack[1]
    }
}

function parseReq({ req }){
    if(!req)
        return {};
    return {
        req: null,
        method: req.method,
        path: req.url,
        host: req.headers.host,
        agent: req.headers['user-agent'],
        type: 'request',
        msg: 'Received ' + req.method + ' request to ' + req.url
    }
}

function parseRes({ res }){
    if(!res)
        return {};
    let req = res.req;
    return {
        res: null,
        level: res.statusCode > 499 ? 'warn' : 'debug',
        path: req.url,
        status: res.statusCode,
        method: req.method,
        type: 'response',
        msg: 'Sent ' + res.statusCode + ' response to ' + req.method + ' ' + req.url
    };
}

function parseWs({ ws }){
    if(!ws)
        return {};
    let client = ws._socket ? ws._socket.address().address :  ws.addr;
    return { ws: null, type: 'websocket', client };
}

function getEntry(level, ...args){
    let data = typeof args[0] == 'object' ? args.shift() : {};
    let msg = util.format(...args);
    let type = data.type || 'event';

    /* istanbul ignore next */
    let pid = process.pid != 1 ? process.pid : null;

    Object.assign(data, parseErr(data), parseRes(data), parseWs(data),
        parseReq(data));
        
    msg = msg || data.msg;
    return { level, type, ...data, msg, pid, time: new Date() };
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

};
