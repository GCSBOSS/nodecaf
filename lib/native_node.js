/**
 * @module native_node
 * @description Node.js runtime adapter. Implements the NativeModule interface for Node.js,
 * handling HTTP server creation, stream conversion, filesystem operations, and signal handling.
 * @example
 * const nativeNodeModule = require('./native_node.js');
 * const serverHandles = await nativeNodeModule.createServer(api, 3000, true);
 * await serverHandles.close();
 */

import { Readable } from 'node:stream';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createServer, ServerResponse } from 'node:http';
import { WebSocketServer } from 'ws';
import { DestroyedRequestError } from './utils.js';

const encoder = new TextEncoder();

/**
 * @param {Error} error
 * @return {error is NodeJS.ErrnoException}
 */
function hasErrorCode(error) {
    return Boolean({ code: '', ...error }.code); 
}

/**
 * Convert a Node.js readable stream to a Web ReadableStream
 * @param {Readable} req The Node.js stream (typically IncomingMessage)
 * @returns {ReadableStream<Uint8Array>} A Web Streams API ReadableStream
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
            req.once('error', err => {

                if(hasErrorCode(err) && err.code === 'ECONNRESET' && err.message == 'aborted')
                    return controller.error(new DestroyedRequestError('Request was aborted by client'));
                
                controller.error(err)
            });
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
 * Create native response handles for a Node.js ServerResponse
 * @param {import('http').ServerResponse} res The Node.js server response object
 * @returns {import('./native').NativeResponseHandles} Native response handler object
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
        },

        appendHeader(k, v) {
            res.appendHeader(k, v);
        }

    };
}

/** 
 * @type {import('./native').NativeModule} 
 */
export const nativeNodeModule = {

    argv(){
        return process.argv;
    },

    getPackageInfo(){
        const pkgFileContents = fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8');
        return JSON.parse(pkgFileContents);
    },

    env(){
        return process.env.NODE_ENV ?? process.env.ENV ?? 'development';
    },

    setupSignalHandler(handler){
        const term = () => {
            handler();
            setTimeout(() => process.exit(0), 2000);
        };
        process.on('SIGINT', term);
        process.on('SIGTERM', term);
        return () => {
            process.removeListener('SIGINT', term);
            process.removeListener('SIGTERM', term);
        }
    },

    setupUncaughtErrorHandler(handler){
        const die = (err) => {
            handler(err);
            process.exit(1);
        }
        process.on('uncaughtException', die);
        process.on('unhandledRejection', die);
        return () => {
            process.removeListener('uncaughtException', die);
            process.removeListener('unhandledRejection', die);
        }
    },

    readFile(path) {
        return fs.promises.readFile(path, 'utf-8');
    },

    nativeDataToWebStream(data) {
        if(data instanceof Readable) 
            return readableToWebStream(data);
        return false;
    },

    createServer(triggerFunction, port, websocketEnabled = false){
        let openSockets = 0;
        let closeResolve = null;
        const server = createServer(async function(req, res){
            const [ path, query ] = req.url.split('?');

            try{
                await triggerFunction(req.method, path, {
                    reqStream: readableToWebStream(req),
                    resHandles: createResHandles(res),
                    headers: req.headers,
                    query: Object.fromEntries(new URLSearchParams(query).entries()),
                    cookies: req.headers.cookie
                });

                // Probably add this line when we move to accepting response in return 
                // statememt. This way it will return 200 if nothing is returned. 
                // !res.writableEnded && res.end();
            }
            catch(err){
                process.emit('uncaughtException', err);
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
            }, this.env() != 'production' ? 1000 : 30000);

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

                triggerFunction(req.method, path, {
                    reqStream,
                    resHandles: createResHandles(res),
                    ip: req.socket.remoteAddress,
                    websocket: connect, 
                    headers: req.headers,
                    query: Object.fromEntries(new URLSearchParams(query).entries()),
                    cookies: req.headers.cookie
                });
            });
        }
           
        return new Promise((resolve, reject) => {

            const startError = (err) => {
                reject(err);
            }

            server.on('error', startError);

            server.listen(port, () => {
                server.removeListener('error', startError);
                resolve(output)
            }); 
        });
    }

}
