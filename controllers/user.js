//modulevar 
mysql = require('mysql2');
var AWS = require('aws-sdk');
const AmazonCognitoIdentity = require('amazon-cognito-identity-js');
require('dotenv').config()
const decodeJwt = require("jwt-decode")
var cred = require("./cred")

var roleToAssume = {
   RoleArn: 'arn:aws:iam::939216532729:role/Aishwarya-dyanamodb',
   RoleSessionName: 'session1',
   DurationSeconds: 900,
};

// Create the STS service object    
var sts = new AWS.STS({ apiVersion: '2011-06-15' });

//Assume Role
var dynodb = {}
var ses = {}
sts.assumeRole(roleToAssume, function (err, data) {
   if (err) console.log(err, err.stack);
   else {
      var creds = new AWS.Credentials({
         accessKeyId: data.Credentials.AccessKeyId,
         secretAccessKey: data.Credentials.SecretAccessKey,
         sessionToken: data.Credentials.SessionToken
      })
      ses = new AWS.SES({ credentials: creds, region: 'us-east-1' });
      dynodb = new AWS.DynamoDB({ apiVersion: '2012-08-10', credentials: creds, region: 'us-east-1' })

   }
})

//store paramter
cred.getCredentials.then(data => {
   data = JSON.parse(JSON.parse(data))
   connectDB = mysql.createConnection({
      host: data.rds_host,
      user: data.rds_user,
      password: data.rds_password,
      database: data.rds_database
   });
   s3 = new AWS.S3({
      accessKeyId: data.accessKeyId,
      secretAccessKey: data.secretAccessKey,
      region: data.region,
      apiVersion: '2006-03-01'
   });
   poolData = {
      UserPoolId: data.user_pool_id, // Your user pool id here    
      ClientId: data.client_id // Your client id here
   };
   pool = new AmazonCognitoIdentity.CognitoUserPool(poolData)
})




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
               res.render('user/loginAccount', { user: "", msg: ["Account Create Successfuly"], err: [] });
            }
         });
      }
   })
}

//get request for category
exports.getCategory = (req, res, next) => {

   res.render('user/category', { user: req.session.mail });
}

//post request of category
exports.postCategory = (req, res, next) => {


   data = "SELECT * " +
      " FROM  category " +
      " WHERE name = " + mysql.escape(req.body.cat) +
      " AND type = " + mysql.escape(req.body.type) +
      " AND available > 0";

   connectDB.query(data, (err, result) => {
      if (err) throw err; //show if error found
      else {
         // console.log(result);
         return res.render('user/showCategory', { user: req.session.mail, rooms: result })
      }
   })

}
// get booking data 
exports.postBooking = (req, res, next) => {
   // console.log(req.body);

   res.render('user/bookingConfirm.ejs', { user: req.session.mail, name: req.body.name, type: req.body.type, cost: req.body.cost });
}

//post status request

exports.postStatus = (req, res, next) => {



   
  var date = req.body.date;
   //console.log(date)
   data = "INSERT INTO bookingstatus " +
      " VALUES ('" + req.session.mail + "','" + req.body.name + "','" + req.body.type + "','" + req.body.roomWant + "','" + 0 + "','" + date +"','" + req.body.cost + "')"

   data1 = "SELECT * " +
      " FROM  bookingstatus " +
      " WHERE email = " + mysql.escape(req.session.mail);

   connectDB.query(data, (err, reslt) => {
      if (err) throw err;
      else {
         connectDB.query(data1, (err1, result) => {
            for (i in result) {
               var a = result[i].date
               a = a.toString()
               result[i].date = a.slice(0, 15);
            }
            res.render('user/statusShow', { user: req.session.mail, msg: "Your booking is placed", err: "", data: result });
         })
      }
   })
}


//get status
exports.getShowStatus = (req, res, next) => {


   var connectDB = mysql.createConnection({
      host: process.env.rds_host,
      user: process.env.rds_user,
      password: process.env.rds_password,
      database: process.env.rds_database
   });


   data = "SELECT * " +
      " FROM  bookingstatus " +
      " WHERE email = " + mysql.escape(req.session.mail);

   connectDB.query(data, (err, result) => {

      if (err) throw err;
      else {
         for (i in result) {
            var a = result[i].date
            a = a.toString()
            result[i].date = a.slice(0, 15);
         }
         if (result.length < 1) {
            res.render('user/statusShow', { user: req.session.mail, msg: "", err: "oops!! You dont have any booking.", data: result });
         }
         else {
            res.render('user/statusShow', { user: req.session.mail, msg: "", err: "", data: result });
         }
      }
   })
}


//delete booking request
exports.deleteBooking = (req, res, next) => {





   data = "DELETE FROM bookingstatus " +
      " WHERE email = " + mysql.escape(req.body.mail) +
      " AND type = " + mysql.escape(req.body.type) +
      " AND category = " + mysql.escape(req.body.cat) +
      " AND roomWant = " + mysql.escape(req.body.want)

   connectDB.query(data, (err, result) => {
      if (err) throw err;
      else {
         next();
      }
   })

}


//show contact page
exports.getContact = (req, res, next) => {
   if (req.session.mail == undefined) {
      res.render('user/contact', { user: "" });
   }
   else {
      res.render('user/contact', { user: req.session.mail });
   }

}
//logout
exports.logout = (req, res, next) => {
   req.session.destroy();
   res.render('user/home', { user: "" });

}