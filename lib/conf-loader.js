
const fs = require('fs');
const TOML = require('toml');
const YAML = require('yaml');

const loaders = {
    toml: conf => TOML.parse(fs.readFileSync(conf)),
    yaml: conf => YAML.parse(fs.readFileSync(conf, 'utf8'))
}

module.exports = function loadConf(conf, type){
    type = type || 'toml';

    if(typeof loaders[type] !== 'function')
        throw new Error('Conf type not supported: ' + type);

    // Attempt loading said conf file.
    try{
        return loaders[type](conf);
    }
    catch(e){
        throw new Error('Couldn\'t open conf file: ' + conf);
    }
}
