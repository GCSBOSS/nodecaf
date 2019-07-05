const path = require('path');
const fs = require('fs');

const cli = require('cli');

const getConfFile = {
    toml: () => 'port = 80\n\ndebug = true\n\n'
}

// Generate conf file if specified.
function generateConfFile(input){
    if(typeof input.confPath !== 'string')
        return false;

    let confType = input.confType || 'toml';
    if(!(confType in getConfFile))
        throw new Error('Conf type not supported: ' + confType);

    // Create config file.
    if(!fs.existsSync(path.dirname(input.confPath)))
        fs.mkdirSync(path.dirname(input.confPath), { recursive: true });
    fs.writeFileSync(input.confPath, getConfFile[confType]());
    return confType;
}

// Create LIB folder and main server file.
function generateMainFile(projDir){
    let src = `
const { AppServer } = require('nodecaf');
const api = require('./api');\n
module.exports = function init(conf){
    let app = new AppServer(conf);\n
    let shared = {};
    app.expose(shared);\n
    app.onRouteError = function(input, err, send){\n\n    };\n
    app.beforeStart = async function(){\n\n    };\n
    app.afterStop = async function(){\n\n    };\n
    app.api(api);\n
    return app;
}\n`;

    fs.mkdirSync(projDir + '/lib');
    fs.writeFileSync(projDir + '/lib/main.js', src);
}

// Create API definition file.
function generateAPIFile(projDir){
    let src = `
module.exports = function({ post, get, del, head, patch, put }){\n\n}\n`;
    fs.writeFileSync(projDir + '/lib/api.js', src);
}

// Create BIN folder and the run binary.
function generateRunFile({ confPath, confType }, projDir, projName){
    let cps = confPath ? `,\n    confPath: '${confPath}'` : '';
    let cts = confType ? `,\n    confType: '${confType}'` : '';
    let src = `#!node\n
const { run } = require('nodecaf');
run({\n    init: require('../lib/main')${cps}${cts}\n});\n`;

    fs.mkdirSync(projDir + '/bin/');
    fs.writeFileSync(projDir + '/bin/' + projName + '.js', src);
}

module.exports = function init(input){
    input = input || cli.parse({
        path: [ 'p', 'Project root directory (defaults to working dir)', 'file', undefined ],
        confPath: [ 'c', 'Conf file path', 'file', undefined ],
        confType: [ false, 'Conf file extension', 'string', 'toml' ],
        name: [ 'n', 'A name/title for the app', 'string', undefined ]
    });

    let projDir = path.resolve(process.cwd(), input.path || '.');
    let pkgJSONPath = path.resolve(projDir, 'package.json');

    // Check for package.json
    if(!fs.existsSync(pkgJSONPath))
        throw new Error('package.json not found in: ' + pkgJSONPath);

    let pkgInfo = require(pkgJSONPath);
    let projName = input.name || pkgInfo.name || 'my-app';

    console.log('Generating basic file structure...');

    input.confType = generateConfFile(input);
    generateRunFile(input, projDir, projName);
    generateMainFile(projDir);
    generateAPIFile(projDir);

    // Add binary to package.json.
    pkgInfo.bin = { [projName]: 'bin/' + projName + '.js' };
    fs.writeFileSync(pkgJSONPath, JSON.stringify(pkgInfo));

    if(!('nodecaf' in (pkgInfo.dependencies || [])))
        console.log('Install nodecaf localy with:\n        npm i nodecaf');
    console.log('Install your app run binary with:\n        npm link');
};

module.exports.description = 'Generates a skelleton Nodecaf project file ' +
    'structure in the current directory';
