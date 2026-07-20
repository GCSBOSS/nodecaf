/**
 * @module utils
 * @description Utility functions for various simple and reusable operations.
 */

/**
 * @typedef {'utf8'|'utf-8'|'utf16le'|'utf-16le'} BufferEncoding
 */

/**
 * @typedef {'text'|'json'|'urlencoded'|'binary'} ShortType
 */

/**
 * Get content type header value from data
 * @param {unknown} data Data to determine content type for
 * @returns {'application/json'|'text/plain'|undefined} Content type header value or undefined
 */
export function getContentTypeFromData(data){
    if(data == null || typeof data == 'undefined' || data instanceof Uint8Array || data instanceof ReadableStream)
        return;
    if(typeof data == 'object')
        return 'application/json';
    return 'text/plain';
}

/**
 * Checks whether a string is a valid BufferEncoding
 * @param {string} encoding Charset string to validate
 * @returns {encoding is BufferEncoding} True if encoding is a valid BufferEncoding type
 */
function isBufferEncoding(encoding){
    return [
        'utf-8', 'utf8', 'utf16le', 'utf-16le'
    ].includes(encoding)
}

/**
 * Get data type from content type header value
 * @param {string|string[]|void} [contentType] Content type
 * @returns {{ type?: ShortType, charset?: BufferEncoding }} Data type and charset
 */
export function getDataTypeFromContentType(contentType){
    if(!contentType)
        return {};
    if(Array.isArray(contentType))
        contentType = contentType[0];
    
    const charsetString = contentType?.match(/charset=([^;]+)/)?.[1];
    const charset = isBufferEncoding(charsetString)
        ? charsetString
        : undefined;

    if(contentType?.slice(0, 16) == 'application/json')
        return { type: 'json', charset: charset ?? 'utf-8' };
    if(contentType?.slice(0, 33) == 'application/x-www-form-urlencoded')
        return { type: 'urlencoded', charset: charset ?? 'utf-8' };
    if(contentType?.slice(0, 5) == 'text/' || charset)
        return { type: 'text', charset: charset };
    return {};
}

/**
 * Reads all data from a ReadableStream and returns it as a Uint8Array
 * @param {ReadableStream<Uint8Array>} stream The readable stream to read from
 * @returns {Promise<Uint8Array>} The complete stream data as bytes
 */
export async function readStream(stream) {
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Converts a Uint8Array to a string using the specified encoding
 * @param {Uint8Array} bytes The bytes to convert
 * @param {BufferEncoding} encoding The character encoding to use (utf-8, utf-16le, etc)
 * @returns {string} The decoded string
 */
export function bytesToString(bytes, encoding){
    const decoder = new TextDecoder(encoding);
    return decoder.decode(bytes);
}

/**
 * Parse binary data according to its type and encoding
 * @param {Uint8Array} bytes The raw bytes to parse
 * @param {ShortType} type The data type (json, urlencoded, text, etc)
 * @param {BufferEncoding} charset The character encoding to use
 * @returns {Object.<string, unknown>|null|Uint8Array|string|boolean|number} Parsed data (object for json/urlencoded, string for text, raw bytes otherwise)
 */
export function getDataFromBytesAndTypes(bytes, type, charset){
    if(type == 'json')
        return JSON.parse(bytesToString(bytes, charset));
    if(type == 'urlencoded')
        return Object.fromEntries(new URLSearchParams(bytesToString(bytes, charset)).entries())
    if(type == 'text')
        return bytesToString(bytes, charset);
    return bytes;
}

/**
 * Formats a string by replacing %s placeholders with the given arguments.
 * @param {string} str String with %s placeholders
 * @param  {...unknown} args Arguments to replace placeholders
 * @returns {string} Formatted string
 */
export function format(str, ...args){
    let lastPos = 0;
    while(args.length > 0){
        const pos = str.indexOf('%s', lastPos);
        
        if(pos == -1)
            break;

        lastPos = pos;
        if(pos > 0 && str.charAt(pos - 1) == '%'){
            // str = str.replace('%%s', '%s', lastPos);
            str = str.replace('%%s', '%s');
            continue;
        }

        str = str.replace('%s', String(args.shift()));
    }

    if(args.length > 0)
        str += ' ' + args.join(' ');

    return str;
}

export class DestroyedRequestError extends Error {}

/**
 * Formats a number of milliseconds into a human-readable string with appropriate units (ms, s, m, h, d).
 * @param {number} ms Duration in milliseconds
 * @returns {string} Formatted duration string
 */
export function formatDuration(ms){
    if(ms < 1000)
        return ms + 'ms';
    if(ms < 60 * 1000)
        return (ms / 1000).toFixed(2) + 's';

    if(ms < 60 * 60 * 1000)        
        return (ms / (60 * 1000)).toFixed(2) + 'm';

    const hours = ms / (60 * 60 * 1000);
    const remainingMinutes = ms % (60 * 60 * 1000) / (60 * 1000);
    if(hours < 24)
        return hours.toFixed(2) + 'h' + (remainingMinutes > 0 ? ' ' + remainingMinutes.toFixed(2) + 'm' : '');

    const days = Math.trunc(ms / (24 * 60 * 60 * 1000));
    const remainingHours = ms % (24 * 60 * 60 * 1000) / (60 * 60 * 1000);
    return days + 'd' + (remainingHours > 0 ? ' ' + remainingHours.toFixed(2) + 'h' : '');
}



const randomDict = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
    .split('')
    // Shuffle Dictionary to remove selection bias.
    .sort(() => Math.random() - 0.5)

/**
 * Generates a new random id of 12 alphanumeric characters.
 * Based on https://github.com/simplyhexagonal/short-unique-id
 * @param {number} length Length of the generated ID
 * @returns {string}
 */
export function getRandomId(length){
    let id = '';
    for(let j = 0; j < length; j += 1) {
        const randomPartIdx = parseInt(
            (Math.random() * randomDict.length).toFixed(0),
            10,
        ) % randomDict.length;
        id += randomDict[randomPartIdx];
    }
    return id;
}

