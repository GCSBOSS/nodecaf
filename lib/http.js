const cookie = require('./cookie');
const { buildWebSocketServer } = require('./ws');
const normalizePath = p => (p.slice(-1) == '/' ? p.slice(0, -1) : p) || '/';
const { Readable, Stream } = require('stream');

async function handleRequest(req, res){
    // this => app

    const [ path, query ] = req.url.split('?');

    await this._api.trigger(req.method, normalizePath(path), {
        reqStream: Readable.toWeb(req),
        res, headers: req.headers,
        query: Object.fromEntries(new URLSearchParams(query).entries()),
        cookies: cookie.parse(req.headers.cookie || '')
    });
}

module.exports = {

    async startServer(){
        const handler = handleRequest.bind(this);
        const builder = this._serverBuilder ?? (() => require('http').createServer());
        this._server = builder(this).on('request', handler);
        const httpPort = this._http;
        await new Promise(done => this._server.listen(httpPort, done));
        this.log.info({ type: 'server' },
            '%s v%s is ready on port %s', this._name, this._version, httpPort);

        if(this._websocket)
            this._wss = buildWebSocketServer(this);
    }

}
