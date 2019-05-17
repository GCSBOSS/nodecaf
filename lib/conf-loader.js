
const fs = require('fs');
const toml = require('toml');
const path = require('path');

const loaders = {
    toml: conf => toml.parse(fs.readFileSync(conf))
}

module.exports = function(type, conf){
    /* istanbul ignore next */
    conf = conf || process.env.CONF_FILE || './conf.' + type;
    try{
        return loaders[type](conf);
    }
    catch(e){
        console.log('Could not read conf file at: ' + path.resolve(conf));
        return {};
    }
}
