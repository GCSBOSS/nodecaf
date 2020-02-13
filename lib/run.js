const assert = require('assert');
const AppServer = require('./app-server');

/* istanbul ignore next */
function term(app, debug){
    app.stop();
    if(debug)
        setTimeout(() => process.exit(0), 1000);
    else
        console.log('%s is shutting down', app.name);
}

/* istanbul ignore next */
function die(err){
    if(this.log)
        this.log.err(err, 'fatal error', 'fatal');
    else
        console.error(err);
    process.exit(1);
}

module.exports = async function run({ init, confPath }){
    assert.equal(typeof init, 'function');

    // Load conf and inputs it on the app class.
    let app = init();
    assert(app instanceof AppServer);
    if(confPath)
        app.setup(confPath);

    // Handle signals.
    let debug = app.settings.debug || false;
    process.on('SIGINT', term.bind(null, app, debug));
    process.on('SIGTERM', term.bind(null, app, debug));
    process.on('uncaughtException', die.bind(app));
    process.on('unhandledRejection', die.bind(app));

    // Starts the app.
    await app.start();
    console.log('%s v%s listening at %s', app.name, app.version, app.server.address().port);
}
