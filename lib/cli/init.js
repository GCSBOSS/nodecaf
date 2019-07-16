const path = require('path');
const ejs = require('ejs');
const fs = require('fs');

const template = name => fs.readFileSync(
    path.resolve(__dirname, '../codegen', name + '.ejs'),
    'utf-8'
);

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
    let src = ejs.render(template('main'), {}, {});
    fs.mkdirSync(projDir + '/lib');
    fs.writeFileSync(projDir + '/lib/main.js', src);
}

// Create API definition file.
function generateAPIFile(projDir){
    let src = ejs.render(template('api'), {}, {});
    fs.writeFileSync(projDir + '/lib/api.js', src);
}

// Create BIN folder and the run binary.
function generateRunFile(data, projDir, projName){
    let src = ejs.render(template('run'), data, {});
    fs.mkdirSync(projDir + '/bin/');
    fs.writeFileSync(projDir + '/bin/' + projName + '.js', src);
}

module.exports = {

    summary: 'Generates a skelleton Nodecaf project file structure in the current directory',
    options: {
        path: [ 'p', 'Project root directory (defaults to working dir)', 'path' ],
        confPath: [ 'c', 'Conf file path', 'file' ],
        confType: [ false, 'Conf file extension', 'type', 'toml' ],
        name: [ 'n', 'Name/title for the app (defaults to package.json\'s)', 'string' ]
    },

    callback(input){

        let projDir = path.resolve(process.cwd(), input.path || '.');
        let pkgJSONPath = path.resolve(projDir, 'package.json');

        // Check for package.json
        if(!fs.existsSync(pkgJSONPath))
            throw new Error('package.json not found in: ' + pkgJSONPath);

        let pkgInfo = require(pkgJSONPath);
        let projName = input.name || pkgInfo.name || 'my-app';

        if(fs.existsSync(projDir + '/lib'))
            throw new Error('The \'lib\' directory already exists');

        if(fs.existsSync(projDir + '/bin'))
            throw new Error('The \'bin\' directory already exists');

        input.confType = generateConfFile(input);
        generateRunFile(input, projDir, projName);
        generateMainFile(projDir);
        generateAPIFile(projDir);

        // Add binary to package.json.
        pkgInfo.bin = { [projName]: 'bin/' + projName + '.js' };
        fs.writeFileSync(pkgJSONPath, JSON.stringify(pkgInfo));

        if(!('nodecaf' in (pkgInfo.dependencies || [])))
            console.log('Install nodecaf localy with:\n    npm i --no-optional nodecaf');
        console.log('Install your app run binary with:\n    npm link');

    }
};
