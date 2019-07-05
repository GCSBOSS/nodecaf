const fs = require('fs');

module.exports = function help(){

    let header = `
Usage:  nodecaf COMMAND [OPTIONS]\r\n
A useful set of tools to build and manage nodecaf apps\r\n
Commands:\r\n`;

    let files = fs.readdirSync(__dirname);
    let larger = 0;
    let commands = [];
    for(let f of files){
        let cmd = require(__dirname + '/' + f);
        larger = cmd.name.length > larger ? cmd.name.length : larger;
        commands.push(cmd);
    }

    larger += 4;

    let body = commands.reduce( (a, c) => {
        let space = ' '.repeat(larger - c.name.length);
        return a + `  ${c.name}${space}${c.description}\r\n`
    }, '');

    let footer = '\r\nRun \'nodecaf COMMAND --help\' for more information on ' +
                 'a command.\r\n';

    console.log(header + body + footer);
    return header + body + footer;
};

module.exports.description = '-h Displays this help output';
