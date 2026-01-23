const fs = require('fs')
const path = require('path')

const isMergeableObject = val =>
    Boolean(val) && typeof val === 'object' &&
        (!val.constructor || 'Object' === val.constructor.name)

function deepMerge(...subjects){

    const root = {}

    for(const obj of subjects){
        if(!isMergeableObject(obj))
            continue;

        for(const k in obj)
            root[k] = isMergeableObject(root[k]) && isMergeableObject(obj[k])
                ? deepMerge(root[k], obj[k])
                : root[k] = obj[k]
    }

    return root
}

const loaders = {
    toml: conf => require('toml').parse(conf),
    json: conf => JSON.parse(conf)
}

function loadConf(conf){
    const type = path.extname(conf).substr(1);

    if(typeof loaders[type] !== 'function')
        throw new Error('Conf type not supported: ' + type);

    return loaders[type](fs.readFileSync(conf, 'utf-8'));
}

module.exports.layerConf = function layerConf(...subjects){
    subjects = subjects.map(c => typeof c == 'string' ? loadConf(c) : c);
    return deepMerge(...subjects);
}
