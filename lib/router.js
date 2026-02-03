
/**
 * Creates a new trie node
 * @returns {Object} A new trie node
 */
function createNode() {
    return {
        static: Object.create(null),
        param: null,
        wildcard: null,
        handler: null,
        paramName: null
    };
}

/**
 * Normalizes a path by removing trailing slashes (except for root)
 * @param {string} path The route path
 * @returns {string} Normalized path
 */
function normalizePath(path) {
    if(path.length > 1 && path.endsWith('/')) 
        return path.slice(0, -1);
    return path;
}

/**
 * @typedef MatchResult
 * @property {Function} handler The matched route handler
 * @property {Object.<string, string>} [params] The captured route parameters
 */

/**
 * Router class for managing HTTP routes with static and dynamic path segments.
 */
export class Router {
    
    /** @type {{ [methodPath: string]: boolean }} */
    #_duplicateCheck;

    /** @type {{ [method: string]: { [path: string]: Function } }} */
    #_staticRoutes;

    /** @type {{ [method: string]: Object }} */
    #_trees;

    constructor() {
        this.#_staticRoutes = Object.create(null);
        this.#_trees = Object.create(null);
        this.#_duplicateCheck = Object.create(null);
    }

    /**
     * Matches a method and path, returning the handler and captured parameters.
     * @param {string} method HTTP method (e.g., 'GET', 'POST')
     * @param {string} path Request path
     * @returns {MatchResult|false}
     */
    match(method, path) {
        method = method.toUpperCase();
        path = normalizePath(path);
    
        // 1. O(1) Static Check
        const methodStatics = this.#_staticRoutes[method];
        if(methodStatics && methodStatics[path]) 
            return { handler: methodStatics[path], params: {} };
    
        let node = this.#_trees[method];
        if(!node) 
            return false;

        let params = null; 
        let lastWildcard = null;
        let lastWildcardPathIndex = -1;

        let start = 1;
        const len = path.length;

        while(start < len) {
            let end = path.indexOf('/', start);
            if(end === -1) 
                end = len;
        
            const segment = path.slice(start, end);

            if(node.wildcard) {
                lastWildcard = node.wildcard;
                lastWildcardPathIndex = start; 
            }

            // 1. Static Priority
            const staticChild = node.static[segment];
            if(staticChild) 
                node = staticChild;
         
            // 2. Named Parameter Priority
            else if(node.param) {
                params = params || {};
                if(segment.indexOf('%') !== -1)
                    params[node.param.paramName] = decodeURIComponent(segment);
                else
                    params[node.param.paramName] = segment;
                node = node.param;
            } 
            // 3. Backtracking to Wildcard
            else if(lastWildcard) {
                params = params || {};
                params[lastWildcard.paramName] = path.slice(lastWildcardPathIndex);
                return { handler: lastWildcard.handler, params };
            } 
            else
                return false;

            start = end + 1;
        }

        // Final Resolution
        const handler = node.handler || (lastWildcard ? lastWildcard.handler : null);
        if(!handler) 
            return false;

        // Handle terminal wildcard (path finished but node has no handler)
        if(!node.handler && lastWildcard) {
            params = params || {};
            params[lastWildcard.paramName] = path.substring(lastWildcardPathIndex);
        }

        return { handler, params: params };
    }

    /**
     * Adds a new route to the router
     * @param {string} method HTTP method (e.g., 'GET', 'POST')
     * @param {string} path Route path (can include :param and ...wildcard)
     * @param {Function} handler Route handler function
     */
    add(method, path, handler) {

        if(typeof method != 'string')
            throw new TypeError(`Method must be a string. Found: '${typeof method}'`);

        if(typeof path != 'string')
            throw new TypeError(`Path must be a string. Found: '${typeof path}'`);

        if(typeof handler != 'function')
            throw new TypeError(`'${path} ${path}' handler must be a function. Found '${typeof handler}'`);
    
        method = method.toUpperCase();
        path = normalizePath(path);

        if(!this.#_staticRoutes[method]) 
            this.#_staticRoutes[method] = Object.create(null);

        if(!this.#_trees[method]) 
            this.#_trees[method] = createNode();

        if(this.#_duplicateCheck[method + ' ' + path])
            throw new Error(`Route already exists for ${method} ${path}`);

        this.#_duplicateCheck[method + ' ' + path] = true;

        if(!path.includes(':') && !path.includes('...')) {
            this.#_staticRoutes[method][path] = handler;
            return;
        }

        const segments = path.split('/').slice(1);
        let node = this.#_trees[method];

        for(const segment of segments) 
            if(segment.startsWith('...')) {
                node.wildcard = createNode();
                node.wildcard.paramName = segment.slice(3);
                node.wildcard.handler = handler;
                return;
            }
            else if(segment[0] === ':') {
                if(!node.param) {
                    node.param = createNode();
                    node.param.paramName = segment.slice(1);
                }
                node = node.param;
            }
            else
                node = node.static[segment] ||= createNode();
            
        
        node.handler = handler;
    }
}