const assert = require('assert');
const mime = require('mime/lite');

// Define shortcut extensions for supported mime-types.
mime.define({
    'application/x-www-form-urlencoded': ['urlencoded'],
    'multipart/form-data': ['form']
}, true);

/*                                                                            o\
    Parse the @types and convert any file extension to it's matching mime-type.
    In case @types is a string, a single element array will be produced.
\o                                                                            */
function parseTypes(types){
    types = typeof types == 'string' ? [types] : types;
    assert(Array.isArray(types));
    types = types.map( t => mime.getType(t) || t);
    return types;
}

module.exports = {

    parseTypes: parseTypes,

    accept(types){
        return { accept: parseTypes(types) };
    }

};
