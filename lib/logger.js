const Logger = require('golog');

function parseWs({ ws }){
    if(!ws)
        return {};
    let client = ws._socket ? ws._socket.address().address :  ws.addr;
    return { ws: null, type: 'websocket', client };
}

module.exports = {

    createLogger(app, conf){
        conf && (conf.defaults = { app });
        let logger = new Logger(conf);
        logger.addParser(parseWs);
        return logger;
    }

};
