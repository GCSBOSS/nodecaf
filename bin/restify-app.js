#!node
const cli = require('cli');

const COMMANDS = [ 'init' ];

let opts = cli.parse({}, COMMANDS);
let cmd = require('../lib/cli/' + cli.command);
try{
    cmd(opts);
}
catch(e){
    console.error(e.message);
}
