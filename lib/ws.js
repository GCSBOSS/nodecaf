const cookie = require('./cookie');
const { WebSocketServer } = require('ws');
const normalizePath = p => (p.slice(-1) == '/' ? p.slice(0, -1) : p) || '/';

function checkClientsHealth(){
    // this => wss
    this.clients.forEach(function(ws) {
        if(ws.isAlive === false)
            return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}

function onUpgrade(req, socket, head){
    // this => app

    const connect = () => new Promise(done => {
        this._wss.handleUpgrade(req, socket, head, ws => {
            ws.isAlive = true;
            ws.on('pong', () => ws.isAlive = true);
            done(ws);
        });
    });

    const { ServerResponse } = require('http');
    const res = new ServerResponse(req);
    const [ path, query ] = req.url.split('?');

    this._api.trigger(req.method, normalizePath(path), {
        body: req, res, websocket: connect, headers: req.headers,
        query: Object.fromEntries(new URLSearchParams(query).entries()),
        cookies: cookie.parse(req.headers.cookie || '')
    });
}

function buildWebSocketServer(app){
    const wss = new WebSocketServer({ noServer: true });

    const interval = setInterval(checkClientsHealth.bind(wss), 30000);

    app._server.on('close', function() {
        clearInterval(interval);
        wss.clients.forEach(ws => ws.terminate());
    });

    app._server.on('upgrade', onUpgrade.bind(app));

    return wss;
}

module.exports = { buildWebSocketServer };