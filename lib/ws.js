const WebSocket = require('ws');
const assert = require('assert');

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

module.exports = {

    start(app){
        let wss = new WebSocket.Server({ server: app.server });
        wss.on('connection', (client, req) => {
            client.isAlive = true;
            client.on('pong', () => client.isAlive = true);

            let route = app.wsRoutes[req.url];
            app.log.ws(client, req, 'info', 'New connection from %s');

            client.on('message', message => {
                app.log.ws(client, req, 'debug', 'New message from %s');
                route.message(message, client, req);
            });

            client.on('close', () => {
                app.log.ws(client, req, 'info', 'Closed connection from %s');
                route.close(client, req);
            });

            route.connect(client, req);
        });

        app.server.prependListener('upgrade', (req, socket/*, head*/) => {
            if(! (req.url in app.wsRoutes) )
                socket.destroy();
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

        app.wsRoutes = app.wsRoutes || {};

        let connect = message = close = Function.prototype;
        app.wsRoutes[path] = { connect, message, close, ...spec };
    }

};
