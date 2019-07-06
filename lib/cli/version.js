
module.exports = function version(){
    let pkgInfo = require(__dirname + '/../../package.json');
    console.log('v' + pkgInfo.version);
    return 'v' + pkgInfo.version;
};

module.exports.description = '-v Displays the Nodecaf verison installed globally';
