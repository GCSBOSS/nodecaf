/**
 * @module types
 * @description Data type detection and conversion. Determines MIME types from data,
 * parses content-type headers, and converts between binary and string formats.
 * @example
 * const contentType = getContentTypeFromData({ foo: 'bar' }); // 'application/json'
 * const { type, charset } = getDataTypeFromContentType('application/json; charset=utf-8');
 * const bytes = await readStream(readableStream);
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
