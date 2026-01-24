const os = require('os');

const FNV_PRIME = 0x01000193;
const FNV_OFFSET = 0x811c9dc5;
/**
 * Generates 32 bit FNV-1a hash from the given string.
 * As explained here: http://isthe.com/chongo/tech/comp/fnv/
 *
 * @param {string} s String to generate hash from.
 * @param {number} [h] FNV-1a hash generation init value.
 * @returns {number} The result integer hash.
 */
function hash(str) {
    let h = FNV_OFFSET;
    const l = str.length;
    for(let i = 0; i < l; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, FNV_PRIME);
    }
    return h >>> 0;
}

function buildStackSlug(stack, maxFrames = 7) {
    let slug = '';
    let prev = '';
    let count = 0;

    let start = 0;
    const len = stack.length;

    while(start < len && count < maxFrames) {
        let end = stack.indexOf('\n', start);
        if(end === -1) end = len;

        let line = stack.slice(start, end);
        start = end + 1;

        const at = line.indexOf(' at ');
        if(at === -1) continue;

        line = line.slice(at + 4);

        let fn = '';
        let p = line;

        const lp = line.indexOf('(');
        if(lp !== -1) {
            fn = line.slice(0, lp).trim() + ':';
            p = line.slice(lp + 1, -1);
        }

        // Extract basename without regex
        const slash = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
        let base = slash === -1 ? p : p.slice(slash + 1);

        const colon = base.indexOf(':');
        if(colon !== -1) base = base.slice(0, colon);

        const dot = base.lastIndexOf('.');
        if(dot !== -1) base = base.slice(0, dot);

        const entry = fn + base;
        if(entry && entry !== prev) {
            slug += (count ? ';' : '') + entry;
            prev = entry;
            count++;
        }
    }

    return slug;
}

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

function filterStackTrace(stack, skipFrames = 0) {
    const lines = stack.split(/\r?\n\s+/);

    // Drop first line (error message) + skipFrames
    const result = lines.slice(skipFrames + 1);

    // Remove trailing lines containing 'node:'
    while(
        result.length > 0 &&
        result[result.length - 1].includes('node:')
    ) 
        result.pop();
    

    return result;
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
    const logStack = new Error().stack;

    // TODO keep the info inside 'err' key instead of top-level
    
    return {
        code: err.code,
        class: err.constructor.name,
        message: err.message,
        msg: err.message,
        stack: filterStackTrace(err.stack),
        capture: filterStackTrace(logStack, 3),
        errorId: 
            hash(buildStackSlug(err.stack)).toString(16) +
            hash(buildStackSlug(logStack)).toString(16),
        fullStack: isDevEnv
            ? /* istanbul ignore next */ err.stack
            : undefined
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

    msg = msg || data.msg;
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
    const badType = 
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