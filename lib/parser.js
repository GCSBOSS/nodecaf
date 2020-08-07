const querystring = require('querystring');
const contentType = require('content-type');
const getRawBody = require('raw-body');

const formdata = require('./form-data');

const FALLBACK_CONTENT_TYPE = { type: 'text/plain', parameters: { charset: 'utf-8' } };

function parseContentType(req){
    try{
        var ct = contentType.parse(req.headers['content-type']);
    }
    catch(err){
        ct = FALLBACK_CONTENT_TYPE;
    }

    ct.textCharset = ct.parameters.charset || 'utf-8';
    ct.originalCharset = ct.parameters.charset;

    req.contentType = ct.type;
    return ct;
}

module.exports = {

    async parseBody(req){
        let ct = parseContentType(req);

        try{

            if(ct.type == 'multipart/form-data')
                return await formdata(req);

            req.rawBody = await getRawBody(req, {
                length: req.headers['content-length']
            });

            if(ct.type.slice(-4) == 'json')
                return JSON.parse(req.rawBody.toString(ct.textCharset));

            if(ct.type == 'application/x-www-form-urlencoded')
                return querystring.parse(req.rawBody.toString(ct.textCharset));

            if(ct.originalCharset || ct.type.slice(4) == 'text')
                return req.rawBody.toString(ct.textCharset);

            return req.rawBody;
        }
        catch(err){
            this.log.warn({ req, err, type: 'request' }, 'Failed to parse request body');
        }
    }

}
