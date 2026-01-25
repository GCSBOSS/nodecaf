const fs = require('fs')
const path = require('path')

/**
 * Check if value is a mergeable object
 * @param {any} val Value to check
 * @returns {boolean} True if value is a mergeable object
 */
const isMergeableObject = val =>
    Boolean(val) && typeof val === 'object' &&
        (!val.constructor || 'Object' === val.constructor.name)

/**
 * Deep merge objects   
 * @param  {...Object} subjects Objects to merge
 * @returns {Object} Merged object 
 */
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

/**
 * Configuration loaders
 * @type {{ [type: string]: (path: string) => Object }}
 */
const loaders = {
    toml: conf => require('toml').parse(conf),
    json: conf => JSON.parse(conf)
}

/**
 * Load configuration from file
 * @param {string} conf Path to configuration file
 * @returns {Object} Loaded configuration
 */
function loadConf(conf){
    const type = path.extname(conf).slice(1);

    if(typeof loaders[type] !== 'function')
        throw new Error('Conf type not supported: ' + type);

    return loaders[type](fs.readFileSync(conf, 'utf-8'));
}

/**
 * Layer multiple configuration objects or files
 * @param  {...(string|Object)} subjects Configuration objects or paths to configuration files
 * @returns {Object} Layered configuration
 */
module.exports.layerConf = function layerConf(...subjects){
    subjects = subjects.map(c => typeof c == 'string' ? loadConf(c) : c);
    return deepMerge(...subjects);
}
