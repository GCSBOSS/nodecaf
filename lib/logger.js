const os = require('os');

const LEVELS = {
    debug: { w: 0, c: '\x1b[30;5;1m' },
    info: { w: 1, c: '\x1b[0m' },
    warn: { w: 2, c: '\x1b[33m' },
    error: { w: 3, c: '\x1b[31m' },
    fatal: { w: 4, c: '\x1b[41;5;1m' }
};

const isDevEnv = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';

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

function output(entry){

    // Output friendly log for dev or undfined env
    /* istanbul ignore next */
    if(isDevEnv){
        const uword = (entry.type == 'event' ? entry.level : entry.type).toUpperCase();
        entry.time.setMinutes(entry.time.getMinutes() - entry.time.getTimezoneOffset());
        const utime = entry.time.toISOString().slice(11, -5);
        console.log(LEVELS[entry.level].c + utime + ': ' + uword + ' - ' + entry.msg + '\x1b[0m');
    }

    // Output complete JSON log for production and staging
    /* istanbul ignore next */
    else if(process.env.NODE_ENV !== 'testing')
        console.log(JSON.stringify(entry));
}

function extractErrProps(err){
    const stack = err.stack.split(/[\r\n]+\s*/g);
    return {
        code: err.code,
        class: err.constructor.name,
        message: err.message,
        stack: stack.slice(1, -1),
        msg: isDevEnv
            ? /* istanbul ignore next */ err.stack
            : stack[0] + ' ' + stack[1]
    };
}

// TODO remove PID and HOSTNAME
function getEntry(level, args){
    const data = typeof args[0] == 'object' ? args.shift() : {};
    let msg = format(...args);
    const type = data.type ?? 'event';

    /* istanbul ignore next */
    const pid = process.pid != 1 ? process.pid : null;

    if(data.err instanceof Error){
        Object.assign(data, extractErrProps(data.err));
        delete data.err;
    }

    msg = msg ?? data.msg;
    return { level, type, ...data, msg, time: new Date(),
        pid,
        app: this.app._name,
        hostname: this.hostname
    };
}

function log(level, ...args){
    const entry = {
        ...this.defaults,
        ...getEntry.call(this, level, args)
    };

    const badLevel = LEVELS[this.level].w > LEVELS[level].w;
    const badType = this.except.has(entry.type) ||
        this.only.size > 0 && !this.only.has(entry.type);
    if(badType || badLevel)
        return false;

    output(entry);

    return entry;
}

class Logger {

    constructor(app, conf = {}){
        this.app = app;
        this.level = conf.level || 'debug';
        this.only = new Set([].concat(conf.only).filter(a => a));
        this.except = new Set([].concat(conf.except).filter(a => a));
        this.defaults = { ...conf.defaults ?? {} };
        this.hostname = os.hostname();

        const op = conf === false ? () => false : log;

        for(const l in LEVELS)
            this[l] = op.bind(this, l);
    }

};

module.exports = {
    Logger
};