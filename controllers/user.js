//module
var AWS = require('aws-sdk');

require('dotenv').config()

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

//show the login page
exports.getLogin = (req, res, next) => {
   res.render('user/loginAccount', { user: "", msg: [], err: [] });
}

//post page of login
exports.postLogin = (req, res, next) => {

   var userData = {
      TableName: 'USERS',
      Key: {
         'email': { 'S': req.body.mail }
      }
   };
   dynodb.getItem(userData, function (err, data) {
      if (err) {
         console.log("Error", err);
         res.render('user/loginAccount', { user: "", msg: [], err: ["Please Check Your information again"] });
      } else {
         if (req.body.pass == data.Item.password.S){
            req.session.mail = data.Item.email.S;
            res.render('user/home', { user: data.Item.email.S });
         }else
            res.render('user/loginAccount', { user: "", msg: [], err: ["Please Check Your information again"] });
      }
   });

}


// show create account page
exports.getCreateAccount = (req, res, next) => {
   res.render('user/createAccount', { user: "", msg: [], err: [] })
}

//get data from user for create account
exports.postCreateAccount = (req, res, next) => {

   var p1 = req.body.pass;
   var p2 = req.body.con_pass;

   if (p1 != p2) { // if password doesn't match 
      return res.render("user/createAccount", { user: "", msg: [], err: ["Password Doesn't Match"] })
   }

   var userData = {
      TableName: 'USERS',
      Item: {
         'email': { 'S': req.body.mail },
         'name': { 'S': req.body.name },
         'phone': { 'N': req.body.phone },
         'password': { 'S': p1 }
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

//logout
exports.logout = (req, res, next) => {
   req.session.destroy();
   res.render('user/home', { user: "" });

}