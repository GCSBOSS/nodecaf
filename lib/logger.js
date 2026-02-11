/**
 * @module logger
 * @description Structured JSON logging. Provides leveled logging (debug, info, warn, error, fatal)
 * with error stack trace extraction and environment-specific output formatting.
 * @example
 * const logger = new Logger({ level: 'info', appName: 'myapp' });
 * logger.info('Server started');
 * logger.error({ err: someError }, 'Failed to connect');
 */

import { nativeModule } from './native.js';
import { format } from './utils.js';

const FNV_PRIME = 0x01000193;
const FNV_OFFSET = 0x811c9dc5;

/**
 * Generates 32 bit FNV-1a hash from the given string.
 * As explained here: http://isthe.com/chongo/tech/comp/fnv/
 *
 * @param {string} str String to generate hash from.
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

/**
 * Builds a stack slug from the given stack trace.
 * @param {string} stack Stack trace
 * @param {number} [maxFrames=7] Maximum number of frames to include
 * @returns {string} Stack slug
 */
function buildStackSlug(stack, maxFrames = 7) {
    let slug = '';
    let prev = '';
    let count = 0;

    let start = 0;
    const len = stack.length;

    while(start < len && count < maxFrames) {
        let end = stack.indexOf('\n', start);
        if(end === -1) 
            end = len;

        let line = stack.slice(start, end);
        start = end + 1;

        const at = line.indexOf(' at ');
        if(at === -1) 
            continue;

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
        if(colon !== -1) 
            base = base.slice(0, colon);

        const dot = base.lastIndexOf('.');
        if(dot !== -1) 
            base = base.slice(0, dot);

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
    debug: { w: 0, c: '\x1b[2m' },
    info: { w: 1, c: '\x1b[0m' },
    warn: { w: 2, c: '\x1b[33m' },
    error: { w: 3, c: '\x1b[31m' },
    fatal: { w: 4, c: '\x1b[41;5;1m' }
};

let env;
setImmediate(() => {
    env = nativeModule.env();
});

/**
 * Filters stack trace lines to remove unnecessary frames
 * @param {string} stack Stack trace string
 * @param {number} [skipFrames=0] Number of frames to skip from the top
 * @returns {string[]} Filtered stack trace lines
 */
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

/**
 * @typedef {'debug'|'info'|'warn'|'error'|'fatal'} LogLevel
 */

/**
 * @typedef LogEntryProps
 * @property {LogLevel} level Log level
 * @property {string} type Log type
 * @property {string} msg Log message
 * @property {Date} time Log time
 * @property {string} app Application name
 */

/**
 * @typedef {ErrorProps & LogEntryProps & Object.<string, unknown>} LogEntry
 */

/**
 * @typedef ErrorProps
 * @property {string} [class] Error class name
 * @property {string} [message] Error message
 * @property {string[]} [stack] Filtered error stack trace
 * @property {string} [msg] Error message (duplicate for convenience)
 * @property {string[]} [capture] Filtered stack trace at log capture point
 * @property {string} [errorId] Unique error identifier
 */

/**
 * Outputs the log entry to stdout
 * Format depends on environment (development outputs friendly text, production outputs JSON)
 * @param {LogEntry} entry The log entry to output
 * @returns {void}
 */
function output(entry){

    // Output friendly log for dev or undfined env
    if(env === 'development'){
        const uword = (entry.type == 'event' ? entry.level : entry.type).toUpperCase();
        entry.time.setMinutes(entry.time.getMinutes() - entry.time.getTimezoneOffset());
        const utime = entry.time.toISOString().slice(11, -5);
        console.log(LEVELS[entry.level].c + utime + ': ' + uword + ' - ' + entry.msg + '\x1b[0m');
    }

    // Output complete JSON log for production and staging
    else if(env !== 'testing')
        console.log(JSON.stringify(entry));
}

/**
 * Extracts error properties for logging
 * @param {Error} err Error object to extract properties from
 * @returns {ErrorProps} Extracted error properties including stack traces and error ID
 */
function extractErrProps(err){
    const logStack = new Error().stack;

    // TODO keep the info inside 'err' key instead of top-level
    
    if(env == 'development')
        console.log(err);

    return {
        class: err.constructor.name,
        message: err.message,
        msg: err.message,
        stack: filterStackTrace(err.stack),
        capture: filterStackTrace(logStack, 4),
        errorId: 
            hash(buildStackSlug(err.stack)).toString(16) +
            hash(buildStackSlug(logStack)).toString(16)
    };
}

/**
 * @typedef LoggerOptions
 * @property {LogLevel} [level] Minimum log level
 * @property {boolean} [disabled] Disable logging if set to false
 * @property {string} [appName] Define the value of the 'app' log entry key
 * @property {Object.<string, unknown>} [extraProps] Extra properties to include in all log entries
 */

/**
 * Logger class
 * @class
 * @property {string} level Current log level
 * @property {string} _appName Application name
 */
export class Logger {

    /** @type {string} */
    #_appName;

    /** @type {LogLevel} */
    #_minLevel;

    /** @type {boolean} */
    #_disabled = false;

    /** @type {Object.<string, unknown>} */
    #_extraProps;

    /**
     * @param {LoggerOptions} [options] Logger configuration
     */
    constructor(options = {}){
        this.#_appName = options.appName;
        this.#_minLevel = options.level ?? 'debug';
        this.#_disabled = options.disabled ?? false;
        this.#_extraProps = options.extraProps ?? {};
    }

    /**
     * Logs a debug message.
     * @param  {...unknown} args Log arguments
     * @returns {LogEntry|false} Log entry or false if level is too low
     */
    debug(...args){
        return this.#_log('debug', ...args);
    }

    /**
     * Logs an info message.
     * @param  {...unknown} args Log arguments
     * @returns {LogEntry|false} Log entry or false if level is too low
     */
    info(...args){
        return this.#_log('info', ...args);
    }

    /**
     * Logs a warning message.
     * @param  {...unknown} args Log arguments
     * @returns {LogEntry|false} Log entry or false if level is too low
     */
    warn(...args){
        return this.#_log('warn', ...args);
    }

    /**
     * Logs an error message.
     * @param  {...unknown} args Log arguments
     * @returns {LogEntry|false} Log entry or false if level is too low
     */
    error(...args){
        return this.#_log('error', ...args);
    }

    /**
     * Logs a fatal error message.
     * @param  {...unknown} args Log arguments
     * @returns {LogEntry|false} Log entry or false if level is too low
     */
    fatal(...args){
        return this.#_log('fatal', ...args);
    }

    /**
     * Logs a message at the given level.
     * @param {LogLevel} level Log level
     * @param  {...unknown} args Log arguments
     * @returns {LogEntry|false} Log entry or false if level is too low
     */
    #_log(level, ...args){
        const entry = this.#_getEntry(level, args);

        const badLevel = LEVELS[this.#_minLevel].w > LEVELS[level].w;
        if(badLevel || this.#_disabled)
            return false;

        output(entry);

        return entry;
    }

    /** 
     * Constructs a log entry from the given level and arguments
     * @param {LogLevel} level Log level
     * @param {unknown[]} args Log arguments (first can be object with metadata, rest are message params)
     * @returns {LogEntry} Constructed log entry
     */
    #_getEntry(level, args){
        /** @type {Object.<string, any>} */
        const data = typeof args[0] == 'object' ? args.shift() : {};

        const type = data.type ?? 'event';

        if(data.err instanceof Error){
            Object.assign(data, extractErrProps(data.err));
            // TODO replace err with data instead of spread? It's even better performance.
            delete data.err;
        }

        const msg = String(args[0] ? args.shift() : data.msg ?? '');

        return { 
            level, type, 
            ...data, 
            ...this.#_extraProps,
            msg: format(msg, ...args), 
            time: new Date(),
            app: this.#_appName
        };
    }

    /**
     * Creates a new logger instance with the same configuration but extended with the given properties.
     * @param {Object.<string, unknown>} props Extra properties to include in all log entries of the new logger
     * @returns {Logger} New logger instance with extended properties
     */
    extend(props){
        const newLogger = new Logger({
            appName: this.#_appName,
            level: this.#_minLevel,
            disabled: this.#_disabled,
            extraProps: { ...this.#_extraProps, ...props }
        });
        return newLogger;
    }
}

