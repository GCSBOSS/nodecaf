const bunyan = require('bunyan');

module.exports = function setupLogger(conf){
    conf = conf || {};

    // Prepare logger instance.
    this.log = bunyan.createLogger({
        name: this.name,
        level: conf.level,
        serializers: bunyan.stdSerializers
    });

    // Desable logging if no output method is defined.
    if(!conf.file && !conf.stream){
        this.log.level = bunyan.FATAL + 1;
        return;
    }

    // Remove default stdout stream.
    this.log.streams.shift();

    // if 'stream' is set.
    if(conf.stream)
        this.log.addStream({ stream: conf.stream });

    // If 'file' is set.
    else
        this.log.addStream({ path: conf.file });

    // Setup logging for every request.
    if(conf.requests === true)
        this.express.use((req, res, next) => {
            this.log.info({ req: req }, 'REQUEST');
            next();
        });
}
