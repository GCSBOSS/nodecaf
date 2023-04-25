
// @ts-check

/**
 * @typedef {import('./internal.d.ts').Response} Nodecaf.Response
 * @typedef {import('./internal.d.ts').CorsOptions} Nodecaf.CorsOptions
 * @typedef {import('./internal.d.ts').RouteHandlerArgs} Nodecaf.RouteHandlerArgs
 */


const DEFAULT_OPTIONS = {
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false
};

/**
 * @param {Nodecaf.Response} res
 * @param {string} newValue
 */
function setVaryHeader(res, newValue){
    const ha = res.get('Vary');
    const curVal = Array.isArray(ha) ? ha[0] : ha;

    if(curVal == '*')
        return;

    if(newValue == '*')
        return res.set('Vary', '*');

    const values = curVal?.split(',').map(item => item.trim().toLowerCase()) ?? [];

    if(!values.includes(newValue.toLowerCase()))
        values.push(newValue.toLowerCase());

    res.set('Vary', values.join(', '));
}

/**
 * @param {string} requestOrigin
 * @param {Nodecaf.CorsOptions['origin']} allowedOrigin
 * @returns {boolean}
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
 * @param {Nodecaf.CorsOptions} opts
 * @param {string} origin
 * @param {Nodecaf.Response} res
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
 * @param {Nodecaf.CorsOptions} opts
 * @param {string} neededHeaders
 * @param {Nodecaf.Response} res
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
 * @param {Nodecaf.CorsOptions | undefined} opts
 * @param {string} method
 * @param {Nodecaf.RouteHandlerArgs['headers']} headers
 * @param {Nodecaf.Response} res
 */
function cors(opts, method, headers, res){
    const origin = headers['origin'];
    const neededHeaders = headers['access-control-request-headers'] ?? '';
    if(opts && origin){
        initCors(opts, origin, res);

        if(method === 'OPTIONS')
            handleOptions(opts, neededHeaders, res)
    }

}

module.exports = { cors };