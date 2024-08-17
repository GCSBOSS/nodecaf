const { exec, spawn } = require('child_process');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname.replace(/test$/, ''));


function checkDockerInstallation() {
    return new Promise((resolve, reject) => {
        exec('docker --version', (error, stdout) => {
            if(error) {
                reject(new Error('Docker is not installed or not available in the PATH.'));
                return;
            }
            resolve(stdout.trim());
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

function runNodeTestDockerContainer(nodeImageTag = '16-alpine') {
    return new Promise((resolve, reject) => {

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
                reject(new Error(`Docker container exited with code ${code}.`));
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
    const nodeVersion = process.argv[2];
    await checkDockerInstallation();
    await runNodeTestDockerContainer(nodeVersion);
})();
