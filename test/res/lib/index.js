
const Nodecaf = require('../../../lib/main');

module.exports = () => new Nodecaf({
    conf: { port: 80 },
    routes: [
        Nodecaf.get('/bar', ({ res, conf }) => {
            res.type('text');
            res.end(conf.name || conf.key || 'foo');
        })
    ]
});
