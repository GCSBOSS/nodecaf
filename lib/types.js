
const { Stream } = require('stream');

function getContentTypeFromDataType(data){
    if(data == null || typeof data == 'undefined' || data instanceof Buffer || data instanceof Stream)
        return;
    if(typeof data == 'object')
        return 'application/json';
    return 'text/plain';
}

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