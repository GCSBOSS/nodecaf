
const { Stream } = require('stream');

/**
 * Get content type header value from data type
 * @param {unknown} data Data to get content type for
 * @returns {string|void} Content type header value
 */
function getContentTypeFromDataType(data){
    if(data == null || typeof data == 'undefined' || data instanceof Buffer || data instanceof Stream)
        return;
    if(typeof data == 'object')
        return 'application/json';
    return 'text/plain';
}

/**
 * Get data type from content type header value
 * @param {string} contentType Content type
 * @returns {{ type?: 'text'|'urlencoded'|'json', charset?: string }} Data type and charset
 */
function getDataTypeFromContentType(contentType){
    const charset = contentType?.match(/charset=([^;]+)/)?.[1];
    if(contentType?.slice(0, 16) == 'application/json')
        return { type: 'json', charset: charset ?? 'utf-8' };
    if(contentType?.slice(0, 33) == 'application/x-www-form-urlencoded')
        return { type: 'urlencoded', charset: charset ?? 'ascii' };
    if(contentType?.slice(0, 5) == 'text/' || charset)
        return { type: 'text', charset };
    return {};
}

/**
 * Parse buffer according to data type
 * @param {Buffer} buffer Buffer to parse
 * @param {'text'|'urlencoded'|'json'} [type] Data type
 * @param {BufferEncoding} [charset] Character set
 * @returns {number|string|Object|Buffer|boolean|null} Parsed data
 */
function parseBuffer(buffer, type, charset) {
    if(type == 'json')
        return JSON.parse(buffer.toString(charset));
    if(type == 'urlencoded')
        return Object.fromEntries(new URLSearchParams(buffer.toString(charset)).entries())
    if(type == 'text')
        return buffer.toString(charset);
    return buffer;
}

module.exports = {
    getContentTypeFromDataType,
    getDataTypeFromContentType,
    parseBuffer
}