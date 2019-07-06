const express = require('express');

const { parseTypes } = require('./parse-types');
const HTTP_VERBS = ['get', 'post', 'patch', 'put', 'head'];

/*                                                                   o\
    Generate the default REST responses to be used accross all docs.
\o                                                                   */
function buildDefaultRESTResponses(){
    return {
        ServerFault: {
            description: 'The server has faced an error state caused by unknown reasons.'
        },
        Success: {
            description: 'The request has been processed without any issues'
        }
    }
}

function buildDefaultSchemas(){
    return {
        MissingType: { type: 'string', description: 'Missing \'Content-Type\' header' },
        BadType: { type: 'string', description: 'Unsupported content type' }
    }
}

function buildResponses(opts){
    let r = {
        500: { $ref: '#/components/responses/ServerFault' },
        200: { $ref: '#/components/responses/Success' }
    };

    if(opts.accept)
        r[400] = {
            description: 'Bad Request',
            content: {
                'text/plain': {
                    schema: {
                        oneOf: [
                            { '$ref': '#/components/schemas/MissingType' },
                            { '$ref': '#/components/schemas/BadType' }
                        ]
                    }
                }
            }
        };

    return r;
}

function buildDefaultRequestBody(){
    return {
        description: 'Any request body type/format.',
        content: { '*/*': {} }
    }
}

function buildCustomRequestBodies(accepts){
    return {
        description: 'Accepts the following types: ' + accepts.join(', '),
        content: accepts.reduce((a, c) => ({ ...a, [c]: {} }), {})
    }
}

function parseRouteHandlers(handlers){
    let opts = {};

    for(let h of handlers)
        if(typeof h == 'object')
            opts = { ...opts, ...h };

    return opts;
}

function parsePathParams(params){
    return params.map(k => ({
        name: k.name,
        in: 'path',
        description: k.description || '',
        required: true,
        deprecated: k.deprecated || false,
        schema: { type: 'string' }
    }));
}

/*                                          o\
    Add summary and description to a route.
\o                                          */
function describeOp(path, method, text){
    // this => app
    let [ s, ...d ] = text.split(/[\r\n]+/);
    this.paths[path][method].summary = s;
    if(d.length > 0)
        this.paths[path][method].description = d.join('\n');
}

/*                                   o\
    Add a new route to the doc spec.
\o                                   */
function addOp(method, path, ...handlers){
    // this => app
    let p = this.paths[path] || {};
    this.paths[path] = p;

    // Asseble reqests and responses data.
    let opts = parseRouteHandlers(handlers);
    let responses = buildResponses(opts);
    let accs = opts.accept || this.accepts;
    let reqBody = !accs ? buildDefaultRequestBody() : buildCustomRequestBodies(accs);

    // Asseble basic operation object.
    p[method] = {
        responses: responses,
        requestBody: reqBody
    };

    if(method in { get: true, head: true, delete: true })
        delete p[method].requestBody;

    // Add express route.
    this.router[method](path, Function.prototype);

    // Add all path variables as parameters.
    this.router.stack.forEach(l => {
        if(l.route.path !== path || p.parameters)
            return;
        p.parameters = parsePathParams(l.keys);
    });

    // Return the description function.
    return { desc: describeOp.bind(this, path, method) };
}

/*                       o\
    Merge given objects.
\o                       */
function mergeInfo(key, data){
    this[key] = { ...this[key], ...data };
}

/*                                                                            o\
    Instances of this class get a regular Nodecaf API and generate Open API
    compatible docs.
\o                                                                            */
module.exports = class APIDoc {

    constructor(settings){
        this.settings = settings || {};
        this.router = express.Router();
        this.paths = {};
        this.info = {
            title: this.settings.name || 'express',
            version: this.settings.version || '0.0.0'
        };

        // Create adapted versions of all Express routing methods.
        this.routerFuncs = HTTP_VERBS.reduce( (o, method) =>
            ({ ...o, [method]: addOp.bind(this, method) }), {});

        // Create delet special case method.
        this.routerFuncs.del = addOp.bind(this, 'delete');

        // Create function to add Open API info to the API.
        this.routerFuncs.info = mergeInfo.bind(this, 'info');
    }

    /*                                                                            o\
        Define allowed mime-types for request accross the entire app. Can be
        overriden by route specific settings.
    \o                                                                            */
    accept(types){
        this.accepts = parseTypes(types);
    }

    /*                                                                        o\
        Execute the @callback to define user routes, exposing all REST methods
        as arguments.
    \o                                                                        */
    api(callback){
        callback.bind(this)(this.routerFuncs);
    }

    /*                                                         o\
        Effectively return the assembled Open API doc object.
    \o                                                         */
    spec(){
        return {
            openapi: '3.0.2',
            info: this.info,
            paths: this.paths,
            components: {
                responses: buildDefaultRESTResponses(),
                schemas: buildDefaultSchemas()
            }
        };
    }

}
