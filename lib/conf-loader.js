
const fs = require('fs');
const toml = require('toml');
const path = require('path');

const loaders = {
    toml: conf => toml.parse(fs.readFileSync(conf))
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
