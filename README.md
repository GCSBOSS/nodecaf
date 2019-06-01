
# Restify App

> Docs for version v0.2.0.

Restify App is a thin wrapper around [Restify](http://restify.com) functionality.
Aims to provide easy to write routing and server logic along with a useful
seamless promise adapter for async functions on the routing system.

## Get Started
1. Add to your project with: `npm i restify-app`.
2. In your code:

```js
// lib/main.js
const { AppServer } = require('restify-app');

module.exports = function init(conf){

    let app = new AppServer(conf);

    // Expose objects to all routes.
    app.expose({ db: myDbConnection });

    app.route(({ get, post /*, del ... */ }) => {

        // Use restify routes and a list of functions (async or regular no matter).
        get('/foo/:f/bar/:b', Foo.read, Bar.read);
        post('/foo/:f/bar', Foo.read, Bar.write);
    });

    // Handle all application exception you may wish to throw.
    app.on('error', function(req, res, err, send){

        if(err.constructor.name == 'FooBarError')
            send('BadRequest', 'My foo is baring');

    });

    // Perform server initialization logic.
    app.beforeStart = async function(){
        await myDbConnection.connect(conf.dbData);
    };

    // Perform server finalization logic.
    app.afterStop = async function(){
        await myDbConnection.close();
    };

    // Don't forget to return your app.
    return app;
}
```

And a binary for running as CLI.

```js
#!node
// bin/my-app.js

const { run } = require('restify-app');
const init = require('../lib/main');
run({ init: init, confPath: 'my/conf/file.toml', confType: 'toml' });

// You can use CONF_FILE env var to determine conf path instead of parameter.
```

## Reporting Bugs
If you have found any problems with this module, please:

1. [Open an issue](https://gitlab.com/GCSBOSS/rstify-app/issues/new).
2. Describe what happened and how.
3. Also in the issue text, reference the label `~bug`.

We will make sure to take a look when time allows us.

## Proposing Features
If you wish to have that awesome feature or have any advice for us, please:
1. [Open an issue](https://gitlab.com/GCSBOSS/rstify-app/issues/new).
2. Describe your ideas.
3. Also in the issue text, reference the label `~proposal`.

## Contributing
If you have spotted any enhancements to be made and is willing to get your hands dirty about it, fork us and [submit your merge request](https://gitlab.com/GCSBOSS/rstify-app/merge_requests/new) so we can collaborate effectively.
