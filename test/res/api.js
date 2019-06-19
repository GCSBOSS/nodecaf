
module.exports = ({ post, info, get, put }) => {
    info({
        description: 'My blabby description and stuff like that'
    });
    post('/my/:id/thing', function(){ }, function(){ });
    get('/my/:id/thing', function(){ }, function(){ })
        .desc('Get my thing based on :id\n' +
            'The long description for this API and it\'s workings bla bla.');
    put('/my/:id/stuff', function(){ }, function(){ })
        .desc('Put my stuff somewhere');
}
