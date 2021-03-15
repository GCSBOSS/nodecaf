# Nodecaf Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v0.11.5] - 2021-03-15

### Added
- hostname key to log entries

## [v0.11.4] - 2021-01-21

### Added
- `pre()` and `pos()` hooks functionality

### Fixed
- memory leak during cors
- assertion responding with text 'undefined' when no message is set

### Removed
- automatic gzip for payloads of over 4kb
- a lot of dead-weight from useless dependencies

## [v0.11.3] - 2020-12-14

### Fixed
- `res.cookie()` modifying input options object making it impossible to reuse

## [v0.11.2] - 2020-12-12

### Fixed
- `all()` responding 404 to / path

## [v0.11.1] - 2020-11-24

### Added
- `fork()` to run functions as middlewares from outside of the chain

### Changed
- error responses to include proper automatic `Content-Type`

## [v0.11.0] - 2020-11-20

### Added
- constructor option to build a custom web server
- `app.trigger()` method to call routes programatically bypassing HTTP layer
- `all()` handler function to match all routes in a fall back style

### Changed
- http server to be optional
- a few log types for
- error hangling behavor to spit errors on respose body on DEV environment only

### Removed
- HTTPS/SSL configurations and feature
- WS endpoints feature

## [v0.10.1] - 2020-08-10

### Added
- opts to manually set app name and version

### Fixed
- wrong package.json being read for name and version due to changes on main exports

## [v0.10.0] - 2020-08-07

### Added
- `res.type()` method for defining content type header
- `res.text()` for ending response with text/plain body
- log entry when failed to parse request body
- missing cookie passing to websocket handlers
- log entry for app startup logic before server is actualy listening
- option to disable log completely through conf `log = false`
- auto-parsing of keys `err`, `res`, `req` and `ws` on logger methods
- assertion methods to `res` handler arg (`notFound`, `badRequest`...)

### Changed
- constructor interface to accept a single `opts` object instead of conf
- `class` and `name` fields from log entries to `type` and `app` respectively
- form-data file handling interface fields
- response log entry to include request method along with path
- socket object var name from `client` to `ws` on websocket handler args
- main class name from `AppServer` ro `Nodecaf`
- main exports to point directly to main class
- rest assertions to now output any default request body
- `app.accept()` to generate an accept middleware instead of setting global accept rules

### Removed
- `app.onRouteError` handler
- `app.name` and `app.version` that are now always inferred from package.json
- `app.beforeStart` and `app.afterStop` in favor of `opts.startup` and `opts.shutdown` respectively
- express instance entirely
- `app.expose()` method in favor of using `app.global` object directly
- `app.api()` method in favor of `opts.api`
- `app.cookieSecret` attribute in favor of setting conf `cookie.secret`
- `app.port` attribute, use config `port` instead
- `error()` handlers arg in favor of `res.error()`
- `assertions` module from main export in favor of response object assertions
- middleware `accept` setting

## [v0.9.5] (hotfix) - 2021-01-13

### Fixed
- body request being logged to console every time

## [v0.9.4] (hotfix) - 2020-11-09

### Fixed
- Add missing cookies support to WS handlers

## [v0.9.3] - 2020-08-07

### Security
- Fixed vulnerability on outdated version of express fileupload dependency

## [v0.9.2] - 2020-06-23

### Added
- ws connection error handler interface

### Fixed
- uncaught error when request is aborted during body reading
- error while calling `stop()` during startup process

### Changed
- logger to use non-blocking I/O
- all websocket log entries to debug level

### Removed
- date leaving only time on log entries in dev env

## [v0.9.1] - 2020-04-16

### Added
- setting to wait given milliseconds before starting the app

### Removed
- conf live reloading feature now included in separate run module

## [v0.9.0] - 2020-04-10

### Fixed
- missing service name in log entries

### Changed
- ws handler functions to expose handler args object as argument

### Removed
- run binary in favor of using cli run command
- references to `settings` in favor of `conf`

## [v0.8.5] - 2020-03-11

### Changed
- request and response log entries level to 'debug'
- 5xx response log entries level to 'warn'
- exposed app instance to all route handlers via 'this'

### Fixed
- ws hang up when connection url has a query string

## [v0.8.4] - 2020-03-01

### Fixed
- bug of undefined variable in dev env due to last logger refactoring

## [v0.8.3] - 2020-03-01

### Added
- ANSI colors to log entries in dev environment
- setting to filter log entries by level and class
- settings to fully control CORS middle-ware (express default one)

### Fixed
- error gathering name and version from module without a package.json
- errors when calling start or stop more than once

### Changed
- app.version and app.name to point to package.json values by default

## [v0.8.2] - 2020-02-18

### Added
- WebSocket routes functionality allowing to define ws handlers in given url paths
- missing response log entries when route is not found or an api wasn't defined

## [v0.8.1] - 2020-02-13

### Added
- app attribute exposing server port number
- app attribute to toggle conf live reload instead of relying on debug mode

### Changed
- hange global error handler to log errors properly instead of just dumping
- uncaught errors ungly dump to proper log entry
- SIGTER and SIGINT handling to rely on NODE_ENV instead of debug mode

### Removed
- startup and terminate raw console messages in favor of server log entries
- debug mode setting

## [v0.8.0] - 2020-02-11

### Added
- interface for logging to stdout as per 12 factor app
- automatic log entry to all http responses sent by the server

### Fixed
- unhandled exception for 'undefined' or 'null' route handlers
- intentional 500 responses being logged as uncaught route errors

### Changed
- default service name hoping to force authors into changing it

### Removed
- file/stream logging api in favor of stdout logging only

### Security
- fixed vulnerability on express-fileupload dependency by upgrading it

## [v0.7.10] - 2019-10-16

### Added
- conf argument to 'restart' method for updating the settings
- 'running' property to check whether the server is listening
- conf as an arg object key to API callback

### Fixed
- log entry for uncaught errors to use the original error stack and name
- config layering for null values to not throw errors anymore

### Removed
- config data form server start, stop and restart log entries

## [v0.7.9] - 2019-09-26

### Changed
- the logging system to use [golog](https://gitlab.com/GCSBOSS/golog) instead of bunyan

### Removed
- `version` and `hosname` properties from log entries

### Fixed
- configuration layering to properly merge objects

## [v0.7.8] - 2019-09-06

### Added
- express cookie parser enabled by default
- app option to hold a secret for signing cookies
- request headers to handler args
- logging function and conf object to start and stop handlers arguments

### Changed
- ssl key and cert files to be read on every setup
- server start log entry to only include conf data when in debug mode

## [v0.7.7] - 2019-07-30

### Added
- setting to rebuild the API on every start or setup
- log entries for server start, stop and restart event
- live application reload for conf file changes in debug mode
- support for JSON conf files

### Changed
- status when API was not setup from 'Not Found' to 'Service Unavailable'
- conf file logic to use [Confort](https://www.npmjs.com/package/confort) module

### Removed
- all CLI functionality to [own project](https://gitlab.com/GCSBOSS/nodecaf-cli)
- conf type parameter in favor of reading the extension of path

## [v0.7.6] - 2019-07-24

### Added
- setting to permissively allow CORS on all routes

## [v0.7.5] - 2019-07-23

### Added
- setting for a path where to store files uploaded as `multipart/form-data`
- app version to startup message when running through binary

## [v0.7.4] - 2019-07-22

### Added
- option to disable all request body parsing

### Removed
- ability to set up app name and version through config files

## [v0.7.3] - 2019-07-16

### Changed
- minor details in cli outputs due to internal library changes (eclipt, ejs)

### Removed
- deprecated `conf` param from the `main.js` generated by `nodecaf init`
- `-o, --outfile` option of `nodecaf openapi` in favor of a positional argument

## [v0.7.2] - 2019-07-09

### Fixed
- bug when filtering requests with charset on content-type

## [v0.7.1] - 2019-07-08

### Added
- a function to apply config files on top of each other

### Fixed
- type filtering to not require content-type from requests without body

### Changed
- parser to ignore request body when no content-length is present

### Removed
- the settings argument that used to be passed to user init function

## [v0.7.0] - 2019-07-07

### Added
- support for YAML config files
- app method to filter requests by body content-type app-wide
- top-level function to define per-route content-type filtering rules
- default generic request body description to open api doc operations
- accepted mime-types to operation request body api doc
- global CLI help command to list available commands and usage
- CLI command to output version of the globally installed Nodecaf
- `--no-optional` flag to install command output by `nodecaf init`

### Fixed
- CLI error: unknown type "as-is" on cli options
- CLI init error when lib or bin directory already exists

### Changed
- error messages to not be JSON by default

## [v0.6.0] - 2019-06-24

### Added
- parameters for project name and directory to cli init command
- version setting to app class
- functions to describe/document your api
- cli command to generate Open API compatible documentation (`nodecat openapi`)
- HTTPS support through setting
- error log entry for uncaught route errors
- log entry for uncaught errors that crash the server process
- complete functionality documentation to readme

### Fixed
- the cli commands to not share the same parameters
- deprecation warning because of old Express `del` command
- route not found error output as HTML
- log level setting (now it works)
- handling of rejected promises to output a clean message

### Changed
- `route`method was renamed to `api`
- cli init to henerate routing in a seperate api.js file
- error handling interface and use express built-in functionality

## [v0.5.3] - 2019-06-13

### Added
- missing default message for REST errors thrown from assertions

### Fixed
- code generation error standard

### Changed
- code generation to use spaces instead of tabs

## [v0.5.2] - 2019-06-12

### Added
- missing default message for REST errors thrown as strings
- missing options for conf file generation with cli init

### Fixed
- user error handler not being executed when headers were already sent
- undefined server name being shown when terminating from command line

## [v0.5.1] - 2019-06-11

### Added
- log warning when an error happens after the response haders have been sent

### Changed
- Logger now serializes 'req' key as a node request object

### Fixed
- Fixed undefined app name field being shown when running from command line
- Fixed undefined error on subsequent close calls

## [v0.5.0] - 2019-06-10

- **Renamed project to Nodecaf**

### Added
- path field to request log entry

### Changed
- Moved from Restify to Express for the internal route server
- conf file generation to create parent directories if needed

### Fixed
- Fixed server to correctly await start and close events

## [v0.4.1] - 2019-06-02

### Added
- setting to log all incoming requests
- logging capabilities through bunyan package

## [v0.4.0] - 2019-06-01

### Added
- capability for assertion module to be used on async callbacks
- cli command to generate the basic file structure for nodecaf projects

### Changed
- terminal signal and uncaught exception handling
- error handling code for better interface consistency

## [v0.3.0] - 2019-05-29

### Fixed
- conf loader to not output warning when no conf path is provided
- exception when route errors would trigger an error event without listeners
- default error handler that would attach itself again on every request

## [v0.2.0] - 2019-05-27

### Added
- an Assertions module to handle common REST exception scenarios.

### Changed
- error handling to always produce a valid REST output.

## [v0.1.0] - 2019-05-17
- First officially published version.

[v0.1.0]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.1.0
[v0.2.0]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.2.0
[v0.3.0]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.3.0
[v0.4.0]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.4.0
[v0.4.1]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.4.1
[v0.5.0]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.5.0
[v0.5.1]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.5.1
[v0.5.2]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.5.2
[v0.5.3]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.5.3
[v0.6.0]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.6.0
[v0.7.0]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.7.0
[v0.7.1]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.7.1
[v0.7.2]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.7.2
[v0.7.3]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.7.3
[v0.7.4]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.7.4
[v0.7.5]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.7.5
[v0.7.6]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.7.6
[v0.7.7]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.7.7
[v0.7.8]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.7.8
[v0.7.9]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.7.9
[v0.7.10]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.7.10
[v0.8.0]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.8.0
[v0.8.1]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.8.1
[v0.8.2]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.8.2
[v0.8.3]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.8.3
[v0.8.4]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.8.4
[v0.8.5]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.8.5
[v0.9.0]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.9.0
[v0.9.1]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.9.1
[v0.9.2]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.9.2
[v0.9.3]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.9.3
[v0.9.4]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.9.4
[v0.9.5]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.9.5
[v0.10.0]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.10.0
[v0.10.1]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.10.1
[v0.11.0]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.11.0
[v0.11.1]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.11.1
[v0.11.2]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.11.2
[v0.11.3]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.11.3
[v0.11.4]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.11.4
[v0.11.5]: https://gitlab.com/GCSBOSS/nodecaf/-/tags/v0.11.5
