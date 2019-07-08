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
function die(app, debug, err, origin){
    if(app && app.log)
        app.log.fatal({ err: err }, 'FATAL ERROR');
    if(debug)
        console.log('Unhandled Exception', err, origin);
    else
        console.log('Unhandled Exception', err.message, origin);
    process.exit(1);
}

module.exports = async function run({ init, confType, confPath }){
    assert.equal(typeof init, 'function');

    // Load conf and inputs it on the app class.
    let app = init();
    assert(app instanceof AppServer);
    if(confPath)
        app.setup(confPath, confType);

    // Handle signals.
    let debug = app.settings.debug || false;
    process.on('SIGINT', term.bind(null, app, debug));
    process.on('SIGTERM', term.bind(null, app, debug));
    process.on('uncaughtException', die.bind(null, app, debug));
    process.on('unhandledRejection', die.bind(null, app, debug));

    // Starts the app.
    await app.start();
    console.log('%s listening at %s', app.name, app.server.address().port);
}
