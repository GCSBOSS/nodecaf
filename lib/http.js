const cookie = require('cookie');
const querystring = require('querystring');

const { parseBody } = require('./parser');

const normalizePath = p => (p.slice(-1) == '/' ? p.slice(0, -1) : p) || '/';

async function handleRequest(req, res){
    // this => app

    if(req.method == 'OPTIONS')
        return this._cors(req, res);
    else if(this.conf.cors)
        await new Promise(done => this._cors(req, res, done));

    let [ path, query ] = req.url.split('?');
    req.path = normalizePath(path);
    req.cookies = cookie.parse(req.headers.cookie || '');
    req.query = querystring.parse(query);

    req.hasBody = Boolean(req.headers['content-length']);
    if(this._shouldParseBody && req.hasBody)
        req.body = await parseBody.call(this, req);

    res.on('finish', () => this.log.debug({ res }));

    await this._api.trigger(req.method, req.path, {
        query: req.query, req, res, headers: req.headers, body: req.body,
        cookies: req.cookies
    });
}

module.exports = {

    async startServer(){
        let handler = handleRequest.bind(this);
        this._server = this._serverBuilder(this).on('request', handler);
        await new Promise(done => this._server.listen(this.conf.port, done));
        this.log.info({ type: 'server' },
            '%s v%s is ready on port %s', this._name, this._version, this.conf.port);
    }

}
