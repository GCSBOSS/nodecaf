import path from 'node:path';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import * as http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import { randomBytes } from 'node:crypto';

process.env.NODE_ENV = 'testing';

/**
 * Creates a temporary directory in the OS temp directory and returns its path.
 * @returns {string} The full path to the created temporary directory
 */
function createTempDir(){
    const dirPath = path.join(os.tmpdir(), 'estelar-test-' + randomBytes(8).toString('hex'));
    fs.mkdirSync(dirPath);
    return dirPath;
}

/**
 * Creates an empty file in the OS temp directory and returns the full path.
 * @param {string} fileName - The name of the file (e.g., 'log.txt')
 * @returns {string} The full path to the created file
 */
function createTempFile(fileName, content = '') {
    // 0. Prepend random string to fileName to avoid collisions
    // const randomPrefix = crypto.getRandomValues(new Uint32Array(1))[0].toString(16);
    const randomPrefix = randomBytes(8).toString('hex');
    fileName = `${randomPrefix}-${fileName}`;

    // 1. Construct the full path safely
    const filePath = path.join(os.tmpdir(), fileName);
    
    // 2. Create the file (writes an empty string). 
    // This overwrites the file if it already exists.
    fs.writeFileSync(filePath, content);
    
    return filePath;
}

/**
 * Runs a test application in a child process and return stdout for inspection.
 * @param {string} appCode - The JavaScript code of the application to run.
 * @param {object} [opts] - Options for running the test app.
 * @param {number} [opts.timeout] - Maximum time (ms) to wait for app to complete.
 * @param {string} [opts.cwd] - Current working directory for the child process.
 * @param {string[]} [opts.argv]
 * @returns {Promise<string>} Resolves with the stdout output of the app.
 */
function runTestApp(appCode, opts = {}){
    // Prepend Estelar import to the app code
    appCode = `import { Estelar } from 'file:///${path.resolve('./lib/main.js').replace(/\\/g, '/')}';\n` + appCode;

    return new Promise((resolve, reject) => {
        const proc = spawn('node', ['--input-type=module', '-e', appCode, '--', ...opts.argv ?? []], {
            cwd: opts?.cwd || createTempDir(),
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { NODE_ENV: opts.env ?? 'production' }
        });
        let output = '';
        const timeout = opts?.timeout ? setTimeout(() => {
            proc.kill();
            reject(new Error('Test app timed out'));
        }, opts.timeout ?? 3000) : null;
        proc.stdout.on('data', (data) => {
            output += data.toString();
        });
        proc.stderr.on('data', (data) => {
            output += data.toString();
        });
        proc.on('close', () => {
            if(timeout) 
                clearTimeout(timeout);
            resolve(output);
        });
        proc.on('error', (err) => {
            if(timeout) 
                clearTimeout(timeout);
            reject(err);
        });
    });
}

describe('End-to-end tests', function() {

    it('Should use default name and version when package info not found', async () => {
        const stdout = await runTestApp(`
            const app = new Estelar();
            const i = await app.run();
            await i.stop();
        `);
        assert(stdout.includes('"app":"Untitled"'), `Expected "Untitled" in output, got: ${stdout}`);
    });

    it('Should log request handling duration on finish', async () => {
        const stdout = await runTestApp(`
            const app = new Estelar({
                http: 9875
            });
            app.get('/', async ({ res }) => {
                await new Promise(r => setTimeout(r, 100));
                res.end();
            });
            const i = await app.run();
            const res = await fetch('http://localhost:9875/', {
                headers: { Connection: 'close' }
            });
            await res.text();
            await i.stop();
        `);
        const duration = Number(stdout.match(/"duration":"(\d+)ms"/)?.[1]);
        assert(duration >= 100, `Expected request handling duration bigger than 100ms log, got: ${stdout}`);
    });

    it('Should log uptime when closing server', async () => {
        const stdout = await runTestApp(`
            const app = new Estelar();
            const i = await app.run();
            setTimeout(() => i.stop(), 200);
        `);
        const duration = Number(stdout.match(/"uptime":"(\d+)ms"/)?.[1]);
        assert(duration >= 200, `Expected uptime log bigger than 200ms, got: ${stdout}`);
    });

    it('Should load config passed in argv when setup so', async () => {
        const cfp = createTempFile('a.toml', 'foo = "$bar"');
        const stdout = await runTestApp(`
            const app = new Estelar({
                startup({ conf }){
                    console.log(conf.foo)
                }
            });
            const i = await app.run({
                readConfFromArgv: true
            });
            await i.stop();
        `, { argv: [ '-c', cfp ] });
        fs.unlinkSync(cfp);
        assert(stdout.includes('$bar'), `Expected "$bar" in output, got: ${stdout}`);
    });

    it('main.run die handler logs fatal error on uncaughtException', function() {
        this.timeout(10000);

        const appCode = `
            process.env.NODE_ENV = 'production';

            import { Estelar } from 'file:///${path.resolve('./lib/main.js').replace(/\\/g, '/')}';
            const app = new Estelar({ http: 9877 });
            
            app.get('/', ({ res }) => res.text('ok'));

            await app.run();

            // Trigger an uncaught exception (die handler should be invoked)
            process.nextTick(() => {
                throw new Error('simulated crash');
            });

            // Keep alive briefly
            setInterval(() => {}, 1000);
        `;

        const proc = spawn('node', ['--input-type=module', '-e', appCode], {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let output = '';
        let procExited = false;

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                if(!procExited) 
                    proc.kill('SIGKILL');
                reject(new Error('Test timed out'));
            }, 8000);

            proc.stdout.on('data', (data) => {
                output += data.toString();
            });

            proc.stderr.on('data', (data) => {
                output += data.toString();
            });

            proc.on('close', () => {
                procExited = true;
                clearTimeout(timeout);
                try{
                    // Die handler calls log.fatal with { err, type: 'crash' }
                    // In production env (testing), this outputs JSON to stdout
                    assert(output.includes('crash'), `Expected "crash" type in output, got: ${output}`);
                    assert(output.includes('simulated crash'), `Expected error message in output, got: ${output}`);
                    resolve();
                }
                catch(err) {
                    reject(err);
                }
            });

            proc.on('error', reject);
        });
    });

    it('logger prints friendly output in development (e2e)', function(done) {
        this.timeout(5000);

        const appCode = `
            (async ()=>{
                process.env.NODE_ENV = 'development';
                await new Promise(r => setImmediate(r));
                const { Estelar } = await import('file:///${path.resolve('./lib/main.js').replace(/\\/g, '/')}');
                await new Promise(r => setImmediate(r));
                const app = new Estelar({
                    startup: async ({ log }) => {
                        log.info('devtest');
                    }
                });
                const i = await app.run();
                process.stdout.write('READY\\n');
                setTimeout(()=>process.exit(0),100);
            })();
        `;

        const proc = spawn('node', ['-e', appCode], {
            env: { ...process.env, NODE_ENV: 'development' },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let out = '';
        proc.stdout.on('data', d => out += d.toString());
        proc.stderr.on('data', d => out += d.toString());

        proc.on('close', () => {
            try{
                assert.ok(out.includes('INFO - devtest'), `Expected friendly dev output, got:\n${out}`);
                done();
            }
            catch(err){ done(err); }
        });
    });

    it('Should start server and respond to HTTP requests', function(done) {
        this.timeout(5000);

        const serverScript = `
        import { Estelar } from './lib/main.js';
        const app = new Estelar({ http: 9876 });
        
        app.get('/', async ({ res }) => res.json({ ok: true, version: 1 }));

        const i = await app.run();
        console.log('SERVER_READY');

        // Auto-shutdown after 3 seconds
        setTimeout(async () => {
          await i.stop();
          process.exit(0);
        }, 3000);
      `;

        const child = spawn('node', ['--input-type=module', '--eval', serverScript], {
            cwd: process.cwd(),
            stdio: ['inherit', 'pipe', 'inherit']
        });

        let serverReady = false;
        let requestCompleted = false;

        child.stdout.on('data', (data) => {
            const output = data.toString();
            if(output.includes('SERVER_READY') && !serverReady) {
                serverReady = true;
          
                // Make HTTP request
                setTimeout(() => {
                    const req = http.get('http://localhost:9876/', { timeout: 1000 }, (res) => {
                        let body = '';
                        res.on('data', (chunk) => body += chunk);
                        res.on('end', () => {
                            try{
                                const data = JSON.parse(body);
                                if(data.ok && data.version === 1) 
                                    requestCompleted = true;
                  
                            }
                            catch(e) {
                                e
                                // ignore parse errors
                            }
                        });
                    });
                    req.on('error', () => {
                        // ignore connection errors
                    });
                }, 100);
            }
        });

        child.on('close', (code) => {
            assert.ok(serverReady, 'server should have started');
            assert.ok(requestCompleted, 'server should respond to HTTP requests');
            assert.equal(code, 0, 'server should exit cleanly');
            done();
        });

        child.on('error', (err) => done(err));
    });

    it('Should execute startup handler before server is ready', function(done) {
        this.timeout(5000);

        const serverScript = `
        import { Estelar } from './lib/main.js';
        const app = new Estelar({
          http: 9879,
          startup: async ({ log, conf }) => {
            console.log('STARTUP_HANDLER_CALLED');
          }
        });

        app.get('/', async ({ res }) => res.json({ ok: true }));

        await app.run();
      `;

        const child = spawn('node', ['--input-type=module', '--eval', serverScript], {
            cwd: process.cwd(),
            stdio: ['inherit', 'pipe', 'inherit']
        });

        let startupCalled = false;
        const timeout = setTimeout(() => {
            if(!startupCalled) {
                child.kill();
                done(new Error('Startup handler not called within timeout'));
            }
        }, 3000);

        child.stdout.on('data', (data) => {
            const output = data.toString();
            if(output.includes('STARTUP_HANDLER_CALLED')) {
                startupCalled = true;
                clearTimeout(timeout);
                child.kill();
                done();
            }
        });

        child.on('error', (err) => {
            clearTimeout(timeout);
            done(err);
        });
    });

    it('Should reload configuration with restart()', function(done) {
        this.timeout(5000);

        const serverScript = `
        import { Estelar } from './lib/main.js';
        const app = new Estelar({
          http: 9880,
          conf: { version: '1.0' }
        });

        app.get('/', async ({ conf, res }) => res.json(conf));

        const i = await app.run();
        console.log('STARTED');

        // Simulate config reload
        setTimeout(async () => {
          await i.restart({ version: '2.0' });
          console.log('RESTARTED');
          process.exit(0);
        }, 500);
      `;

        const child = spawn('node', ['--input-type=module', '--eval', serverScript], {
            cwd: process.cwd(),
            stdio: ['inherit', 'pipe', 'inherit']
        });

        let restarted = false;
        const timeout = setTimeout(() => {
            if(!restarted) {
                child.kill();
                done(new Error('Restart not completed'));
            }
        }, 3000);

        child.stdout.on('data', (data) => {
            const output = data.toString();
            if(output.includes('RESTARTED')) {
                restarted = true;
                clearTimeout(timeout);
                done();
            }
        });

        child.on('error', (err) => {
            clearTimeout(timeout);
            done(err);
        });
    });

});