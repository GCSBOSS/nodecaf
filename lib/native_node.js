

const { Readable, Stream } = require('stream');
const cookie = require('./cookie');
const normalizePath = p => (p.slice(-1) == '/' ? p.slice(0, -1) : p) || '/';
const { WebSocketServer } = require('ws');
const { ServerResponse, IncomingMessage } = require('http');
const { ReadableStream } = require('node:stream/web');

const nativeNodeModule = {

    checkClientsHealth(){
        // this => wss
        this.clients.forEach(function(ws) {
            if(ws.isAlive === false)
                return ws.terminate();
            ws.isAlive = false;
            ws.ping();
        });
    },

    onUpgrade(req, socket, head){
        // this => app

        const connect = () => new Promise(done => {
            this._wss.handleUpgrade(req, socket, head, ws => {
                ws.isAlive = true;
                ws.on('pong', () => ws.isAlive = true);
                done(ws);
            });
        });

        const res = new ServerResponse(req);
        const [ path, query ] = req.url.split('?');

        this._api.trigger(req.method, normalizePath(path), {
            body: req, res, websocket: connect, headers: req.headers,
            query: Object.fromEntries(new URLSearchParams(query).entries()),
            cookies: cookie.parse(req.headers.cookie || '')
        });
    },

    buildWebSocketServer(app){
        const wss = new WebSocketServer({ noServer: true });

        const interval = setInterval(checkClientsHealth.bind(wss), 30000);

        app._server.on('close', function() {
            clearInterval(interval);
            wss.clients.forEach(ws => ws.terminate());
        });

        app._server.on('upgrade', onUpgrade.bind(app));

        return wss;
    },

    async handleRequest(req, res){
        // this => app

        const [ path, query ] = req.url.split('?');

        await this._api.trigger(req.method, normalizePath(path), {
            ip: req.socket.remoteAddress,
            body: Readable.toWeb(req),
            res,
            headers: req.headers,
            query: Object.fromEntries(new URLSearchParams(query).entries()),
            cookies: cookie.parse(req.headers.cookie || '')
        });
    },

    async startServer(app){
        const handler = handleRequest.bind(app);
        const builder = app._serverBuilder ?? (() => require('http').createServer());
        app._server = builder(app).on('request', handler);
        await new Promise(done => app._server.listen(app.conf.port, done));
        app.log.info({ type: 'server' },
            '%s v%s is ready on port %s', app._name, app._version, app.conf.port);

        if(app._websocket)
            app._wss = buildWebSocketServer(app);
    },

    async stopServer(app){
        await new Promise(done => app._server.close(done));
    },

    setStatus(res, status){
        if(res.native)
            res.native.statusCode = status;
    },

    setResHeader(res, key, value){
        res.native?.setHeader(key, value);
    },

    resWrite(res, data){
        res.native?.write(data);
    },

    resEnd(res){
        res.native?.end();
    },

    getFakeRes(){
        const im = new IncomingMessage();
        const sr = new ServerResponse(im);
        sr.chunks = [];
        sr.oldWrite = sr.write;
        sr.write = chunk => {
            sr.chunks.push(chunk);
            sr.oldWrite(chunk);
        };
        return sr;
    },

    readFakeRes(r){
        const encoder = new TextEncoder();
        return new ReadableStream({
            type: 'bytes',
            pull(controller){
                let chunk = r.native.chunks.shift();
                if(typeof chunk == 'string')
                    chunk = encoder.encode(chunk);
                chunk && controller.enqueue(chunk);
                if(r.finished && r.native.chunks.length == 0)
                    controller.close();
            }
        });
    },

    isRawBytes(data){
        return data instanceof Buffer || data instanceof Stream;
    },

    getReadableStreamFromAnything(input){
        if(input instanceof Buffer)
            input = new Uint8Array(input);
        else if(input instanceof Readable)
            input = Readable.toWeb(input);
        return input;
    },

    readStream(){
        let complete, buffer = [];

        const fbto = setTimeout(() => {
            this.emit('error', new Error('Client took too long before starting to send request body'), 408)
        }, this.#_options.timeout ?? 3000);

        this.on('data', chunk => {
            buffer.push(chunk);
        });

        this.on('close', () => {
            buffer = null;
            this.removeAllListeners();
        });

        this.on('aborted', () =>
            this.emit('error', new Error('Request aborted by the client')));

        return new Promise((resolve, reject) => {

            this.on('end', () => {
                clearTimeout(fbto);
                !complete && resolve(Buffer.concat(buffer));
                complete = true;
            });

            this.on('error', (err, code) => {
                clearTimeout(fbto);
                !complete && reject(this.res.error(code ?? 400, err.message));
                complete = true;
            });
        });
    }


}



module.exports = nativeNodeModule;


