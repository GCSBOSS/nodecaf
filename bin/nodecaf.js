#!node
const fs = require('fs');
const path = require('path');

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
