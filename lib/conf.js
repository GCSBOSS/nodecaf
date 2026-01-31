/**
 * Check if a value is a plain object that can be safely merged
 * @param {any} val The value to check
 * @returns {boolean} True if value is a plain mergeable object (not an instance of custom classes)
 */
const isMergeableObject = val =>
    Boolean(val) && typeof val === 'object' &&
        (!val.constructor || 'Object' === val.constructor.name)

/**
 * Recursively merge multiple objects into a single object
 * @param  {...Object} subjects Objects to merge (later objects override earlier ones)
 * @returns {Object} A new object with all properties merged recursively
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
 * Layer (merge) multiple configuration objects together
 * Recursively combines configuration objects, with later arguments taking precedence
 * @param  {...(string|Object)} subjects Configuration objects or paths to configuration files
 * @returns {Object} A new merged configuration object
 */
module.exports.layerConf = function layerConf(...subjects){
    return deepMerge(...subjects);
}
