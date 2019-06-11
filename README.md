# Nodecaf

> Docs for version v0.5.x.

Nodecaf is an HTTP API framework running [Express](https://expressjs.com/) behind the scenes and providing some generally necessary functionality to speed up your development.
Aims to provide easy to write routing and server logic along with a useful
seamless promise adapter for async functions on the routing system.

## Get Started
1. Install the cli utilities: `npm i -g nodecaf`.
2. Create or just go to your node project directory.
3. Add to your project with: `npm i nodecaf`.
4. Create a skelleton project with: `nodecaf init`.
5. Add your routes in `lib/main.js`

```js

const { AppServer } = require('nodecaf');

module.exports = function init(conf){

    let app = new AppServer(conf);

    // Expose things to all routes putting them on the 'shared' object.
    let shared = {};
    app.expose(shared);

    app.route(({ post, get, del, head, patch, put }) => {

        // Use express routes and a list of functions (async or regular no matter).
        get('/foo/:f/bar/:b', Foo.read, Bar.read);
        post('/foo/:f/bar', Foo.read, Bar.write);
        // ...
    });

    // You can intercept all error that escape the route handlers.
    app.on('error', function(req, res, err, send){
        // Any error that is not handled here will just become a harmless 500.
    });

    // Perform your server initialization logic.
    app.beforeStart = async function(){

    };

    // Perform your server finalization logic.
    app.afterStop = async function(){

    };

    // Don't forget to return your app.
    return app;
}
```

## Reporting Bugs
If you have found any problems with this module, please:

1. [Open an issue](https://gitlab.com/GCSBOSS/nodecaf/issues/new).
2. Describe what happened and how.
3. Also in the issue text, reference the label `~bug`.

We will make sure to take a look when time allows us.

## Proposing Features
If you wish to have that awesome feature or have any advice for us, please:
1. [Open an issue](https://gitlab.com/GCSBOSS/nodecaf/issues/new).
2. Describe your ideas.
3. Also in the issue text, reference the label `~proposal`.

## Contributing
If you have spotted any enhancements to be made and is willing to get your hands dirty about it, fork us and [submit your merge request](https://gitlab.com/GCSBOSS/nodecaf/merge_requests/new) so we can collaborate effectively.
