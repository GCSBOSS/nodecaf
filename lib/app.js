
const { URL } = require('url');

const Router = require('./router');

let r = new Router();

let http = require('http').createServer(function(req, res){


    let url = new URL(req.url, 'http://0.0.0.0');


    let reqPath = (url.pathname.slice(-1) == '/'
        ? url.pathname.slice(0, -1) : url.pathname) || '/';

    console.log(reqPath);

    let route = req.method + ' ' + reqPath;
    // TODO check how query string is handled

    if(route in stringRoutes)
        stringRoutes[route][0](req, res, Function.prototype); // TODO add next
    else for(let route of regExpRoutes[req.method]){
        let pdata = route.regexp.exec(reqPath);
        console.log(pdata);
        break;
    }

    // TODO 404
    // TODO errors module

    res.end();
});

http.listen(80);

addRoute('get', '/test', () => console.log(3));
addRoute('post', '/foo/bar', () => console.log(2));
addRoute('get', '/', () => console.log(1));

(async function(){

    await require('muhb').get('http://localhost');
    await require('muhb').post('http://localhost/foo/bar?test=23&232');
    await require('muhb').get('http://localhost/test/');
    await require('muhb').get('http://localhost/unknown');

    http.close();
})();
