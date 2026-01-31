const path = require('path');
const { splitExec } = require('split-exec');

const ROOT_DIR = path.resolve(__dirname.replace(/test$/, ''));

function getDockerCommandConfig(nodeImageTag) {
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

(() => {
    try{
        const dockerVersions = ['18-alpine', '20-alpine', '22-alpine', '24-alpine'];

        const commands = [
            'npm t',
            'npm run lint',
            'npx tsc',
            ...dockerVersions.map(v => getDockerCommandConfig(v))
        ];

        splitExec(commands, { limit: 4 });
    }
    catch(err) {
        console.log(err.message);
        process.exit(1);
    }
})();