const { Readable } = require('stream');
const cookie = require('./cookie');
const normalizePath = p => (p.slice(-1) == '/' ? p.slice(0, -1) : p) || '/';
const { createServer, ServerResponse } = require('http');
const { WebSocketServer } = require('ws');

/**
 * Converts a Node.js IncomingMessage to a Web ReadableStream
 * @param {import('http').IncomingMessage} req The Node.js IncomingMessage
 * @returns {ReadableStream<Uint8Array>} The resulting Web ReadableStream
 */
function nodeRequestToWebStream(req) {
    return new ReadableStream({
        start(controller) {
            req.on('data', (chunk) => {
                controller.enqueue(new Uint8Array(chunk));
                if(controller.desiredSize <= 0) req.pause();
            });
            req.on('end', () => controller.close());
            req.on('error', (err) => controller.error(err));
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
            return new ReadableStream({
                start(controller) {
                    data.on('data', (chunk) => {
                        let bytes;
                        if(chunk instanceof Uint8Array) bytes = chunk;
                        else{
                            const text = typeof chunk === 'string' ? chunk : JSON.stringify(chunk);
                            bytes = new TextEncoder().encode(text);
                        }
                        controller.enqueue(bytes);
                    });
                    data.on('end', () => controller.close());
                    data.on('error', (err) => controller.error(err));
                    if(data.isPaused()) data.resume();
                },
                pull() { data.resume(); },
                cancel() { data.destroy(); }
            });
        return false;
    },

    createServer(api, port, websocketEnabled = false){
        const sockets = new Set();

        const server = createServer(async function(req, res){
            const [ path, query ] = req.url.split('?');

            try{
                await api.trigger(req.method, normalizePath(path), {
                    reqStream: nodeRequestToWebStream(req),
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
                res.destroy();
                throw err;
            }
        });

        server.on('connection', (socket) => {
            sockets.add(socket);
            socket.on('close', () => {
                sockets.delete(socket)
            });
        });

        const output = {
            close: () => new Promise(done => {
                const ps = [ ...sockets ].map(socket => new Promise(done => {
                    socket.on('close', () => done());
                }));
                ps.push(new Promise(done => server.close(() => done())));

                // only needed in Node v18
                server.closeIdleConnections();
                
                Promise.all(ps).then(() => done());
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

                const connect = () => new Promise(done => {
                    wss.handleUpgrade(req, socket, head, ws => {
                        clientsHealth.set(ws, true);
                        ws.on('pong', () => clientsHealth.set(ws, true));
                        done(ws);
                    });
                });

                const res = new ServerResponse(req);
                const [ path, query ] = req.url.split('?');

                const reqStream = nodeRequestToWebStream(req);
                if(!reqStream)
                    throw new Error('Failed to convert Node.js request stream to Web ReadableStream');

                api.trigger(req.method, normalizePath(path), {
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
