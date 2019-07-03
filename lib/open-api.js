const express = require('express');
const HTTP_VERBS = ['get', 'post', 'patch', 'put', 'head'];

/*                                                                   o\
    Generate the default REST responses to be used accross all docs.
\o                                                                   */
function buildDefaultRESTResponses(){
    return {
        ServerFault: {
            description: 'The server has faced an error state caused by unknown reasons.'
        }
    }
}

function buildDefaultRequestBody(){
    return {
        description: 'Any request body type/format.',
        content: { '*/*': {} }
    }
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
function addOp(method, path){
    // this => app
    let paths = this.paths;
    paths[path] = paths[path] || {};

    // Reference the global responses used.
    paths[path][method] = {
        responses: {
            500: { $ref: '#/components/responses/ServerFault' }
        },
        requestBody: buildDefaultRequestBody()
    };

    // Add express route.
    this.router[method](path, Function.prototype);

    // Add all path variables as parameters.
    this.router.stack.forEach(l => {
        if(l.route.path !== path || paths[path].parameters)
            return;

        paths[path].parameters = l.keys.map(k => ({
            name: k.name,
            in: 'path',
            description: k.description || '',
            required: true,
            deprecated: k.deprecated || false,
            schema: { type: 'string' }
        }));
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

    /*                                                                        o\
        Execute the @callback to define user routes, exposing all REST methods
        as arguments.
    \o                                                                        */
    api(callback){
        callback(this.routerFuncs);
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
                responses: buildDefaultRESTResponses()
            }
        };
    }

}
