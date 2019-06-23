const bunyan = require('bunyan');

module.exports = function setupLogger(conf){
    conf = conf || {};
    let level = conf.level || bunyan.INFO;

    // Prepare logger instance.
    this.log = bunyan.createLogger({
        name: this.name,
        serializers: bunyan.stdSerializers
    });

    // Desable logging if no output method is defined.
    if(!conf.file && !conf.stream){
        this.log.level(bunyan.FATAL + 1);
        return;
    }

    // Remove default stdout stream.
    this.log.streams.shift();

    // if 'stream' is set.
    if(conf.stream)
        this.log.addStream({ stream: conf.stream, level: level });

    // If 'file' is set.
    else
        this.log.addStream({ path: conf.file, level: level });

    // Setup logging for every request.
    this.express.use((req, res, next) => {
        this.log.debug({ req: req }, 'REQUEST');
        next();
    });
}
