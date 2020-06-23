const querystring = require('querystring');

const contentType = require('content-type');
const getRawBody = require('raw-body');

const formdata = require('./form-data');

const FALLBACK_CONTENT_TYPE = { type: 'text/plain', parameters: { charset: 'utf-8' } };

module.exports = {

    async parseBody(req){

        try{
            var ct = contentType.parse(req.headers['content-type']);
        }
        catch(err){
            ct = FALLBACK_CONTENT_TYPE;
        }

        let textCharset = ct.parameters.charset || 'utf-8';
        let originalCharset = ct.parameters.charset;

        if(ct.type == 'multipart/form-data')
            return await formdata(req);

        req.rawBody = await getRawBody(req, {
            length: req.headers['content-length']
        }).catch(/* istanbul ignore next */ err =>
            this.log.warn({ req, err, type: 'request' }, 'Failed to parse request body'));

        if(ct.type.slice(-4) == 'json')
            return JSON.parse(req.rawBody.toString(textCharset));

        if(ct.type == 'application/x-www-form-urlencoded')
            return querystring.parse(req.rawBody.toString(textCharset));

        if(originalCharset || ct.type.slice(4) == 'text')
            return req.rawBody.toString(textCharset);

        return req.rawBody;
    }

}
