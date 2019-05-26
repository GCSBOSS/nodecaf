const assert = require('assert');
const AppServer = require('./app-server');
const loadConf = require('./conf-loader');

module.exports = {

    async run({ init, confType, confPath }){
        assert.equal(typeof init, 'function');

        // Load conf and inputs it on the app class.
        let settings = loadConf(confType || 'toml', confPath || false);
        let app = init(settings);
        assert(app instanceof AppServer);

        // Handle signals.
        process.on('SIGINT', /* istanbul ignore next */ () => app.stop());
        process.on('SIGTERM', /* istanbul ignore next */ () => app.stop());

        // Starts the app.
        await app.start();
        console.log('%s listening at %s', app.server.name, app.server.address().port);
    },

    AppServer: AppServer,
    assertions: require('./assertions')
}
