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
 * Layer multiple configuration objects or files
 * @param  {...(string|Object)} subjects Configuration objects or paths to configuration files
 * @returns {Promise<Object>} Layered configuration
 */
module.exports.layerConf = function layerConf(...subjects){
    return deepMerge(...subjects);
}
