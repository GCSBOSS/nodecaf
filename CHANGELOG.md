# Nodecaf Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
