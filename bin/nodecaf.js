#!node
const cli = require('cli');

const COMMANDS = [ 'init' ];

let opts = cli.parse({
    confPath: [ 'c', 'Conf file path', 'file', undefined ],
    confType: [ false, 'Conf file extension', 'as-is', undefined ]
}, COMMANDS);
let cmd = require('../lib/cli/' + cli.command);
try{
    cmd(opts);
}
catch(e){
    console.error(e.message);
}
