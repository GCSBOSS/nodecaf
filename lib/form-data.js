const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

const Busboy = require('busboy');

// TODO handle file arrays

let makeSafer = s => s.replace('__proto__', 'proto');

module.exports = async function(req){
    let data = {};

    let busboy = new Busboy({ headers: req.headers });

    busboy.on('file', function(field, file, filename){
        let fh = crypto.createHash('sha1');
        fh.update(new Date().toISOString() + filename);
        let random = fh.digest('hex');
        let fp = path.join(os.tmpdir(), random);
        let size = 0;
        file.pipe(fs.createWriteStream(fp));
        file.on('data', data => size += data.length);
        file.on('end', () => data[makeSafer(field)] = {
            path: fp,
            name: filename,
            size,
            mv: fs.promises.rename.bind(fs.promises, fp)
        });
        req.on('handle', () => fs.promises.unlink(fp).catch(Function.prototype));
    });

    busboy.on('field', (field, value) => data[makeSafer(field)] = value);

    req.pipe(busboy);

    await new Promise((resolve, reject) => {
        busboy.on('finish', resolve);
        busboy.on('error', reject);
    });

    return data;
}
