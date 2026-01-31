const { Readable } = require('node:stream');
const cookie = require('./cookie');
const { createServer, ServerResponse } = require('node:http');
const { WebSocketServer } = require('ws');
const encoder = new TextEncoder();

/**
 * Converts a Node.js IncomingMessage to a Web ReadableStream
 * @param {Readable} req The Node.js IncomingMessage
 * @returns {ReadableStream<Uint8Array>} The resulting Web ReadableStream
 */
function readableToWebStream(req) {
    let paused = false;

    return new ReadableStream({
        start(controller) {
            req.on('data', chunk => {
                controller.enqueue(
                    typeof chunk === 'string' ? encoder.encode(chunk) : chunk
                );

                if(!paused && controller.desiredSize !== null && controller.desiredSize <= 0) {
                    paused = true;
                    req.pause();
                }
            });

            req.once('end', () => controller.close());
            req.once('error', err => controller.error(err));
        },

        pull() {
            if(paused) {
                paused = false;
                req.resume();
            }
        },

        cancel() {
            req.destroy();
        }
    });
}

/**
 * @param {import('http').ServerResponse} res
 * @returns {import('./native').NativeResponseHandles}
 */
function createResHandles(res) {

    return {
        end() {
            return new Promise(done => res.end(done));
        },

        write(chunk) {
            if(res.destroyed || res.writableEnded)
                return Promise.reject(
                    new Error('Response stream is already closed or destroyed')
                );

            if(res.write(chunk))
                return Promise.resolve();

            return new Promise(resolve => res.once('drain', resolve));
        },

        setStatus(code) {
            res.statusCode = code;
        },

        setHeader(k, v) {
            res.setHeader(k, v);
        }
    };
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
        let openSockets = 0;
        let closeResolve = null;

        const server = createServer(async function(req, res){
            const [ path, query ] = req.url.split('?');

            try{
                await api.trigger(req.method, path, {
                    reqStream: readableToWebStream(req),
                    resHandles: createResHandles(res),
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
            socket.on('close', () => {
                openSockets--;
                if(openSockets === 0 && closeResolve) 
                    closeResolve();
            });
        });

        const output = {
            close: () => new Promise(async done => {
                await new Promise(done => server.close(done));

                // only needed in Node v18
                server.closeIdleConnections();
                
                if(openSockets === 0) 
                    done();
                else
                    closeResolve = done;
            })
        };

        /**
         * @typedef {import('ws').WebSocket & { isAlive: boolean }} AliveWebSocket
         */
        
        if(websocketEnabled){
            const wss = new WebSocketServer({ noServer: true });
            const interval = setInterval(() => {

                wss.clients.forEach(/** @param {AliveWebSocket} ws */(ws) => {
                    if(ws.isAlive === false)
                        return ws.terminate();
                    
                    ws.isAlive = false;
                    ws.ping();
                });
            }, 30000);

            server.on('close', function() {
                clearInterval(interval);
                wss.clients.forEach(ws => ws.terminate());
            });

            server.on('upgrade', function(req, socket, head){

                const connect = () => new Promise(done => {
                    wss.handleUpgrade(req, socket, head, /** @param {AliveWebSocket} ws */ ws => {
                        ws.on('pong', () => {
                            ws.isAlive = true;
                        });
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
                    resHandles: createResHandles(res),
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
