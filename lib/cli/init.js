const path = require('path');
const fs = require('fs');

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
const { AppServer } = require('nodecaf');\n
module.exports = function init(conf){\n
    let app = new AppServer(conf);\n
    let shared = {};
    app.expose(shared);\n
    app.api(({ post, get, del, head, patch, put }) => {\n\n    });\n
    app.on('error', function(input, err, send){\n\n    });\n
    app.beforeStart = async function(){\n\n    };\n
    app.afterStop = async function(){\n\n    };\n
    return app;
}\n`;

    fs.mkdirSync(projDir + '/lib');
    fs.writeFileSync(projDir + '/lib/main.js', src);
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
    input = input || {};

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

    // Add binary to package.json.
    pkgInfo.bin = { [projName]: 'bin/' + projName + '.js' };
    fs.writeFileSync(pkgJSONPath, JSON.stringify(pkgInfo));

    if(!('nodecaf' in (pkgInfo.dependencies || [])))
        console.log('Install nodecaf localy with:\n        npm i nodecaf');
    console.log('Install your app run binary with:\n        npm link');
};
