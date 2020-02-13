const assert = require('assert');
const AppServer = require('./app-server');

/* istanbul ignore next */
function term(){
    this.stop();
    if(!process.env.NODE_ENV)
        setTimeout(() => process.exit(0), 1000);
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
    process.on('SIGINT', term.bind(app));
    process.on('SIGTERM', term.bind(app));
    process.on('uncaughtException', die.bind(app));
    process.on('unhandledRejection', die.bind(app));

    // Starts the app.
    await app.start();
}
