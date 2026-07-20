/**
 * @module cors
 * @description Cross-Origin Resource Sharing (CORS) handling. Processes CORS requests including
 * preflight OPTIONS requests, origin validation, and header management.
 * @example
 * const corsOptions = { 
 *   origin: /example\.com$/, 
 *   credentials: true, 
 *   methods: 'GET,POST' 
 * };
 * cors(corsOptions, method, headers, res);
 */

const DEFAULT_OPTIONS = {
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false
};

/**
 * Sets or updates the Vary header to include the new value
 * @param {import('./response').Response} res HTTP response object
 * @param {string} newValue New value to add to Vary header
 */
function setVaryHeader(res, newValue){
    const ha = res.get('Vary');
    const curVal = Array.isArray(ha) ? ha[0] : ha;

    // REMOVED: This is impossible to reach in current architecture since CORS run first thing after 'res' creation.
    // if(curVal == '*')
    //     return;

    // REMOVED: This condition is never reached because the function is always called with a specific header name.
    // if(newValue == '*')
    //     return res.set('Vary', '*');

    const values = typeof curVal == 'string'
        ? curVal.split(',').map(item => item.trim().toLowerCase()) 
        : [];

    if(!values.includes(newValue.toLowerCase()))
        values.push(newValue.toLowerCase());

    res.set('Vary', values.join(', '));
}

/**
 * Checks whether the request origin is allowed based on the allowed origin setting
 * @param {string} requestOrigin Origin from the request
 * @param {string|string[]|RegExp|((origin: string) => boolean)} allowedOrigin Allowed origin setting
 * @returns {boolean} Whether the origin is allowed
 */
function isOriginAllowed(requestOrigin, allowedOrigin) {

    if(Array.isArray(allowedOrigin))
        return allowedOrigin.some((ao) => isOriginAllowed(requestOrigin, ao));

    if(typeof allowedOrigin === 'string')
        return requestOrigin === allowedOrigin;

    if(allowedOrigin instanceof RegExp && typeof requestOrigin === 'string')
        return allowedOrigin.test(requestOrigin);

    return Boolean(allowedOrigin);
}

/**
 * @param {CORSOptions} opts CORS options or boolean to enable with defaults
 * @param {string} origin Request origin
 * @param {import('./response').Response} res HTTP response object
 */
function initCors(opts, origin, res){

    const options = { ...DEFAULT_OPTIONS, ...opts };

    /* Configure Origin */
    if(!options.origin || options.origin === '*')
        res.set('Access-Control-Allow-Origin', '*');

    else if(typeof options.origin === 'string') {
        res.set('Access-Control-Allow-Origin', options.origin);
        setVaryHeader(res, 'Origin');
    }
    else{
        const originAllowed = isOriginAllowed(origin, options.origin)
        res.set('Access-Control-Allow-Origin', originAllowed
            ? origin
            : 'false');
        setVaryHeader(res, 'Origin');
    }

    /* Configure Credentials */
    if(options.credentials === true)
        res.set('Access-Control-Allow-Credentials', 'true');


    /* Configure Exposed Headers */
    const exposedHeaders = options.exposedHeaders;
    if(exposedHeaders?.length)
        res.set('Access-Control-Expose-Headers', Array.isArray(exposedHeaders)
            ? exposedHeaders.join(',')
            : exposedHeaders);
}

/**
 * Handles OPTIONS preflight requests
 * @param {CORSOptions} opts CORS options or boolean to enable with defaults
 * @param {string} neededHeaders Requested headers from Access-Control-Request-Headers
 * @param {import('./response').Response} res HTTP response object
 */
function handleOptions(opts, neededHeaders, res){
    const options = { ...DEFAULT_OPTIONS, ...opts };

    /* Configure Methods */
    const methods = options.methods;
    res.set('Access-Control-Allow-Methods',
        Array.isArray(methods) ? methods.join(',') : methods);

    /* Configure Allowed Headers */
    let allowedHeaders = options.allowedHeaders;

    if(!allowedHeaders) {
        allowedHeaders = neededHeaders;
        setVaryHeader(res, 'Access-Control-request-Headers');
    }
    if(allowedHeaders?.length)
        res.set('Access-Control-Allow-Headers', Array.isArray(allowedHeaders)
            ? allowedHeaders.join(',')
            : allowedHeaders);

    /* Configure Max Age */
    if(typeof options.maxAge === 'number' || typeof options.maxAge === 'string'){
        const maxAge = options.maxAge.toString();
        maxAge.length && res.set('Access-Control-Max-Age', maxAge);
    }

    res.status(204).set('Content-Length', '0').end();
}

/**
 * @typedef CORSOptions
 * @property {string|string[]|RegExp|((origin: string) => boolean)} [origin='*']
 * @property {boolean} [credentials=false]
 * @property {string|string[]} [methods='GET,HEAD,PUT,PATCH,POST,DELETE']
 * @property {string|string[]} [allowedHeaders]
 * @property {string|string[]} [exposedHeaders]
 * @property {number|string} [maxAge]
 * @property {boolean} [preflightContinue=false]
 */

/**
 * Handle CORS headers for a request (both preflight and actual requests)
 * @param {CORSOptions|false} opts CORS options or false to disable CORS
 * @param {string} method HTTP method
 * @param {{ [header: string]: string|string[] }} headers Request headers
 * @param {import('./response').Response} res HTTP response object
 * @returns {void}
 */
export function cors(opts, method, headers, res){
    const origin = String(headers['origin']);
    const neededHeaders = String(headers['access-control-request-headers'] ?? '');
    if(opts && origin){
        initCors(opts, origin, res);

        if(method === 'OPTIONS')
            handleOptions(opts, neededHeaders, res)
    }

}
