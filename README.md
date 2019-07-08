# [Nodecaf](https://gitlab.com/GCSBOSS/nodecaf)

> Docs for version v0.7.x.

Nodecaf is an Express framework for developing REST APIs in a quick and
convenient manner.
Using Nodecaf you'll get:
- Useful [handler arguments](#handlers-args).
- Built-in [settings file support](#settings-file).
- [Out-of-the-box logging](#logging) through Bunyan.
- Seamless support for [async functions as route handlers](#async-handlers).
- [Uncaught exceptions](#error-handling) in routes always produce proper REST
  responses.
- Built-in [assertions for most common REST scenarios](#rest-assertions).
- Function to [expose global objects](#expose-globals) to all routes (eg.:
  database connections).
- [HTTPS capability](#https).
- Functions to [describe your API](#api-description) making your code the main
  source of truth.
- Functions to [filter request bodies](#filter-requests-by-mime-type) by mime-type.
- CLI command to [generate a basic Nodecaf project structure](#init-project).
- CLI command to [generate an OpenAPI document](#open-api-support) or your APIs.

> If you are unfamiliar with Express, checkout
> [their routing docs](https://expressjs.com/en/starter/basic-routing.html)
> so that you can better grasp Nodecaf features and whatnot.

## Get Started

> `--no-optional` is meant to ignore DTrace package which is a compiled
> dependency of bunyan. Chek out
> [their issue](https://github.com/trentm/node-bunyan/issues/601).

1. Install the cli utilities: `npm i --no-optional -g nodecaf`.
2. Create or just go to your node project directory (you must have a
   `package.json`).
3. Add to your project with: `npm i --no-optional nodecaf`.
4. Create a skelleton project with: `nodecaf init`.
5. Add your globals in `lib/main.js`
```js
const { AppServer } = require('nodecaf');
const api = require('./api');

module.exports = function init(){
    let app = new AppServer();

    // Expose things to all routes putting them in the 'shared' object.
    let shared = {};
    app.expose(shared);

    // You can intercept all error that escape the route handlers.
    app.onRuoteError = function(input, err, send){
        // Any error that is not handled here will just become a harmless 500.
    };

    // Perform your server initialization logic.
    app.beforeStart = async function(){

    };

    // Perform your server finalization logic.
    app.afterStop = async function(){

    };

    // Load your routes and API definitions.
    app.api(api);

    // Don't forget to return your app.
    return app;
}
```

6. Add your routes in `lib/api.js`

```js
module.exports = function({ post, get, del, head, patch, put }){

    // Use express routes and a list of functions (async or regular no matter).
    get('/foo/:f/bar/:b', Foo.read, Bar.read);
    post('/foo/:f/bar', Foo.read, Bar.write);
    // ...
};
```

## Reporting Bugs
If you have found any problems with this module, please:

1. [Open an issue](https://gitlab.com/GCSBOSS/nodecaf/issues/new).
2. Describe what happened and how.
3. Also in the issue text, reference the label `~bug`.

We will make sure to take a look when time allows us.

## Proposing Features
If you wish to get that awesome feature or have some advice for us, please:
1. [Open an issue](https://gitlab.com/GCSBOSS/nodecaf/issues/new).
2. Describe your ideas.
3. Also in the issue text, reference the label `~proposal`.

## Contributing
If you have spotted any enhancements to be made and is willing to get your hands
dirty about it, fork us and
[submit your merge request](https://gitlab.com/GCSBOSS/nodecaf/merge_requests/new)
so we can collaborate effectively.

## Manual
On top of all the cool features Express offers, check out how to use all
the awesome goodies Nodecaf introduces.

### Handler Args

In this manual we address as **handler args** the keys in the object passed as
the only argument of any route handler function. The code below shows all
handler args exposed by Nodecaf:

```js
function({ req, res, next, query, params, body, flash, conf, log, error }){
    // Do your stuff.
}
```

Quick reference:

- `req`, `res`, `next`: The good old parameters used regularly in Express.
- `query`, `parameters`, `body`: Shortcuts to the homonymous properties of `req`.
  They contain respectively the query string, the URL parameters, and the request
  body data.
- `flash`: Is a shortcut to Express `req.locals`. Keys inserted in this a object
  are preserved for the lifetime of a request and can be accessed in all handlers
  of a route chain.
- `conf`: This object contains the entire
  [application configuration data](#settings-file).
- `log`: A bunyan logger instance. Use it to [log custom events](#logging) of
  your application.
- Also all keys of the [globally exposed object](#expose-globals) are available
  as handler args for all routes.
- `error`: A function to [output REST errors](#error-handling) and abort the
  handler chain execution.

### Settings File

Nodecaf allow you to read a configuration file and use it's data in all routes
and server configuration.

Use this feature to manage:
- external services data such as database credentials
- Nodecaf settings such as SSL and logging
- Your own server application settings for your users

Suported config formats: **TOML**, **YAML**

> Check out how to [generate a project with configuration file already plugged in](#init-project)

To setup a config file for an existing project, open the binary for your server
in `bin/proj-name.js`. Then add a `confPath` key to the run parameter object
whose value must be a string path pointing to your conf file.

The config data can be passed as an object to the app constructor in `lib/main.js`:

```js
module.exports = function init(){
    let conf = { key: 'value' };
    let app = new AppServer(conf);
}
```

You can use the config data through [it's handler arg](#handler-args) in
all route handlers as follows:

```js
post('/foo', function({ conf }){
    console.log(conf.key); //=> 'value'
});
```

#### Layered Configs

You can also use the `app.setup` to add a given configuration
file or object on top of the current one as follows:

```js
app.setup('/path/to/settings.toml');

app.setup('/path/to/settings.yaml', 'yaml');

app.setup({ key: 'value' });

app.setup({ key: 'new-value', foo: 'bar' });
```

Layering is useful, for example, to keep a **default** settings file in your server
source code to be overwritten by your user's.

### Logging

To setup Nodecaf logger you must add a `log` key to the application server config
object like this:

```js
conf.log = { file: 'path/to/conf/file.log' }; // Use this for a file
conf.log = { stream: process.stdout }; // Use this for a write stream
let app = new AppServer(conf);
```

You can also setup a log file in your settings file to be automatically
transferred to the `conf` argument of `init`.

```toml
[log]
file = "path/to/conf/file.log"
```

In your route handlers, use the `log` handler arg as a
[bunyan](https://github.com/trentm/node-bunyan) instance:

```js
function({ log }){
    log.info('hi');
    log.warn({lang: 'fr'}, 'au revoir');
}
```

Nodecaf will automatically log some useful server events as described in the
table below:

| Level | Event |
|-------|-------|
| warn  | An error happened inside a route after the headers were already sent |
| error | An error happened inside a route and was not caught |
| fatal | An error happened that crashed the server process |
| debug | A request has arrived |

### Async Handlers

Nodecaf brings the useful feature of accepting async functions as route handlers
with zero configuration. All rejections/error within your async handler will be
gracefully handled by the same routine the deals with regular functions. You will
be able to avoid callback hell without creating bogus adapters for your promises.

```js
get('/my/thing',
    function({ res, next }){
        res.send('My regular function works!');
        next();
    },
    async function({ res }){
        await myAsyncThing();
        res.end('My async function works too!');s
    }
);
```

### Error Handling

In Nodecaf, any uncaught synchronous error happening inside route handler will be
automatically converted into a harmless RESTful 500.

```js
post('/my/thing', function(){
    throw new Error('Should respond with a 500');
});
```

To support the callback error pattern, use the `error` handler arg.

```js
const fs = require('fs');

post('/my/thing', function({ error, res }){
    fs.readFile('./my/file', 'utf8', function(err, contents){
        if(err)
            return error(err, 'Optional message to replace the original');
        res.end(contents);
    });
});
```

To use other HTTP status codes you can send a string in the first parameter of
`error`. The supported error names are the following:

| Error name | Status Code |
|------------|-------------|
| `NotFound` | **404** |
| `Unauthorized` |  **401** |
| `ServerFault` | **500** |
| `InvalidActionForState` | **405** |
| `InvalidCredentials` | **400** |
| `InvalidContent` | **400** |

```js
post('/my/thing', function({ error }){
    try{
        doThing();
    }
    catch(e){
        error('NotFound', 'Optional message for the JSON response');
    }
});
```

You can always deal with uncaught exceptions in all routes through a default
global error handler. In your `lib/main.js` add an `onRuoteError` function
property to the `app`.

```js
app.onRuoteError = function(input, err, send){

    if(err instanceof MyDBError)
        send('ServerFalut', 'Sorry! Database is sleeping.');
    else if(err instanceof ValidationError)
        send('InvalidContent', err.data);
}
```

- The `send` function will instruct Nodecaf to output the given error.
- The `input` arg contain all handler args for the request.
- If you do nothing for a specific type of `Error` the normal 500 behavior will
  take place.

### REST Assertions

Nodecaf provides you with an assertion module containing functions to generate
the most common REST outputs based on some condition. Check an example to
trigger a 404 in case a database record doesn't exist.

```js
let { exist } = require('nodecaf').assertions;

get('/my/thing/:id', function({ params, db }){
    let thing = await db.getById(params.id);
    exist(thing, 'thing not found');

    doStuff();
});
```

If the record is not found, the `exist` call will stop the route execution right
away and generate a [RESTful `NotFound` error](#error-handling).

Along with `exist`, the following assertions with similar behavior are provided:

| Method | Error to be output |
|--------|--------------------|
| `valid` | `InvalidContent` |
| `authorized` | `Unauthorized` |
| `authn` | `InvalidCredentials` |
| `able` | `InvalidActionForState` |

To use it with callback style functions, pass the `error` handler arg as the
third parameter.

```js
let { exist } = require('nodecaf').assertions;

post('/my/file/:id', function({ error, res, params }){
    fs.readFile('./my/file/' + params.id, 'utf8', function(err, contents){
        exist(!err, 'File not found', error);
        res.end(contents);
    });
});
```

### Expose Globals

Nodecaf makes it simple to share global objects (eg.: database connections,
instanced libraries) across all route handlers. In your `lib/main.js` you can
expose an object of which all keys will become handler args.

```js
app.expose({
    db: myDbConnection,
    libX: new LibXInstance()
});
```

Then in all routes you can:

```js
get('/my/thing', function({ db, libX }){
    // use your global stuff
});
```

### HTTPS

In production it's generally desirable to have an HTTPS setup for both client to
API and API to API communications. You can enable SSL for your server by adding
a `ssl` key to your config, containing both the path for your key and cert.

```toml
[ssl]
key = "/path/to/key.pem"
cert = "/path/to/cert.pem"
```

When SSL is enabled the default server port becomes 443.

### Filter Requests by Mime-type

Nodecaf allow you to reject request bodies whose mime-type is not in a defined
white-list. Denied requests will receive a 400 response with the apporpriate
message.

Define a filter for the entire app on your `api.js`:

```js
module.exports = function({ }){

    this.accept(['json', 'text/html']);

}
```

Override the global accept per route on your `api.js`:

```js
const { accept } = require('nodecaf');

module.exports = function({ post, put }){

    // Define global accept rules
    this.accept(['json', 'text/html']);

    // Obtain accepts settings
    let json = accept('json');
    let img = accept([ 'png', 'jpg', 'svg', 'image/*' ]);

    // Prepend accept definition in each route chain
    post('/my/json/thing', json, myJSONHandler);
    post('/my/img/thing', img, myImageHandler);
}
```

### API Description

Nodecaf allows you to descibe your api and it's functionality, effectively turning
your code in the single source of truth. The described API can later be used to
[generate](#open-api-support) an [Open API](https://www.openapis.org/) compatible
document.

In `lib/api.js` describe your API as whole through the `info` parameter:

```js
module.exports = function({ get, info }){

    info({
        description: 'My awesome API that foos the bars and bazes the bahs'
    });

    get('/my/thing/:id', function(){
        // ...
    });
}
```

The `info` funciton expects an object argument on the OpenAPI
[Info Object](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.2.md#infoObject)
format. If not defined the `title` and `version` keys will default to your server's.

Describe your API endpoints by chaining a `desc` method to each route definition.

```js
module.exports = function({ get }){

    get('/my/thing/:id', function(){
        // ...
    }).desc('Retrieves a thing from the database\n' +
        `Searches the database for the thing with the given :id. Returns a
        NotFound error in case no thing is found.`);
}
```

The `desc` method takes a single string argument and uses it's first line (before `\n`)
to set the
[Operation object](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.2.md#operationObject)'s
`summary` property and the rest of the text to set the `description` (CommonMark).

### CLI

Nodecaf also provides some CLI tools to ease your development. To install the cli
commands, run: `npm i --no-optional -g nodecaf`.

Check below the commands we provide.

#### Init Project

`nodecaf init` Generates a skelleton Nodecaf project file structure in the current
directory.

> You must already have a well-formed package.json in the target directory.

**Options**

- `-p --path [directory]`: Project root directory (defaults to working dir)
- `-c --confPath [file]`: Generate a config file and plug it in the structure
- `-n --name [string]`: A name/title for the generated app structure
- `--confType (yaml | toml)`: The type for the generated config file

#### Open API Support

`nodecaf openapi` Generates an [Open API](https://www.openapis.org/) compliant
document of a given Nodecaf API.

**Options**

- `-o --outFile file`: A file path to save the generated document (required)
- `-p --path directory`: Project root directory (defaults to working dir)
- `--apiPath file`: A path to your project's API file (defaults to `lib/api.js`)
- `-t --type (json | yaml)`: The type of document to be generated (defaults to JSON)
- `-c --confPath [file]`: The config file to be considered
- `--confType (yaml | toml)`: The type of the given config file
