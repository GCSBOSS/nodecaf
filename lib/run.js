
const Nodecaf = require('./main');

module.exports = function run(opts = {}){

    const app = require(opts.path)();

    if(! (app instanceof Nodecaf))
        throw new TypeError('Init function must return a Nodecaf instance');

    const confPath = opts.conf || [];
    const confs = Array.isArray(confPath) ? confPath : [confPath];
    confs.forEach(c => c && app.setup(c));

    /* istanbul ignore next */
    function term(){
        app.stop();
        if(!process.env.NODE_ENV)
            setTimeout(() => process.exit(0), 1000);
    }

    /* istanbul ignore next */
    function die(err){
        if(app?.log)
            app.log.fatal({ err, type: 'crash' });
        else
            console.error(err);
        process.exit(1);
    }

    process.on('SIGINT', term);
    process.on('SIGTERM', term);
    process.on('uncaughtException', die);
    process.on('unhandledRejection', die);

    app.start();

    return app;
}
