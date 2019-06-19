//const wtf = require('wtfnode');

const assert = require('assert');

const fs = require('fs');
const os = require('os');
const assertPathExists = p => fs.existsSync(p);

describe('CLI: nodecaf', () => {
    var resDir, projDir;

    before(function(){
        projDir = process.cwd();
        process.chdir('./test');
        resDir = process.cwd() + '/res/';
    });

    after(function(){
        process.chdir(projDir);
    });

    describe('nodecaf init', () => {
        const init = require('../lib/cli/init');
        let tdir;

        beforeEach(function(){
            let suffix = Math.random() * 1e3;
            tdir = os.tmpdir + '/' + String(new Date()).replace(/\D/g, '') + suffix + '/';
            fs.mkdirSync(tdir);
            process.chdir(tdir);
        });

        it('Should fail when unsupported conf type is sent', () => {
            fs.copyFileSync(resDir + 'test-package.json', './package.json');
            assert.throws( () =>
                init({ confPath: 'foo', confType: 'baz' }), /type not supported/g );
        });

        it('Should fail when no package.json is found', () => {
            assert.throws( () => init({}), /package.json not found/g);
        });

        it('Should generate basic structure files', () => {
            fs.copyFileSync(resDir + 'test-package.json', './package.json');
            init({});
            assertPathExists('./bin/my-proj.js');
            assertPathExists('./lib/main.js');
            assertPathExists('./lib/api.js');
            let pkgInfo = require(tdir + 'package.json');
            assert.equal(pkgInfo.bin['my-proj'], 'bin/my-proj.js');
        });

        it('Should target specified directory', () => {
            fs.mkdirSync('./foo');
            fs.copyFileSync(resDir + 'nmless-package.json', './foo/package.json');
            const cli = require('cli');
            cli.setArgv(['thing', '-p', './foo']);
            init();
            let pkgInfo = require(tdir + 'foo/package.json');
            assert.equal(pkgInfo.bin['my-app'], 'bin/my-app.js');
        });

        it('Should use specified project name', () => {
            fs.copyFileSync(resDir + 'test-package.json', './package.json');
            init({ name: 'proj-foo' });
            let pkgInfo = require(tdir + 'package.json');
            assert.equal(pkgInfo.bin['proj-foo'], 'bin/proj-foo.js');
        });

        it('Should generate conf file if specified', () => {
            fs.copyFileSync(resDir + 'nmless-package.json', './package.json');
            init({ confPath: './conf.toml' });
            assertPathExists('./conf.toml');
        });

        it('Should generate create conf file dir if it doesn\'t exist', () => {
            fs.copyFileSync(resDir + 'nmless-package.json', './package.json');
            init({ confPath: './my/conf.toml' });
            assertPathExists('./my/conf.toml');
        });
    });

});


//after(() => wtf.dump());
