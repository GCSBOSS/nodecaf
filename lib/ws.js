const WebSocket = require('ws');
const assert = require('assert');
const url = require('url');
const cookieParser = require('cookie-parser');

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

function onConnect(app, client, req){
    client.isAlive = true;
    client.on('pong', () => client.isAlive = true);

    let args = {
        ...app.exposed, req, query: req.query, flash: req.locals,
        conf: app.conf, log: app.log, headers: req.headers, client
    };

    let route = app.wsRoutes[req.pathname];
    app.log.ws(client, req, 'debug', 'New connection from %s');

    client.on('message', message => {
        app.log.ws(client, req, 'debug', 'New message from %s');
        route.message({ ...args, message });
    });

    client.on('close', () => {
        app.log.ws(client, req, 'debug', 'Closed connection from %s');
        route.close(args);
    });

    /* istanbul ignore next */
    client.on('error', err => {
        app.log.ws(client, req, 'error', 'Error in connection to %s');
        route.error({ ...args, err });
    });

    route.connect(args);
}

module.exports = {

    start(app){
        let wss = new WebSocket.Server({ server: app.server });
        wss.on('connection', onConnect.bind(null, app));

        let parseCookies = cookieParser(app.conf.cookie && app.conf.cookie.secret);

        app.server.prependListener('upgrade', (req, socket/*, head*/) => {

            parseCookies(req, {}, Function.prototype);

            req.pathname = url.parse(req.url, true).pathname
            if(! (req.pathname in app.wsRoutes) ){
                app.log.ws(socket, req, 'debug', 'Dropped connection to unkown path from %s');
                socket.destroy();
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
