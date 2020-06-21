
const SHORT_CONTENT_TYPES = {
    'text': 'text/plain',
    'json': 'application/json'
};

const { asserts } = require('./errors');

module.exports = {

    set(k, v){
        this.setHeader(k.toLowerCase(), v);
        return this;
    },

    status(s){
        this.statusCode = s;
        return this;
    },

    type(ct){
        this.set('content-type', SHORT_CONTENT_TYPES[ct] || ct);
        return this;
    },

    json(data){
        this.set('content-type', 'application/json');
        if(typeof data == 'object')
            data = JSON.stringify(data);
        this.end(data);
        return this;
    },

    text(data){
        this.set('content-type', 'text/plain');
        this.end(String(data));
        return this;
    },

    ...asserts

};
