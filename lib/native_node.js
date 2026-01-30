const { Readable } = require('stream');
const cookie = require('./cookie');
const { createServer, ServerResponse } = require('http');
const { WebSocketServer } = require('ws');

/**
 * Converts a Node.js IncomingMessage to a Web ReadableStream
 * @param {Readable} req The Node.js IncomingMessage
 * @returns {ReadableStream<Uint8Array>} The resulting Web ReadableStream
 */
function readableToWebStream(req) {
    const encoder = new TextEncoder();

    return new ReadableStream({
        start(controller) {
            req.on('data', chunk => {
                if(typeof chunk === 'string') 
                    chunk = encoder.encode(chunk);
                controller.enqueue(chunk);
                controller.desiredSize <= 0 && req.pause();
            });
            req.on('end', () => controller.close());
            req.on('error', err => controller.error(err));
        },
        pull() { req.resume(); },
        cancel() { req.destroy(); }
    });
}

/** 
 * @type {import('./native').NativeModule} 
 */
const nativeNodeModule = {

    nativeDataToWebStream(data) {
        if(data instanceof Readable) 
            return readableToWebStream(data);
        return false;
    },

    createServer(api, port, websocketEnabled = false){
        const sockets = new Set();
        let openSockets = 0;

        const server = createServer(async function(req, res){
            const [ path, query ] = req.url.split('?');

            try{
                // TODO check normalize path irrelevant?
                await api.trigger(req.method, path, {
                    reqStream: readableToWebStream(req),
                    resHandles: {
                        end: () => new Promise(done => res.end(() => done())),
                        write: chunk => new Promise((resolve, reject) => {
                            if(res.destroyed || res.writableEnded) 
                                return reject(new Error('Response stream is already closed or destroyed'));
                            
                            res.write(chunk, (err) => {
                                if(err) res.destroy(err);
                                resolve();
                            });
                        }),
                        setStatus: number => res.statusCode = number,
                        setHeader: (k, v) => res.setHeader(k, v)
                    },
                    headers: req.headers,
                    query: Object.fromEntries(new URLSearchParams(query).entries()),
                    cookies: cookie.parse(req.headers.cookie || '')
                });

                !res.writableEnded && res.end();
            }
            catch(err){
                // This needed??
                // res.destroy();
                throw err;
            }
        });

        server.on('connection', (socket) => {
            openSockets++;
            sockets.add(socket);
            socket.on('close', () => openSockets--);
            socket.on('close', () => {
                sockets.delete(socket)
            });
        });

        const output = {
            close: () => new Promise(async done => {
                await new Promise(done => server.close(done));

                // only needed in Node v18
                server.closeIdleConnections();
                
                if(openSockets === 0) 
                    done();
                else{
                    const i = setInterval(() => {
                        if(openSockets === 0) {
                            clearInterval(i);
                            done();
                        }
                    }, 10);
                }
            })
        };

        if(websocketEnabled){

            const clientsHealth = new WeakMap();

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

                const connect = () => new Promise(done => {
                    wss.handleUpgrade(req, socket, head, ws => {
                        clientsHealth.set(ws, true);
                        ws.on('pong', () => clientsHealth.set(ws, true));
                        done(ws);
                    });
                });

                const res = new ServerResponse(req);
                const [ path, query ] = req.url.split('?');

                const reqStream = readableToWebStream(req);
                if(!reqStream)
                    throw new Error('Failed to convert Node.js request stream to Web ReadableStream');

                api.trigger(req.method, path, {
                    reqStream,
                    resHandles: {
                        end: () => {
                            return new Promise(done => res.end(() => done()))
                        },
                        write: chunk => new Promise((resolve, reject) => {
                            if(res.destroyed || res.writableEnded) 
                                return reject(new Error('Response stream is already closed or destroyed'));
                            res.write(chunk, (err) => {
                                if(err) res.destroy(err);
                                resolve();
                            });
                        }),
                        setStatus: number => res.statusCode = number,
                        setHeader: (k, v) => res.setHeader(k, v)
                    },
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
