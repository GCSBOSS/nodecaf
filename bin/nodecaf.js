#!node
const Eclipt = require('eclipt');

const cli = new Eclipt('nodecaf', {}, {
    requireCommand: true,
    noArgs: true,
    getVersion: () => 'v' + require(__dirname + '/../package.json').version
});

cli.requireCommands(__dirname + '/../lib/cli');
try{
    cli.execute();
}
catch(e){
    console.error(e.message);
}
