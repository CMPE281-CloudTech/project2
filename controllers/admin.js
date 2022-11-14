require('dotenv').config();
var mysql = require('mysql2');
var fs = require('fs');
var formidable = require('formidable');
const path = require('path');
var AWS = require('aws-sdk');

var connectDB = mysql.createConnection({
    host: process.env.rds_host,
    user: process.env.rds_user,
    password: process.env.rds_password,
    database: process.env.rds_database
});

var s3 = new AWS.S3({
    accessKeyId: process.env.accessKeyId,
    secretAccessKey: process.env.secretAccessKey,
    region: process.env.region,
    apiVersion: '2006-03-01'

});

var bucket = "aishbucket1";



var roleToAssume = {
    RoleArn: 'arn:aws:iam::939216532729:role/Aishwarya-dyanamodb',
    RoleSessionName: 'session1',
    DurationSeconds: 900,
};
var roleCreds;

// Create the STS service object    
var sts = new AWS.STS({ apiVersion: '2011-06-15' });

//Assume Role
var dynamodb = {}
sts.assumeRole(roleToAssume, function (err, data) {
    if (err) console.log(err, err.stack);
    else {
        var creds = new AWS.Credentials({
            accessKeyId: data.Credentials.AccessKeyId,
            secretAccessKey: data.Credentials.SecretAccessKey,
            sessionToken: data.Credentials.SessionToken
        })
        dynamodb = new AWS.DynamoDB({ apiVersion: '2012-08-10', credentials: creds, region: 'us-east-1' })
    }
})

// login get request
exports.getLogin = (req, res, next) => {
    if (req.session.admin == undefined) {
        res.render('admin/login', { msg: "", err: "" });
    }
    else {
        data1 = "SELECT * " +
            "FROM  bookingstatus " +
            "WHERE status = 0 ";
        connectDB.query(data1, (err1, result1) => {
            if (err1) throw err1;
            else {
                for (i in result1) {
                    var a = result1[i].date;
                    result1[i].date = a.toString().slice(0, 15);
                }
                return res.render('admin/index', { msg: "", err: "", data: result1 });
            }
        })
    }

}

//login post request
exports.postLogin = (req, res, next) => {

    data = "SELECT * " +
        "FROM admin " +
        "WHERE name = " + mysql.escape(req.body.name) +
        "AND pass = " + mysql.escape(req.body.pass);

    data1 = "SELECT * " +
        "FROM  bookingstatus " +
        "WHERE status = 0 ";

    connectDB.query(data, (err, result) => {
        if (err) throw err;
        else {
            if (result.length) {
                req.session.admin = result[0].name;
                connectDB.query(data1, async (err1, result1) => {
                    if (err1) throw err1;
                    else {
                        for (i in result1) {
                            var a = result1[i].date;
                            var userData = {}
                            result1[i].date = a.toString().slice(0, 15);
                            //getting user details from dynamodb
                            var params = {
                                Key: {
                                    "email": {
                                        S: result1[i].email
                                    }
                                },
                                TableName: "USERS"
                            };
                            try {
                                await dynamodb.getItem(params, function (err, data) {
                                    if (!err) {
                                        userData = data
                                        result1[i].userDetails = userData
                                    }
                                }).promise()
                            } catch (err) {
                                console.log(err);
                            }
                        }
                        return res.render('admin/index', { msg: "", err: "", data: result1 });
                    }
                })
            }
            else {
                return res.render('admin/login', { msg: "", err: "Please Check Your Information Again" });
            }
        }
    })
}

//change booking status
exports.postChnageStatus = (req, res, next) => {
    //console.log(req.body);

    var value = 0;

    if (req.body.click == "Approve") {
        value = 1;
        data = "UPDATE bookingstatus " +
            " SET  status = " + mysql.escape(value) +
            " WHERE email = " + mysql.escape(req.body.mail) +
            " AND type = " + mysql.escape(req.body.type) +
            " AND category = " + mysql.escape(req.body.cat) +
            " AND roomWant = " + mysql.escape(req.body.want)

    } else {
        data = "DELETE FROM bookingstatus " +
            " WHERE email = " + mysql.escape(req.body.mail) +
            " AND type = " + mysql.escape(req.body.type) +
            " AND category = " + mysql.escape(req.body.cat) +
            " AND roomWant = " + mysql.escape(req.body.want)
    }

    data1 = "SELECT * " +
        "FROM  bookingstatus " +
        "WHERE status = 0 ";

    connectDB.query(data, (err, result) => {
        if (err) throw err;
        else {
            connectDB.query(data1, async (err1, result1) => {
                if (err1) throw err1;
                else {
                    for (i in result1) {
                        var a = result1[i].date;
                        var userData = {}
                        result1[i].date = a.toString().slice(0, 15);
                        //getting user details from dynamodb
                        var params = {
                            Key: {
                                "email": {
                                    S: result1[i].email
                                }
                            },
                            TableName: "USERS"
                        };
                        try {
                            await dynamodb.getItem(params, function (err, data) {
                                if (!err) {
                                    userData = data
                                    result1[i].userDetails = userData
                                }
                            }).promise()
                        } catch (err) {
                            console.log(err);
                        }
                    }
                    return res.render('admin/index', { msg: "", err: "", data: result1 });
                }
            })
        }
    })

}

//get add hotel page

exports.getAddHotel = (req, res, next) => {
    res.render('admin/addhotel', { msg: "", err: "" });
}

//add new hotel info
exports.postAddHotel = (req, res, next) => {

    //var
    var cat = "", type = "", cost = 0, avlvl = 0, decs = ""
    var imgPath = ""
    var wrong = 0;


    var form = new formidable.IncomingForm();
    form.parse(req).on
        ('field', (name, field) => {
            if (name === "cat") {
                cat = field;

            }
            else if (name === "type") {
                type = field;
            }
            else if (name === "cost") {
                cost = parseInt(field);
            }
            else if (name === "avlvl") {
                avlvl = parseInt(field);
            }
            else if (name === "decs") {
                decs = field
            }

        })

        .on('file', function (name, part1) {
            const fileContent = fs.readFileSync(part1.path);

            const params = {
                Bucket: bucket,
                Key: part1.name, // File name you want to save as in S3
                Body: fileContent
            };

            // Uploading files to the bucket
            s3.upload(params, function (err, data) {

                imgPath = data.Location;
                if (err) {
                    throw err;
                }
                else {
                    data1 = "INSERT INTO `category`(`name`, `type`, `cost`, `available`, `img`, `decs`) " +
                        "VALUES('" + cat + "','" + type + "', '" + cost + "','" + avlvl + "' ,'" + imgPath + "' ,'" + decs + "' )"
                    connectDB.query(data1, (err, result) => {

                        if (err) {
                            throw err;
                        }
                        else {
                            res.render('admin/addhotel', { msg: "Data Insert Successfuly", err: "" });
                        }
                    });
                }
                // console.log('File uploaded successfullydata ', data);
                // console.log('File uploaded successfully.',data.Location);
                // console.log(`File uploaded successfully. ${data.Location}`);
            });

        })


        .on('aborted', () => {
            console.error('Request aborted by the user')
        })
        .on('error', (err) => {
            console.error("Error from on", err);
            throw err
        })


}

//get update page
exports.getSearch = (req, res, next) => {
    res.render('admin/search', { msg: "", err: "" })
}

//post request
exports.postSearch = (req, res, next) => {
    //console.log(req.body);

    data = "SELECT * " +
        "FROM category " +
        "WHERE name = " + mysql.escape(req.body.cat);

    connectDB.query(data, (err, result) => {
        if (err) throw err;
        else {
            return res.render('admin/update', { msg: "", err: "", data: result });
        }
    })

}

//get update page 

exports.getUpdate = (req, res, next) => {
    // console.log(req.body);

    data = "SELECT * " +
        "FROM category " +
        "WHERE name = " + mysql.escape(req.body.cat) +
        " AND type = " + mysql.escape(req.body.type) +
        " AND cost = " + mysql.escape(req.body.cost);

    connectDB.query(data, (err, result) => {
        if (err) throw err;
        else {
            req.session.info = result[0];
            res.render('admin/updatePage', { data: result[0] });
        }
    })
}

//update previous data

exports.updatePrevData = (req, res, next) => {

    data = "UPDATE category " +
        "SET type = " + mysql.escape(req.body.type) +
        ", cost = " + mysql.escape(parseInt(req.body.cost)) +
        ", available = " + mysql.escape(parseInt(req.body.avlvl)) +
        ", `decs` = " + mysql.escape(req.body.des) +
        " WHERE name = " + mysql.escape(req.session.info.name) +
        " AND type = " + mysql.escape(req.session.info.type) +
        " AND cost = " + mysql.escape(parseInt(req.session.info.cost))

    //  console.log(req.session.info);    
    //  console.log(req.body); 
    //  console.log(data);        

    connectDB.query(data, (err, result) => {
        if (err) throw err;
        else {
            res.render('admin/search', { msg: "Update Done Successfuly", err: "" })
        }
    })

}

//logout
exports.logout = (req, res, next) => {
    req.session.destroy();
    res.render('admin/login', { msg: "", err: "" });
}
