const { URL } = require('url');
const querystring = require('querystring');

const { parseBody } = require('./parser');

const normalizePath = p => (p.slice(-1) == '/' ? p.slice(0, -1) : p) || '/';

function forMiddleware(mw, req, res){
    return new Promise((done, error) => {
        try{
            mw(req, res, done);
        }
        catch(e){
            /* istanbul ignore next */
            error(e);
        }
    });
}

function handleCORS(app, req, res){
    return forMiddleware(app._cors, req, res);
}

function handleCookies(app, req, res){
    return forMiddleware(app._cookies, req, res);
}

async function prepareHandling(app, req, res){
    req.hasBody = Boolean(req.headers['content-length']);

    if(app._shouldParseBody && req.hasBody)
        req.body = await parseBody.apply(app, [req]);

    await forMiddleware(app._compress, req, res);
    await handleCookies(app, req, res);

    if(app.conf.cors)
        await handleCORS(app, req, res);
}

async function handleRequest(req, res){
    // this => app
    let url = new URL(req.url, 'http://0.0.0.0');
    req.path = normalizePath(url.pathname);

    req.params = {};
    res.req = req;
    res.on('finish', () => this.log.debug({ res }));

    if(req.method == 'OPTIONS')
        return handleCORS(this, req, res);

    await prepareHandling(this, req, res);

    req.flash = {};
    req.query = querystring.parse(url.search.slice(1));

    await this._api.trigger(req.method, req.path, {
        query: req.query, req, res, headers: req.headers, body: req.body
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
