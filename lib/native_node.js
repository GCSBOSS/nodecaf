

const { Readable, Writable } = require('stream');
const cookie = require('./cookie');
const normalizePath = p => (p.slice(-1) == '/' ? p.slice(0, -1) : p) || '/';
const { createServer, ServerResponse } = require('http');
const { WebSocketServer } = require('ws');

/**
 * @type {import('./native').NativeModule}
 */
const nativeNodeModule = {

    createServer(api, port, websocketEnabled = false){


        const server = createServer(async function(req, res){
            const [ path, query ] = req.url.split('?');

            req.on('error', () => {
                // Ignore request errors. They are handled elsewhere.
            });

            req.on('abort', () => {
                // Ignore request errors. They are handled elsewhere.
            });

            res.on('error', () => {
                // Ignore response errors. They are handled elsewhere.
            });

            res.on('abort', () => {
                // Ignore response errors. They are handled elsewhere.
            });
            
            await api.trigger(req.method, normalizePath(path), {
                reqStream: Readable.toWeb(req),
                resStream: Writable.toWeb(res),
                resHandles: {
                    setStatus: number => res.statusCode = number,
                    setHeader: (k, v) => res.setHeader(k, v)
                },
                headers: req.headers,
                query: Object.fromEntries(new URLSearchParams(query).entries()),
                cookies: cookie.parse(req.headers.cookie || '')
            });
            
        });

        const output = {
            close: () => new Promise(done => {
                server.close(() => done());
            })
        };

        if(websocketEnabled){

            const clientsHealth = new Map();

            const wss = new WebSocketServer({ noServer: true });
            const interval = setInterval(() => {

                wss.clients.forEach(function(ws) {
                    if(clientsHealth.get(ws)){
                        clientsHealth.delete(ws);
                        return ws.terminate();
                    }

                    clientsHealth.set(ws, true);
                    ws.ping();
                });
            }, 30000);

            server.on('close', function() {
                clearInterval(interval);
                wss.clients.forEach(ws => ws.terminate());
            });

            server.on('upgrade', function(req, socket, head){
                // this => app

                const connect = () => new Promise(done => {
                    wss.handleUpgrade(req, socket, head, ws => {
                        clientsHealth.set(ws, true);
                        ws.on('pong', () => clientsHealth.set(ws, true));
                        done(ws);
                    });
                });

                const res = new ServerResponse(req);
                const [ path, query ] = req.url.split('?');

                api.trigger(req.method, normalizePath(path), {
                    reqStream: Readable.toWeb(req),
                    resStream: Writable.toWeb(res), 
                    ip: req.socket.remoteAddress,
                    websocket: connect, 
                    headers: req.headers,
                    query: Object.fromEntries(new URLSearchParams(query).entries()),
                    cookies: cookie.parse(req.headers.cookie || '')
                });
            });

        }
           
        return new Promise((resolve, reject) => {

            server.on('error', (err) => {
                reject(err);
            });

            server.listen(port, () => {
                resolve(output)
            }); 
        });
    }

}



module.exports = nativeNodeModule;


