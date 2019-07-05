const path = require('path');
const fs = require('fs');

const cli = require('cli');
const YAML = require('yaml');

const APIDoc = require('../open-api');
const loadConf = require('../conf-loader');

const stringify = {
    'yaml': YAML.stringify,
    'json': JSON.stringify
}

module.exports = function openapi(input){
    input = input || cli.parse({
        path: [ 'p', 'Project root directory (defaults to working dir)', 'file', undefined ],
        apiPath: [ false, 'The path to your API file (defaults to ./lib/api.js)', 'file', './lib/api.js' ],
        type: [ 't', 'A type of output file [yaml || json] (defaults to json)', 'string', 'yaml' ],
        confPath: [ 'c', 'Conf file path', 'file', undefined ],
        confType: [ false, 'Conf file extension', 'string', 'toml' ],
        outFile: [ 'o', 'Output file (required)', 'file', undefined ]
    });

    let projDir = path.resolve(process.cwd(), input.path || '.');
    let pkgJSONPath = path.resolve(projDir, 'package.json');

    // Check for package.json
    if(!fs.existsSync(pkgJSONPath))
        throw new Error('package.json not found in: ' + pkgJSONPath);


    let apiPath = path.resolve(projDir, input.apiPath);
    if(!fs.existsSync(apiPath))
        throw new Error('api.js not found in: ' + apiPath);

    let settings = loadConf(input.confType, input.confPath || false);

    let doc = new APIDoc(settings);
    doc.api(require(apiPath));
    let specObject = doc.spec();

    let type = input.type || 'json';
    let output = stringify[type](specObject);
    let outFile = path.resolve(projDir, input.outFile || './output.' + type);
    fs.writeFileSync(outFile, output);
};

module.exports.description = 'Generates an Open API compliant document of a ' +
    'given Nodecaf API';
