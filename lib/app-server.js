
function setupAPI(){
    // this => app
    this.express.use(compression());
    this.express.use(cookieParser(this.cookieSecret));
    this.express.use(cors(this.conf.cors));
    this.express.use(defaultErrorHandler.bind(this));
}

/*                                                                            o\
    Application Server to be instanced by users. Contain the basic REST
    server/service funcionallity.
\o                                                                            */
module.exports = class AppServer {

    /*                                                                        o\
        Define a whitelist of accepted request body mime-types for all routes
        in the app. Effectively blocks all requests whose mime-type is not one
        of @types. May be overriden by route specific accepts.
    \o                                                                        */
    accept(types){
        this.accepts = parseTypes(types);
    }


}
