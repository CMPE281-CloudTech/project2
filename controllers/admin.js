require('dotenv').config();
var mysql = require('mysql2');
var fs = require('fs');
var formidable = require('formidable');
const path = require('path');
var AWS = require('aws-sdk');
var easyinvoice = require('easyinvoice');
var fs = require("fs");
var cred=require("./cred");

var mailcomposer = require('mailcomposer');
var awsCloudFront = require("aws-cloudfront-sign");

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
    keypairId = data.CLOUDFRONT_ACCESS_KEY_ID, 
    privateKeyPath = data.CLOUDFRONT_PRIVATE_KEY_PATH,
    cloudfront_url = data.CLOUDFRONT_URL
})




var bucket = "aishbucket1";

var roleToAssume = {
    RoleArn: 'arn:aws:iam::939216532729:role/Aishwarya-dyanamodb',
    RoleSessionName: 'session1',
    DurationSeconds: 900,
};

// Create the STS service object    
var sts = new AWS.STS({ apiVersion: '2011-06-15' });

//Assume Role
var dynamodb = {}
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
        dynamodb = new AWS.DynamoDB({ apiVersion: '2012-08-10', credentials: creds, region: 'us-east-1' })

    }
})

async function getDetailsFromDynamoDB(email){
    var params = {
        Key: {
            "email": {
                S: email
            }
        },
        TableName: "USERS"
    };
    try {
        await dynamodb.getItem(params, function (err, data) {
            if (!err) {
                userdata = data;
            }
        }).promise()
    } catch (err) {
        console.log(err);
    }
    return userdata
}

// login get request
exports.getLogin = (req, res, next) => {
    if (req.session.admin == undefined) {
        res.render('admin/login', { msg: "", err: "" });
    }
    else {
        data1 = "SELECT * " +
            "FROM  bookingstatus " +
            "WHERE status = 0 ";
        connectDB.query(data1, async (err1, result1) => {
            if (err1) throw err1;
            else {
                for (i in result1) {
                    var a = result1[i].date;
                    result1[i].date = a.toString().slice(0, 15);
                    result1[i].userDetails = await getDetailsFromDynamoDB(result1[i].email)
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
                            result1[i].date = a.toString().slice(0, 15);
                            //getting user details from dynamodb
                            result1[i].userDetails = await getDetailsFromDynamoDB(result1[i].email)
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

//get invoices
exports.getInvoices = (req, res, next) => {
    var options = { keypairId:keypairId, privateKeyPath:privateKeyPath };
    return fetch('https://j0noe3sfu4.execute-api.us-east-1.amazonaws.com/dev/invoice', {
        method: 'GET',
    }).then(async response => {
        let urls = []
        if (response.status == 200) {
            let data = JSON.parse(await response.text());
            for (var i=1; i<data.Contents.length; i++){
                urls.push({
                    url : awsCloudFront.getSignedUrl(cloudfront_url + "/" + data.Contents[i].Key, options),
                    filename : data.Contents[i].Key
                })
            }
            return res.render('admin/invoice', { msg: "", err: "", data: urls })
        }
    })
}

//change booking status
exports.postChangeStatus = (req, res, next) => {
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

        //creating invoice pdf
        let today = new Date()
        let dueDate = new Date(new Date().setDate(today.getDate()+15))
        // console.log("body"+req.body.name)
        // console.log(req.body.address)
        var invoiceData = {
            "images": {
                // The logo on top of your invoice
                "logo": fs.readFileSync('public/assets/img/logo/hotel.png', 'base64')
            },
            // Your own data
            "sender": {
                "company": "AWS Hotels",
                "address": "CMPE281 street",
                "zip": "967784",
                "city": "San Jose",
                "country": "USA"
            },
            // Your recipient
            "client": {
                "company": req.body.name,
                "address": req.body.address
            },
            "information": {
                // Invoice number
                "number": (Math.random() * 1000).toFixed(4),
                // Invoice data
                "date": new Date().toString().slice(0, 15),
                "due-date": dueDate.toString().slice(0, 15)
            },
            "products": [
                {
                    "quantity": req.body.want,
                    "description": req.body.cat,
                    "tax-rate": 6,
                    "price": req.body.cost
                }],
            "bottom-notice": "Kindly pay your invoice within 15 days.",
            "settings": {
                "currency": "USD",
            },
        };
        easyinvoice.createInvoice(invoiceData, function (result) {
            // The response will contain a base64 encoded PDF file
            //console.log('PDF base64 string: ', result.pdf);
            fs.writeFileSync("invoice.pdf", result.pdf, 'base64');


            //sending a mail to customer using AWS SES
            Promise.resolve().then(() => {
                let sendRawEmailPromise;

                const mail = mailcomposer({
                    from: 'awshotels@dayrep.com',
                    replyTo: 'source@example.com',
                    to: 'srinishaa@hotmail.com',
                    subject: 'AWS Hotels Booking Confirmation',
                    text: 'Hello! Thank you for choosing AWS Hotels. PFA invoice.',
                    attachments: [
                        {
                            path: 'invoice.pdf'
                        },
                    ],
                });

                new Promise((resolve, reject) => {
                    mail.build((err, message) => {
                        if (err) {
                            reject(`Error sending raw email: ${err}`);
                        }
                        sendRawEmailPromise = ses.sendRawEmail({ RawMessage: { Data: message } }).promise();
                    });

                    resolve(sendRawEmailPromise);
                });

                //uploading to reciept to s3
                var date = new Date().toISOString();
                let filename = req.body.mail + date + ".pdf"
                return fetch(`https://j0noe3sfu4.execute-api.us-east-1.amazonaws.com/dev/invoice?filename=${filename}`, { // Your POST endpoint
                    method: 'POST',
                    headers: {
                        "Content-Type": "*/*"
                    },
                    body: new Buffer(result.pdf, 'base64')
                }).then(
                    response => response.json()
                )
            });

        });

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
                        result1[i].userDetails = await getDetailsFromDynamoDB(result1[i].email)
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
