const assert = require('assert');
const AppServer = require('./app-server');
const loadConf = require('./conf-loader');

/* istanbul ignore next */
function term(app, debug){
    app.stop();
    if(debug)
        setTimeout(() => process.exit(0), 1000);
    else
        console.log('%s is shutting down', app.server.name);
}

/* istanbul ignore next */
function die(debug, err, origin){
    if(debug)
        console.log('Unhandled Exception', err, origin);
    else
        console.log('Unhandled Exception', err.message, origin);
    process.exit(1);
}

module.exports = {

    async run({ init, confType, confPath }){
        assert.equal(typeof init, 'function');

        // Load conf and inputs it on the app class.
        let settings = loadConf(confType || 'toml', confPath || false);
        let app = init(settings);
        assert(app instanceof AppServer);

        // Handle signals.
        let debug = settings.debug || false;
        process.on('SIGINT', term.bind(null, app, debug));
        process.on('SIGTERM', term.bind(null, app, debug));
        process.on('uncaughtException', die.bind(null, debug));

        // Starts the app.
        await app.start();
        console.log('%s listening at %s', app.name, app.server.address().port);
    },

    AppServer: AppServer,
    assertions: require('./assertions')
}
