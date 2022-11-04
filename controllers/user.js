//module
var AWS = require('aws-sdk');
const AmazonCognitoIdentity = require('amazon-cognito-identity-js');
require('dotenv').config()
const decodeJwt=require("jwt-decode")

const poolData = {
   UserPoolId: process.env.user_pool_id, // Your user pool id here    
   ClientId: process.env.client_id // Your client id here
};
const pool_region = 'us-east-1';
const pool = new AmazonCognitoIdentity.CognitoUserPool(poolData)

let awsConfig = {
   "region": 'us-east-1',
   "endpoint": "http://dynamodb.us-east-1.amazonaws.com",
   "accessKeyId": process.env.aws_access_key_id,
   "secretAcceesKey": process.env.aws_secret_access_key
};
AWS.config.update(awsConfig)
var dynodb = new AWS.DynamoDB({ apiVersion: '2012-08-10' });

//authentication check
exports.authentication = (req, res, next) => {

   console.log(req.session.mail);
   if (req.session.mail != undefined) {
      next();
   }
   else {
      res.render('user/home', { user: "" });
   }
}

// show the home page
exports.getHome = (req, res, next) => {

   if (req.session.mail != undefined) {
      return res.render('user/home', { user: req.session.mail });
   }
   else {
      return res.render('user/home', { user: "" });
   }
}

exports.getLogin = (req, res, next) => {
   res.render('user/loginAccount', { user: "", msg: [], err: [] });
}

//logging in user with Amazon cognito
exports.postLogin = (req, res, next) => {

   const authentication_details = new AmazonCognitoIdentity.AuthenticationDetails(
      {
         Username: req.body.mail,
         Password: req.body.pass
      }
   )
   var userData = {
      Username: req.body.mail,
      Pool: pool
   };
   var cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData)
   cognitoUser.authenticateUser(authentication_details, {
      onSuccess: function (result) {

         var token = result.getIdToken().getJwtToken();
         res.cookie('auth', token)
         req.session.mail = req.body.mail;
         res.render('user/home', { user: req.body.mail });
      },
      onFailure: function (err) {
         console.log("error in onfailure", err);
         if (err == "UserNotConfirmedException: User is not confirmed.") {
            res.render('user/loginAccount', { user: "", msg: [], err: ["User is not confirmed."] });
         }
         else {
            res.render('user/loginAccount', { user: "", msg: [], err: ["Incorrect username or password"] });
         }
      }
   })
}

exports.getCreateAccount = (req, res, next) => {
   res.render('user/createAccount', { user: "", msg: [], err: [] })
}

//registering user using Amazon Cognito and storing details of user in Dynamo db
exports.postCreateAccount = (req, res, next) => {

   var p1 = req.body.pass;
   var p2 = req.body.con_pass;

   if (p1 != p2) { // if password doesn't match 
      return res.render("user/createAccount", { user: "", msg: [], err: ["Password Doesn't Match"] })
   }

   const { name, mail, pass } = req.body;
   var attributeList = [];
   attributeList.push(new AmazonCognitoIdentity.CognitoUserAttribute({ Name: "name", Value: name }));
   attributeList.push(new AmazonCognitoIdentity.CognitoUserAttribute({ Name: "phone_number", Value: "+13074562334" }))
   attributeList.push(new AmazonCognitoIdentity.CognitoUserAttribute({ Name: "email", Value: mail }));

   pool.signUp(mail, pass, attributeList, null, function (err, result) {
      if (err) {
         console.log(err)
         if (err == "UsernameExistsException: An account with the given email already exists.") {
            res.status(403).send({ message: "User exists already" })
            return res.render("user/createAccount", { user: "", msg: [], err: ["User exists already"] })
         }
         else {
            return res.render("user/createAccount", { user: "", msg: [], err: err })
         }
      }
      else {
         cognitoUser = result.user;
         console.log('user name is ' + cognitoUser.getUsername());

         var userData = {
            TableName: 'USERS',
            Item: {
               'email': { 'S': req.body.mail },
               'name': { 'S': req.body.name },
               'phone': { 'N': req.body.phone },
               'gender': { 'S': req.body.gender },
               'address': { 'S': req.body.address },
               'dob': { 'S': req.body.dob }
            }
         };

         dynodb.putItem(userData, function (err, data) {
            if (err) {
               console.log("Error", err);
            } else {
               console.log("Success", data);
               verifyEmail(mail)
               res.render('user/loginAccount', { user: "", msg: ["Account Create Successfuly"], err: [] });
            }
         });
      }
   })
}

function verifyEmail(mail) {
   var ses = new AWS.SES({ "accessKeyId": process.env.aws_access_key_id, "secretAccessKey": process.env.aws_secret_access_key, "region": "us-east-1" })
   var params = {
      EmailAddress: mail
   };
   ses.verifyEmailIdentity(params, function (err, data) {
      if (err) {
         console.log("Ses err", err)
      }
      else {
         console.log("ses data", data)
      }
   });
}

//logout
exports.logout = (req, res, next) => {
   req.session.destroy();
   res.render('user/home', { user: "" });

}