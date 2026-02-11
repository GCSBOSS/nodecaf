/**
 * @module conf
 * @description Configuration management. Provides deep merging of configuration objects and
 * support for layered configuration composition.
 * @example
 * const baseConfig = { db: { host: 'localhost' } };
 * const envConfig = { db: { port: 5432 } };
 * const merged = layerConf(baseConfig, envConfig);
 * // Result: { db: { host: 'localhost', port: 5432 } }
 */

/**
 * Check if a value is a plain object that can be safely merged
 * @param {unknown} val The value to check
 * @returns {val is Object.<string, unknown>} True if value is a plain mergeable object (not an instance of custom classes)
 */
const isMergeableObject = val =>
    Boolean(val) && typeof val === 'object' &&
        (!val.constructor || 'Object' === val.constructor.name)

/**
 * Recursively merge multiple objects into a single object
 * @param  {...Object.<string, unknown>} subjects Objects to merge (later objects override earlier ones)
 * @returns {Object.<string, unknown>} A new object with all properties merged recursively
 */
function deepMerge(...subjects){

    /** @type {Object.<string, unknown>} */
    const root = Object.create(null);

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
 * @param  {...Object.<string, unknown>} subjects Configuration objects or paths to configuration files
 * @returns {Object.<string, unknown>} A new merged configuration object
 */
export function layerConf(...subjects){
    return deepMerge(...subjects);
}
