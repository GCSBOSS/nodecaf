
const fs = require('fs');
const TOML = require('toml');
const YAML = require('yaml');
const path = require('path');

const loaders = {
    toml: conf => TOML.parse(fs.readFileSync(conf)),
    yaml: conf => YAML.parse(fs.readFileSync(conf, 'utf8'))
}

module.exports = function(type, conf){
    conf = conf || process.env.CONF_FILE || false;

    // Bale if not conf file is informed.
    if(!conf)
        return {};

    // Attempt loading said conf file.
    try{
        return loaders[type](conf);
    }

    // DOES NOT throw exception if conf file is not found.
    catch(e){
        console.log('Could not read conf file at: ' + path.resolve(conf));
        return {};
    }
}
