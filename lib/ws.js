const WebSocket = require('ws');
const assert = require('assert');
const url = require('url');

/* istanbul ignore next */
function checkClientsHealth(){
    // this => wss
    this.clients.forEach(ws => {
        if(ws.isAlive === false)
            return ws.terminate();
        ws.isAlive = false;
        ws.ping(Function.prototype);
    });
}

function onConnect(ws, req){
    let app = this._app;

    ws.isAlive = true;
    ws.on('pong', () => ws.isAlive = true);

    let args = {
        ...app._global, req, query: req.query, flash: req.flash,
        conf: app.conf, log: app.log, headers: req.headers, ws
    };

    let route = this._routes[req.pathname];
    app.log.debug({ ws }, 'New connection');

    ws.on('message', message => {
        app.log.debug({ ws }, 'Received message');
        route.message({ ...args, message });
    });

    ws.on('close', () => {
        app.log.debug({ ws }, 'Closed connection');
        route.close(args);
    });

    /* istanbul ignore next */
    ws.on('error', err => {
        app.log.error({ ws }, 'Error in connection');
        route.error({ ...args, err });
    });

    route.connect(args);
}

module.exports = class WSServer{

    constructor(app){
        this._routes = {};
        this._app = app;
    }

    start(){
        this._wss = new WebSocket.Server({ server: this._app._server });

        this._app._server.prependListener('upgrade', (req, ws/*, head*/) => {
            ws.addr = req.connection.remoteAddress;
            req.pathname = url.parse(req.url, true).pathname
            if(! (req.pathname in this._routes) ){
                this._app.log.debug({ ws, req }, 'Dropped connection to unkown path');
                ws.destroy();
            }
        });

        this._wss.on('connection', onConnect.bind(this));

        this._wss.healthChecker = setInterval(checkClientsHealth.bind(this._wss), 30000);
    }

    close(){
        clearInterval(this._wss.healthChecker);
        this._wss.clients.forEach(client => client.terminate());
    }

    set(path, spec){
        assert.strictEqual(typeof spec, 'object', new TypeError('Argument \'events\' must be an object'));
        assert(!spec.connect || typeof spec.connect == 'function', new TypeError('Connection handler must be a function'));
        assert(!spec.message || typeof spec.message == 'function', new TypeError('Message handler must be a function'));
        assert(!spec.close || typeof spec.close == 'function', new TypeError('Close handler must be a function'));
        assert(!spec.error || typeof spec.error == 'function', new TypeError('Error handler must be a function'));

        let connect, message, close, error;
        connect = message = close = error = Function.prototype;
        this._routes[path] = { error, connect, message, close, ...spec };
    }

};
