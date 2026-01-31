import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { splitExec } from 'split-exec';

// ESM replacement for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname.replace(/test$/, ''));

function checkDockerInstallation() {
    return new Promise((resolve, reject) => {
        exec('docker --version', (error, stdout) => {
            if(error) {
                reject(new Error('Docker is not installed or not available in the PATH.'));
                return;
            }

            exec('docker info', (infoError, _infoStdout, infoStderr) => {
                if(infoError) {
                    reject(new Error('Docker is not running or not accessible: ' + infoStderr.trim()));
                    return;
                }
                resolve(stdout.trim());
            });
        });
    });
}

function getDockerCommandConfig(nodeImageTag = '18-alpine') {
    return {
        cmd: 'docker',
        title: `Node ${nodeImageTag}`,
        args: [
            'run', '--rm',
            '-v', `${ROOT_DIR}:/app`,
            '-w', '/app',
            '-e', 'FORCE_COLOR=3',
            'node:' + nodeImageTag,
            '/bin/sh', '-c',
            '"npm i && npm t"'
        ]
    };
}

try{
    let versions = [];

    const testAll = process.argv.includes('--all');
    const testSpecific = process.argv.find(arg => arg.startsWith('--node='));
    if(testAll) 
        versions = ['18-alpine', '20-alpine', '22-alpine', '24-alpine'];
    else if(testSpecific) 
        versions.push(`${testSpecific.split('=')[1]}-alpine`);
    
    if(versions.length === 0) 
        versions.push('18-alpine');

    await checkDockerInstallation();
    const commands = versions.map(getDockerCommandConfig);

    splitExec(commands);
}
catch(err) {
    console.log(err.message);
    process.exit(1);
}
