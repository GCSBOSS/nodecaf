
const { Stream } = require('stream');

/**
 * @typedef {'text'|'json'|'urlencoded'|'binary'} ShortType
 */

/**
 * Get content type header value from data type
 * @param {unknown} data Data to get content type for
 * @returns {'application/json'|'text/plain'|void} Content type header value
 */
function getContentTypeFromData(data){
    if(data == null || typeof data == 'undefined' || data instanceof Buffer || data instanceof Stream)
        return;
    if(typeof data == 'object')
        return 'application/json';
    return 'text/plain';
}

/**
 * Checks whether a string is a valid BufferEncoding
 * @param {string} encoding Charset string
 * @returns {encoding is BufferEncoding} 
 */
function isBufferEncoding(encoding){
    return [
        'utf-8', 'utf8', 'ascii', 'latin1', 'hex',
        'utf16le', 'utf-16le', 'ucs2', 'ucs-2', 'base64', 'base64url', 'binary'
    ].includes(encoding)
}

/**
 * Get data type from content type header value
 * @param {string|string[]|void} [contentType] Content type
 * @returns {{ type?: ShortType, charset?: BufferEncoding }} Data type and charset
 */
function getDataTypeFromContentType(contentType){
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
        return { type: 'urlencoded', charset: charset ?? 'ascii' };
    if(contentType?.slice(0, 5) == 'text/' || charset)
        return { type: 'text', charset: charset };
    return {};
}

/**
 * Parse buffer according to data type
 * @param {Buffer} buffer Buffer to parse
 * @param {ShortType} [type] Data type
 * @param {BufferEncoding} [charset] Character set
 * @returns {number|string|Object|Buffer|boolean|null} Parsed data
 */
function parseBuffer(buffer, type, charset = 'utf-8') {
    if(type == 'json')
        return JSON.parse(buffer.toString(charset));
    if(type == 'urlencoded')
        return Object.fromEntries(new URLSearchParams(buffer.toString(charset)).entries())
    if(type == 'text')
        return buffer.toString(charset);
    return buffer;
}


/**
 * @param {unknown} input
 * @returns {ReadableStream}
 */
// function getReadableStreamFromAnything(input){
//     input = nativeModule.getReadableStreamFromAnything(input);

//     if(typeof input == 'undefined')
//         input = new ReadableStream({ type: 'bytes' });

//     else if(!(input instanceof ReadableStream)){

//         if(!(input instanceof Uint8Array)){

//             if(typeof input == 'object' && !(input instanceof Date))
//                 input = JSON.stringify(input);
//             else
//                 input = String(input);

//             const encoder = new TextEncoder();
//             input = encoder.encode(input);
//         }

//         input = new ReadableStream({
//             type: 'bytes',
//             start(controller) {
//                 controller.enqueue(input);
//                 controller.close();
//             }
//         });
//     }

//     return input;
// }

/**
 * Reads all data from a ReadableStream and returns it as a Uint8Array
 * @param {ReadableStream} stream
 * @returns {Promise<Uint8Array>}
 */
async function readStream(stream){
    const chunks = [];
    const reader = stream.getReader();
    try{
        while(true) {
            const { done, value } = await reader.read();
            if(done)
                break;
            chunks.push(value);
        }
    }
    catch(err) {
        throw err;
    }
    finally{
        reader.releaseLock();
    }

    const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for(const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    return result;
}

/**
 * Converts a Uint8Array or Buffer to a string using the specified encoding
 * @param {Uint8Array} bytes The bytes to convert
 * @param {BufferEncoding} encoding The encoding to use
 * @returns {string} The resulting string
 */
function bytesToString(bytes, encoding){
    const decoder = new TextDecoder(encoding);
    return decoder.decode(bytes);
}

/**
 * @param {Uint8Array} bytes
 * @param {ShortType} type
 * @param {BufferEncoding} charset
 * @returns {Object|Buffer|string|number|boolean|null}
 */
function getDataFromBytesAndTypes(bytes, type, charset){
    console.log('getDataFromBytesAndTypes', bytes, type, charset);
    if(type == 'json')
        return JSON.parse(bytesToString(bytes, charset));
    if(type == 'urlencoded')
        return Object.fromEntries(new URLSearchParams(bytesToString(bytes, charset)).entries())
    if(type == 'text')
        return bytesToString(bytes, charset);
    return bytes;
}

module.exports = {
    getContentTypeFromData,
    getDataTypeFromContentType,
    parseBuffer,
    readStream,
    bytesToString,
    getDataFromBytesAndTypes
}