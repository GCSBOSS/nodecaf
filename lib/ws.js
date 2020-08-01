const WebSocket = require('ws');
const assert = require('assert');
const url = require('url');

/* istanbul ignore next */
function checkClientsHealth(){
    // this => wss
    this.clients.forEach(client => {
        if(client.isAlive === false)
            return client.terminate();
        client.isAlive = false;
        client.ping(Function.prototype);
    });
}

function onConnect(app, ws, req){
    ws.isAlive = true;
    ws.on('pong', () => ws.isAlive = true);

    let args = {
        ...app.global, req, query: req.query, flash: req.locals,
        conf: app.conf, log: app.log, headers: req.headers, client: ws
    };

    let route = app.wsRoutes[req.pathname];
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

module.exports = {

    start(app){
        let wss = new WebSocket.Server({ server: app.server });
        wss.on('connection', onConnect.bind(null, app));

        app.server.prependListener('upgrade', (req, ws/*, head*/) => {
            req.pathname = url.parse(req.url, true).pathname
            if(! (req.pathname in app.wsRoutes) ){
                app.log.debug({ ws, req }, 'Dropped connection to unkown path %s', req.url);
                ws.destroy();
            }
        });

        wss.healthChecker = setInterval(checkClientsHealth.bind(wss), 30000);
        return wss;
    },

    close(wss){
        clearInterval(wss.healthChecker);
        wss.clients.forEach(client => client.terminate());
    },

    set(app, path, spec){
        assert.strictEqual(typeof spec, 'object', new TypeError('Argument \'events\' must be an object'));
        assert(!spec.connect || typeof spec.connect == 'function', new TypeError('Connection handler must be a function'));
        assert(!spec.message || typeof spec.message == 'function', new TypeError('Message handler must be a function'));
        assert(!spec.close || typeof spec.close == 'function', new TypeError('Close handler must be a function'));
        assert(!spec.error || typeof spec.error == 'function', new TypeError('Error handler must be a function'));

        app.wsRoutes = app.wsRoutes || {};

        let connect = message = close = error = Function.prototype;
        app.wsRoutes[path] = { error, connect, message, close, ...spec };
    }

};
