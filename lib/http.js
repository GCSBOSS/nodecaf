const cookie = require('cookie');
const { buildWebSocketServer } = require('./ws');
const normalizePath = p => (p.slice(-1) == '/' ? p.slice(0, -1) : p) || '/';

async function handleRequest(req, res){
    // this => app

    const [ path, query ] = req.url.split('?');

    await this._api.trigger(req.method, normalizePath(path), {
        body: req, res, headers: req.headers,
        query: Object.fromEntries(new URLSearchParams(query).entries()),
        cookies: cookie.parse(req.headers.cookie || '')
    });
}

module.exports = {

    async startServer(){
        const handler = handleRequest.bind(this);
        this._server = this._serverBuilder(this).on('request', handler);
        await new Promise(done => this._server.listen(this.conf.port, done));
        this.log.info({ type: 'server' },
            '%s v%s is ready on port %s', this._name, this._version, this.conf.port);

        if(this._websocket)
            this._wss = buildWebSocketServer(this);
    }

}
