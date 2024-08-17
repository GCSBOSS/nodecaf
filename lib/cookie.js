/**
 * field-content in RFC 7230 sec 3.2
 */
const fieldContentRegExp = /^[\u0009\u0020-\u007e\u0080-\u00ff]+$/;

/**
 * @param {string} header
 * @param {object} [options]
 * @return {object}
 * @public
 */
function parse(header) {
    if(typeof header !== 'string')
        throw new TypeError('argument str must be a string');

    const obj = {}

    let index = 0
    while(index < header.length) {
        const eqIdx = header.indexOf('=', index)

        // no more cookie pairs
        if(eqIdx === -1)
            break

        let endIdx = header.indexOf(';', index)

        if(endIdx === -1)
            endIdx = header.length
        else if(endIdx < eqIdx) {
            // backtrack on prior semicolon
            index = header.lastIndexOf(';', eqIdx - 1) + 1
            continue
        }

        const key = header.slice(index, eqIdx).trim()

        // only assign once
        if(undefined === obj[key]) {
            let val = header.slice(eqIdx + 1, endIdx).trim()

            // quoted values
            if(val.charCodeAt(0) === 0x22)
                val = val.slice(1, -1)

            try{
                val = val.includes('%') ? decodeURIComponent(val) : val
            }
            finally{
                obj[key] = val;
            }
        }

        index = endIdx + 1
    }

    return obj;
}

/**
 * @param {string} key
 * @param {string} val
 * @param {object} [options]
 * @return {string}
 * @public
 */
function serialize(key, val, options) {
    const opt = options ?? {};

    if(!fieldContentRegExp.test(key))
        throw new TypeError('argument name is invalid');


    const value = encodeURIComponent(String(val));

    if(value && !fieldContentRegExp.test(value))
        throw new TypeError('argument val is invalid');


    let str = key + '=' + value;

    if(null != opt.maxAge) {
        const maxAge = Number(opt.maxAge);

        if(isNaN(maxAge) || !isFinite(maxAge))
            throw new TypeError('option maxAge is invalid')
        str += '; Max-Age=' + Math.floor(maxAge);
    }

    if(opt.domain) {
        if(!fieldContentRegExp.test(opt.domain))
            throw new TypeError('option domain is invalid');
        str += '; Domain=' + opt.domain;
    }

    if(opt.path) {
        if(!fieldContentRegExp.test(opt.path))
            throw new TypeError('option path is invalid');
        str += '; Path=' + opt.path;
    }

    if(opt.expires) {
        const expires = opt.expires
        const isDate = expires instanceof Date || String(expires) === '[object Date]';
        if(!isDate || isNaN(expires.valueOf()))
            throw new TypeError('option expires is invalid');
        str += '; Expires=' + expires.toUTCString()
    }

    if(opt.httpOnly)
        str += '; HttpOnly';

    if(opt.secure)
        str += '; Secure';

    if(opt.priority) {
        const priority = typeof opt.priority === 'string'
            ? opt.priority.toLowerCase()
            : opt.priority

        switch(priority) {
            case 'low':
                str += '; Priority=Low'
                break
            case 'medium':
                str += '; Priority=Medium'
                break
            case 'high':
                str += '; Priority=High'
                break
            default:
                throw new TypeError('option priority is invalid')
        }
    }

    if(opt.sameSite) {
        const sameSite = typeof opt.sameSite === 'string'
            ? opt.sameSite.toLowerCase() : opt.sameSite;

        switch(sameSite) {
            case true:
                str += '; SameSite=Strict';
                break;
            case 'lax':
                str += '; SameSite=Lax';
                break;
            case 'strict':
                str += '; SameSite=Strict';
                break;
            case 'none':
                str += '; SameSite=None';
                break;
            default:
                throw new TypeError('option sameSite is invalid');
        }
    }

    return str;
}

module.exports = {
    parse,
    serialize
}