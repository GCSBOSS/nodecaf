const { exec, spawn } = require('child_process');
const path = require('path');
const { argv } = require('process');

const ROOT_DIR = path.resolve(__dirname.replace(/test$/, ''));


function checkDockerInstallation() {
    return new Promise((resolve, reject) => {
        exec('docker --version', (error, stdout) => {
            if(error) {
                reject(new Error('Docker is not installed or not available in the PATH.'));
                return;
            }

            exec('docker info', (infoError, infoStdout, infoStderr) => {
                if(infoError) {
                    reject(new Error('Docker is not running or not accessible: ' + infoStderr.trim()));
                    return;
                }
                resolve(stdout.trim());
            });
        });
    });
}

function buildImage(imageVariant){
    return new Promise((resolve, reject) => {
        exec('docker build -q -f Dockerfile .' + imageVariant, (error, stdout, stderr) => {
            if(error)
                return reject(stdout + stderr);
            resolve(stdout.trim());
        });
    });
}

function runNodeTestDockerContainer(nodeImageTag = '18-alpine') {
    return new Promise((resolve, reject) => {

        console.log(`\n=== Running tests in Docker container with Node.js ${nodeImageTag} ===`);

        // Define the Docker run command as an array of arguments
        const dockerArgs = [
            'run', '--rm',
            '-v', `${ROOT_DIR}:/app`,
            '-w', '/app',
            '-e', 'FORCE_COLOR=3',
            'node:' + nodeImageTag,
            '/bin/sh', '-c',
            'npm i && npm t'
        ];

        // Spawn the Docker process
        const dockerProcess = spawn('docker', dockerArgs, {
            stdio: 'inherit'
        });

        // Handle the end of the process
        dockerProcess.on('close', (code) => {
            if(code !== 0)
                reject(new Error(`Docker container exited with code ${code}. Node.js ${nodeImageTag} tests failed.`));
            else
                resolve();
        });

        // Handle errors during spawn
        dockerProcess.on('error', (error) => {
            reject(`Failed to start Docker process: ${error.message}`);
        });
    });
}

(async () => {
    let versions = [];

    const testAll = process.argv.includes('--all');
    const testSpecific = process.argv.find(arg => arg.startsWith('--node='));

    if(testAll) 
        versions = ['18-alpine', '20-alpine', '22-alpine', '24-alpine'];
    else if(testSpecific) {
        const version = testSpecific.split('=')[1] + '-alpine';
        versions.push(version);
    }

    if(versions.length === 0)
        versions.push('18-alpine'); 

    await checkDockerInstallation();

    for(const nodeVersion of versions)
        await runNodeTestDockerContainer(nodeVersion);
})();
