const AWS = require('aws-sdk');

exports.getCredentials = (async() => {
    const ssm = new AWS.SSM({region:"us-west-1"});
    const parameter = await ssm.getParameter({ 
        Name: 'project2_credentials', 
        WithDecryption: true 
    }).promise()
    return parameter.Parameter.Value;
})();
