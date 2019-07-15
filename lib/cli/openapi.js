const path = require('path');
const fs = require('fs');

const YAML = require('yaml');

const APIDoc = require('../open-api');
const loadConf = require('../conf-loader');

const stringify = {
    'yaml': YAML.stringify,
    'json': JSON.stringify
}

module.exports = {
    summary: 'Generates an Open API compliant document of a given Nodecaf API',
    options: {
        path: [ 'p', 'Project root directory (defaults to working dir)', 'path' ],
        apiPath: [ false, 'The path to your API file (defaults to ./lib/api.js)', 'file', './lib/api.js' ],
        type: [ 't', 'A type of output file [yaml || json] (defaults to json)', 'type', 'yaml' ],
        confPath: [ 'c', 'Conf file path', 'file' ],
        confType: [ false, 'Conf file extension', 'type', 'toml' ]
    },
    expectedArgs: [ 'OUTFILE' ],
    callback(input, outfile){
        let projDir = path.resolve(process.cwd(), input.path || '.');
        let pkgJSONPath = path.resolve(projDir, 'package.json');

        // Check for package.json
        if(!fs.existsSync(pkgJSONPath))
            throw new Error('package.json not found in: ' + pkgJSONPath);

        let apiPath = path.resolve(projDir, input.apiPath || 'none.none');
        if(!fs.existsSync(apiPath))
            throw new Error('api.js not found in: ' + apiPath);

        if(input.confPath)
            var settings = loadConf(input.confPath, input.confType);

        let doc = new APIDoc(settings);
        doc.api(require(apiPath));
        let specObject = doc.spec();

        let type = input.type || 'json';
        let output = stringify[type](specObject);
        outfile = path.resolve(projDir, outfile || './output.' + type);

        fs.writeFileSync(outfile, output);
    }
};
