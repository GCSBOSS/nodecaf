#!node
const fs = require('fs');
const path = require('path');

if(process.argv[2] == '-h')
    process.argv[2] = 'help';
else if(process.argv[2] == '-v')
    process.argv[2] = 'version';

let cf = path.resolve(__dirname, '../lib/cli', process.argv[2] + '.js');

if(fs.existsSync(cf)){
    let cmd = require(cf);
    try{
        cmd();
    }
    catch(e){
        console.error(e.message);
    }
}
