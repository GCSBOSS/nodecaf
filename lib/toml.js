/**
 * @module toml
 * @description A TOML parser that converts TOML strings into JavaScript objects.   
 * Supports basic and multiline strings, arrays, inline tables, and nested tables. Provides detailed error messages for invalid TOML syntax.
 * @example
 * import { parse } from './toml.js';
 * const tomlString = `
 * [database]
 * server = "localhost"
 * ports = [ 8001, 8001, 8002 ]
 * connection_max = 5000
 * enabled = true
 * `;
 * const config = parse(tomlString);
 * console.log(config.database.server); // "localhost"
 * console.log(config.database.ports); // [8001, 8001, 800
 * console.log(config.database.connection_max); // 5000
 * console.log(config.database.enabled); // true
 */

function isLeap(year) {
    return year % 4 === 0 && year % 100 !== 0 || year % 400 === 0;
}

function success(body) {
    return { ok: true, body };
}

function failure() {
    return { ok: false };
}

function merge(target, source) {
    for(const key in source) 
        if(Object.prototype.hasOwnProperty.call(source, key)) {
            const sourceVal = source[key];
            const targetVal = target[key];

            if(
                sourceVal &&
                typeof sourceVal === 'object' &&
                !Array.isArray(sourceVal) &&
                !(sourceVal instanceof Date) &&
                targetVal &&
                typeof targetVal === 'object'
            ) 
                target[key] = merge(targetVal, sourceVal);
            else
                target[key] = sourceVal;
            
        }
    
    return target;
}

function unflat(keys, values = {}) {
    return keys.reduceRight((acc, key) => {
        return { [key]: acc };
    }, values);
}

function isObject(value) {
    return typeof value === 'object' && value !== null;
}

class Scanner {
    #whitespace = /[ \t]/;
    #position = 0;
    #source;

    constructor(source) {
        this.#source = source;
    }

    get position() {
        return this.#position;
    }

    get source() {
        return this.#source;
    }

    char(index = 0) {
        return this.#source[this.#position + index] ?? '';
    }

    slice(start, end) {
        return this.#source.slice(this.#position + start, this.#position + end);
    }

    next(count = 1) {
        this.#position += count;
    }

    skipWhitespaces() {
        while(this.#whitespace.test(this.char()) && !this.eof()) 
            this.next();
        
        if(!this.isCurrentCharEOL() && /\s/.test(this.char())) {
            const escaped = '\\u' + this.char().charCodeAt(0).toString(16);
            throw new SyntaxError(`Invalid whitespace at position ${this.#position}: ${escaped}`);
        }
    }

    nextUntilChar(options = { skipComments: true }) {
        while(!this.eof()) {
            const char = this.char();
            if(this.#whitespace.test(char) || this.isCurrentCharEOL()) 
                this.next();
            else if(options.skipComments && char === '#') 
                while(!this.isCurrentCharEOL() && !this.eof()) 
                    this.next();
                
            else
                break;
            
        }
    }

    eof() {
        return this.#position >= this.#source.length;
    }

    isCurrentCharEOL() {
        return this.char() === '\n' || this.startsWith('\r\n');
    }

    startsWith(searchString) {
        return this.#source.startsWith(searchString, this.#position);
    }

    match(regExp) {
        if(!regExp.sticky) 
            throw new Error('RegExp must have sticky flag "y"');
        regExp.lastIndex = this.#position;
        return this.#source.match(regExp);
    }
}

function or(parsers) {
    return (scanner) => {
        for(const parse of parsers) {
            const result = parse(scanner);
            if(result.ok) 
                return result;
        }
        return failure();
    };
}

function join(parser, separator) {
    const Separator = character(separator);
    return (scanner) => {
        const out = [];
        const first = parser(scanner);
        if(!first.ok) 
            return success(out);
        
        out.push(first.body);
        while(!scanner.eof()) {
            if(!Separator(scanner).ok) 
                break;
            const result = parser(scanner);
            if(!result.ok) 
                throw new SyntaxError(`Invalid token after "${separator}"`);
            out.push(result.body);
        }
        return success(out);
    };
}

function join1(parser, separator) {
    const Separator = character(separator);
    return (scanner) => {
        const first = parser(scanner);
        if(!first.ok) 
            return failure();
        
        const out = [first.body];
        while(!scanner.eof()) {
            if(!Separator(scanner).ok) 
                break;
            const result = parser(scanner);
            if(!result.ok) 
                throw new SyntaxError(`Invalid token after "${separator}"`);
            out.push(result.body);
        }
        return success(out);
    };
}

function kv(keyParser, separator, valueParser) {
    const Separator = character(separator);
    return (scanner) => {
        const startPos = scanner.position;
        const key = keyParser(scanner);
        if(!key.ok) 
            return failure();
        
        Separator(scanner);
        
        const value = valueParser(scanner);
        if(!value.ok) {
            const lineEnd = scanner.source.indexOf('\n', scanner.position);
            const line = scanner.source.slice(startPos, lineEnd > 0 ? lineEnd : undefined);
            throw new SyntaxError(`Cannot parse value on line: '${line}'`);
        }
        return success(unflat(key.body, value.body));
    };
}

function mergeResults(parser) {
    return (scanner) => {
        const result = parser(scanner);
        if(!result.ok) 
            return failure();
        let body = {};
        for(const record of result.body) 
            if(isObject(record)) 
                body = merge(body, record);
            
        
        return success(body);
    };
}

function repeat(parser) {
    return (scanner) => {
        const body = [];
        while(!scanner.eof()) {
            const result = parser(scanner);
            if(!result.ok) 
                break;
            body.push(result.body);
            scanner.nextUntilChar();
        }
        if(body.length === 0) 
            return failure();
        return success(body);
    };
}

function surround(left, parser, right) {
    const Left = character(left);
    const Right = character(right);
    return (scanner) => {
        if(!Left(scanner).ok) 
            return failure();
        const result = parser(scanner);
        if(!result.ok) 
            throw new SyntaxError(`Invalid token after "${left}"`);
        if(!Right(scanner).ok) 
            throw new SyntaxError(`Missing closing "${right}"`);
        return success(result.body);
    };
}

function character(str) {
    return (scanner) => {
        scanner.skipWhitespaces();
        if(!scanner.startsWith(str)) 
            return failure();
        scanner.next(str.length);
        scanner.skipWhitespaces();
        return success(undefined);
    };
}

const BARE_KEY_REGEXP = /[A-Za-z0-9_-]+/y;
function bareKey(scanner) {
    scanner.skipWhitespaces();
    const match = scanner.match(BARE_KEY_REGEXP);
    if(!match) 
        return failure();
    scanner.next(match[0].length);
    return success(match[0]);
}

function escapeSequence(scanner) {
    if(scanner.char() !== '\\') 
        return failure();
    scanner.next();
    switch(scanner.char()) {
        case 'b': scanner.next(); return success('\b');
        case 't': scanner.next(); return success('\t');
        case 'n': scanner.next(); return success('\n');
        case 'f': scanner.next(); return success('\f');
        case 'r': scanner.next(); return success('\r');
        case '"': scanner.next(); return success('"');
        case '\'': scanner.next(); return success('\''); 
        case '\\': scanner.next(); return success('\\');
        case 'u': 
        case 'U': {
            const len = scanner.char() === 'u' ? 4 : 6;
            const code = parseInt('0x' + scanner.slice(1, 1 + len), 16);
            const str = String.fromCodePoint(code);
            scanner.next(len + 1);
            return success(str);
        }
        default: throw new SyntaxError(`Invalid escape sequence: \\${scanner.char()}`);
    }
}

function basicString(scanner) {
    scanner.skipWhitespaces();
    if(scanner.char() !== '"') 
        return failure();
    scanner.next();
    const acc = [];
    while(scanner.char() !== '"' && !scanner.eof()) {
        if(scanner.char() === '\n') 
            throw new SyntaxError('Single-line string cannot contain EOL');
        const escaped = escapeSequence(scanner);
        if(escaped.ok) 
            acc.push(escaped.body);
        else{
            acc.push(scanner.char());
            scanner.next();
        }
    }
    if(scanner.eof()) 
        throw new SyntaxError('String not closed');
    scanner.next(); 
    return success(acc.join(''));
}

function literalString(scanner) {
    scanner.skipWhitespaces();
    if(scanner.char() !== '\'') 
        return failure();
    scanner.next();
    const acc = [];
    while(scanner.char() !== '\'' && !scanner.eof()) {
        if(scanner.char() === '\n') 
            throw new SyntaxError('Single-line string cannot contain EOL');
        acc.push(scanner.char());
        scanner.next();
    }
    if(scanner.eof()) 
        throw new SyntaxError('String not closed');
    scanner.next();
    return success(acc.join(''));
}

function multilineBasicString(scanner) {
    scanner.skipWhitespaces();
    if(!scanner.startsWith('"""')) 
        return failure();
    scanner.next(3);
    if(scanner.char() === '\n') 
        scanner.next();
    else if(scanner.startsWith('\r\n')) 
        scanner.next(2);

    const acc = [];
    while(!scanner.startsWith('"""') && !scanner.eof()) 
        if(scanner.startsWith('\\\n')) {
            scanner.next(); 
            scanner.nextUntilChar({ skipComments: false });
        }
        else if(scanner.startsWith('\\\r\n')) {
            scanner.next(); 
            scanner.nextUntilChar({ skipComments: false });
        }
        else{
            const escaped = escapeSequence(scanner);
            if(escaped.ok) 
                acc.push(escaped.body);
            else{
                acc.push(scanner.char());
                scanner.next();
            }
        }
    
    if(scanner.eof()) 
        throw new SyntaxError('Multiline string not closed');
    if(scanner.char(3) === '"') { acc.push('"'); scanner.next(); }
    scanner.next(3);
    return success(acc.join(''));
}

function multilineLiteralString(scanner) {
    scanner.skipWhitespaces();
    if(!scanner.startsWith('\'\'\'')) 
        return failure();
    scanner.next(3);
    if(scanner.char() === '\n') 
        scanner.next();
    else if(scanner.startsWith('\r\n')) 
        scanner.next(2);

    const acc = [];
    while(!scanner.startsWith('\'\'\'') && !scanner.eof()) {
        acc.push(scanner.char());
        scanner.next();
    }
    if(scanner.eof()) 
        throw new SyntaxError('Multiline string not closed');
    if(scanner.char(3) === '\'') { acc.push('\''); scanner.next(); }
    scanner.next(3);
    return success(acc.join(''));
}

const BOOLEAN_REGEXP = /(?:true|false)\b/y;
function parseBoolean(scanner) {
    scanner.skipWhitespaces();
    const match = scanner.match(BOOLEAN_REGEXP);
    if(!match) 
        return failure();
    scanner.next(match[0].length);
    return success(match[0] === 'true');
}

const INFINITY_REGEXP = /[+-]?inf\b/y;
function parseInfinity(scanner) {
    scanner.skipWhitespaces();
    const match = scanner.match(INFINITY_REGEXP);
    if(!match) 
        return failure();
    scanner.next(match[0].length);
    const val = match[0].includes('-') ? -Infinity : Infinity;
    return success(val);
}

const NAN_REGEXP = /[+-]?nan\b/y;
function parseNan(scanner) {
    scanner.skipWhitespaces();
    const match = scanner.match(NAN_REGEXP);
    if(!match) 
        return failure();
    scanner.next(match[0].length);
    return success(NaN);
}

const INTEGER_REGEXP = /[+-]?(?:0|[1-9][0-9]*(?:_[0-9]+)*)\b/y;
function parseInteger(scanner) {
    scanner.skipWhitespaces();
    const match = scanner.match(INTEGER_REGEXP);
    if(!match) 
        return failure();
    scanner.next(match[0].length);
    return success(parseInt(match[0].replaceAll('_', ''), 10));
}

const FLOAT_REGEXP = /[+-]?(?:0|[1-9][0-9]*(?:_[0-9]+)*)(?:\.[0-9]+(?:_[0-9]+)*)?(?:e[+-]?[0-9]+(?:_[0-9]+)*)?\b/yi;
function parseFloatVal(scanner) {
    scanner.skipWhitespaces();
    const match = scanner.match(FLOAT_REGEXP);
    if(!match) 
        return failure();
    scanner.next(match[0].length);
    const float = parseFloat(match[0].replaceAll('_', ''));
    return isNaN(float) ? failure() : success(float);
}

const BINARY_REGEXP = /0b[01]+(?:_[01]+)*\b/y;
function parseBinary(scanner) {
    scanner.skipWhitespaces();
    const match = scanner.match(BINARY_REGEXP);
    if(!match) 
        return failure();
    scanner.next(match[0].length);
    return success(parseInt(match[0].slice(2).replaceAll('_', ''), 2));
}

const OCTAL_REGEXP = /0o[0-7]+(?:_[0-7]+)*\b/y;
function parseOctal(scanner) {
    scanner.skipWhitespaces();
    const match = scanner.match(OCTAL_REGEXP);
    if(!match) 
        return failure();
    scanner.next(match[0].length);
    return success(parseInt(match[0].slice(2).replaceAll('_', ''), 8));
}

const HEX_REGEXP = /0x[0-9a-f]+(?:_[0-9a-f]+)*\b/yi;
function parseHex(scanner) {
    scanner.skipWhitespaces();
    const match = scanner.match(HEX_REGEXP);
    if(!match) 
        return failure();
    scanner.next(match[0].length);
    return success(parseInt(match[0].slice(2).replaceAll('_', ''), 16));
}

const DATE_TIME_REGEXP = /(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})(?:[ 0-9TZ.:+-]+)?\b/y;
function parseDateTime(scanner) {
    scanner.skipWhitespaces();
    const match = scanner.match(DATE_TIME_REGEXP);
    if(!match) 
        return failure();
    const str = match[0];
    const { year, month, day } = match.groups;
    
    // Leap year validation
    if(month === '02') {
        const d = parseInt(day);
        if(d > 29 || d > 28 && !isLeap(parseInt(year))) 
            throw new SyntaxError(`Invalid date: ${str}`);
        
    }
    
    const date = new Date(str.trim());
    if(isNaN(date.getTime())) 
        throw new SyntaxError(`Invalid date: ${str}`);
    scanner.next(str.length);
    return success(date);
}

const LOCAL_TIME_REGEXP = /(\d{2}):(\d{2}):(\d{2})(?:\.[0-9]+)?\b/y;
function parseLocalTime(scanner) {
    scanner.skipWhitespaces();
    const match = scanner.match(LOCAL_TIME_REGEXP);
    if(!match) 
        return failure();
    scanner.next(match[0].length);
    return success(match[0]);
}

const dottedKey = join1(or([bareKey, basicString, literalString]), '.');

function parseValue(scanner) {
    return or([
        multilineBasicString, multilineLiteralString,
        basicString, literalString,
        parseBoolean, parseInfinity, parseNan,
        parseDateTime, parseLocalTime,
        parseBinary, parseOctal, parseHex,
        parseFloatVal, parseInteger,
        parseArray, parseInlineTable,
    ])(scanner);
}

function parseArray(scanner) {
    scanner.skipWhitespaces();
    if(scanner.char() !== '[') 
        return failure();
    scanner.next();
    const array = [];
    while(!scanner.eof()) {
        scanner.nextUntilChar();
        const result = parseValue(scanner);
        if(!result.ok) 
            break;
        array.push(result.body);
        scanner.skipWhitespaces();
        if(scanner.char() !== ',') 
            break;
        scanner.next();
    }
    scanner.nextUntilChar();
    if(scanner.char() !== ']') 
        throw new SyntaxError('Array not closed');
    scanner.next();
    return success(array);
}

const pair = kv(dottedKey, '=', parseValue);

function parseInlineTable(scanner) {
    scanner.nextUntilChar();
    if(scanner.char(1) === '}') {
        scanner.next(2);
        return success({});
    }
    const pairs = surround('{', join(pair, ','), '}')(scanner);
    if(!pairs.ok) 
        return failure();
    
    let table = {};
    for(const p of pairs.body) 
        table = merge(table, p);
    
    return success(table);
}

function parseBlock(scanner) {
    scanner.nextUntilChar();
    const result = mergeResults(repeat(pair))(scanner);
    if(result.ok) 
        return success({ type: 'Block', value: result.body });
    return failure();
}

const tableHeader = surround('[', dottedKey, ']');
function parseTable(scanner) {
    scanner.nextUntilChar();
    const header = tableHeader(scanner);
    if(!header.ok) 
        return failure();
    scanner.nextUntilChar();
    const b = parseBlock(scanner);
    return success({
        type: 'Table',
        keys: header.body,
        value: b.ok ? b.body.value : {},
    });
}

const tableArrayHeader = surround('[[', dottedKey, ']]');
function parseTableArray(scanner) {
    scanner.nextUntilChar();
    const header = tableArrayHeader(scanner);
    if(!header.ok) 
        return failure();
    scanner.nextUntilChar();
    const b = parseBlock(scanner);
    return success({
        type: 'TableArray',
        keys: header.body,
        value: b.ok ? b.body.value : {},
    });
}

function deepAssign(target, body) {
    if(body.type === 'Block') 
        return merge(target, body.value);
    

    const { type, keys, value } = body;
    const key = keys[0];
    const currentValue = target[key];

    const nextBody = { type, keys: keys.slice(1), value };

    if(keys.length === 0) 
        return target;

    if(currentValue === undefined) {
        const newValue = keys.length === 1 
            ? type === 'TableArray' ? [value] : value
            : unflat(keys.slice(1), type === 'TableArray' ? [value] : value);
            
        Object.assign(target, { [key]: newValue });
        return target;
    }

    if(Array.isArray(currentValue)) {
        if(type === 'TableArray' && keys.length === 1) 
            currentValue.push(value);
        else{
            const last = currentValue[currentValue.length - 1];
            deepAssign(last, nextBody);
        }
        return target;
    }

    if(isObject(currentValue)) {
        deepAssign(currentValue, nextBody);
        return target;
    }

    throw new Error('Unexpected assignment collision');
}

/** 
 * @param {Scanner} scanner
 * @returns {{ok: boolean, body: object}}
 */
function parseToml(scanner) {
    const blocks = repeat(or([parseBlock, parseTableArray, parseTable]))(scanner);
    if(!blocks.ok) 
        return success({});
    const body = blocks.body.reduce(deepAssign, {});
    return success(body);
}

/**
 * Parses a TOML string and returns the corresponding JavaScript object.
 * @param {string} tomlString - The TOML string to parse.
 * @returns {object} The JavaScript object representation of the TOML string.
 * @throws {SyntaxError} If the TOML string is invalid.
 */
export function parse(tomlString) {
    const scanner = new Scanner(tomlString);
    try{
        const result = parseToml(scanner);
        if(result.ok && scanner.eof()) 
            return result.body;
        
        const message = `Unexpected character: "${scanner.char()}"`;
        throw new SyntaxError(`Parse error at position ${scanner.position}: ${message}`);
    }
    catch(error) {
        throw new SyntaxError(error.message || 'Unknown parsing error');
    }
}