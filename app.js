'use strict';
if (process.env.DEBUG === '1')
{
    require('inspector').open(9222, '0.0.0.0', true);
}

const Homey = require('homey');
const https = require("https");
const nodemailer = require("nodemailer");

const POLL_INTERVAL = 3000;

const CapabilityMap = [
{
    id: "voltage",
    type: "measure_battery"
},
{
    id: "last_data_instant",
    type: "measure_power"
},
{
    id: "target_temperature",
    type: "target_temperature"
},
{
    id: "today_wh",
    type: "meter_power"
}, ];

class MyApp extends Homey.App
{

    async onInit()
    {
        this.log('Energenie has started...');

        this.apiKey = this.homey.settings.get('apiKey');
        this.userName = this.homey.settings.get('userName');
        if (this.homey.settings.get('pollInterval') < 1)
        {
            this.homey.settings.set('pollInterval', 5);
        }

        // Callback for app settings changed
        this.homey.settings.on('set', async (setting) =>
        {
            if (setting != 'diaglog')
            {
                this.log("Setting " + setting + " has changed.");
                if ((setting === 'userName') && (this.userName != this.homey.settings.get('userName')))
                {
                    // A new Username has been set
                    this.userName = this.homey.settings.get('userName');
                    this.apiKey = "";
                    this.homey.settings.set('apiKey', "");
                }

                if ((setting === 'userName') || (setting === 'password'))
                {
                    if (this.homey.settings.get('userName') && this.homey.settings.get('password'))
                    {
                        this.log("Getting API Key for " + this.homey.settings.get('userName') + " and pw: " + this.homey.settings.get('password'));
                        try
                        {
                            await this.GetAPIKey(this.homey.settings.get('userName'), this.homey.settings.get('password'));
                        }
                        catch (err)
                        {
                            this.log(err);
                        }
                    }
                }

                if (setting === 'pollInterval')
                {
                    clearTimeout(this.timerID);
                    if (this.apiKey && !this.timerProcessing)
                    {
                        if (this.homey.settings.get('pollInterval') > 1)
                        {
                            this.timerID = setTimeout(this.onPoll, this.homey.settings.get('pollInterval') * 1000);
                        }
                    }
                }
            }
        });

        if (this.userName && this.homey.settings.get('password'))
        {
            this.log("Getting API Key for " + this.userName + " and pw: " + this.homey.settings.get('password'));
            await this.GetAPIKey(this.userName, this.homey.settings.get('password'));
        }

        this.onPoll = this.onPoll.bind(this);

        if (this.apiKey)
        {
            if (this.homey.settings.get('pollInterval') > 1)
            {
                this.updateLog("Start Polling");
                this.timerID = setTimeout(this.onPoll, Number(this.homey.settings.get('pollInterval')) * 1000);
            }
        }

        this.updateLog('************** App has initialised. ***************');
    }

    async GetAPIKey(UserName, Password)
    {
        //https://mihome4u.co.uk/api/v1/users/profile
        clearTimeout(this.timerID);
        const url = "users/profile";
        let searchResult = await this.GetURL(url, UserName, Password);
        if (searchResult)
        {
            let searchData = JSON.parse(searchResult.body);
            this.updateLog(JSON.stringify(searchData, null, 2));
            this.apiKey = searchData.data.api_key;
            this.homey.settings.set('apiKey', this.apiKey);
            this.homey.settings.unset('password');
            this.timerID = setTimeout(this.onPoll, Number(this.homey.settings.get('pollInterval')) * 1000);
            return this.apiKey;
        }
        else
        {
            this.updateLog("Getting API Key returned NULL");
            return null;
        }
    }

    async getDevices()
    {
        //https://mihome4u.co.uk/api/v1/subdevices/list
        const url = "subdevices/list";
        let searchResult = await this.GetURL(url);
        if (searchResult)
        {
            let searchData = JSON.parse(searchResult.body);
            if (searchData.status === "success")
            {
                this.detectedDevices = JSON.stringify(searchData, null, 2);
                return searchData;
            }

            throw new Error(
            {
                statusCode: -3,
                statusMessage: "HTTPS Error: " + searchData.status
            });
        }

        this.updateLog("Getting Devices returned NULL");
        throw new Error(
        {
            statusCode: -3,
            statusMessage: "HTTPS Error: Nothing returned"
        });
    }

    async getDevicesOfType(deviceType)
    {
        let searchData = await this.getDevices();
        const devices = [];

        // Create an array of devices of the requested type
        for (const subDevice of searchData.data)
        {
            // Look up the product code to get our type
            this.updateLog("Found device: " + subDevice);

            if (subDevice.device_type == deviceType)
            {
                var data = {};
                data = {
                    "id": subDevice.id,
                };

                // Find supported capabilities
                var capabilities = [];
                for (const feature of CapabilityMap)
                {
                    if (subDevice[feature.id] != null)
                    {
                        //Add to the table
                        capabilities.push(feature.type);
                    }
                }
                // Add this device to the table
                devices.push(
                {
                    "name": subDevice.label,
                    "capabilities": capabilities,
                    data
                });
            }
            else
            {
                this.updateLog("Wrong device type");
            }
        }

        return devices;
    }

    async getFeatureValue(featureId, data_type)
    {
        //https://mihome4u.co.uk/api/v1/subdevices/get_data
        var today = new Date();
        today.setHours(today.getHours() - 10);
        let postData = 'params=' + encodeURIComponent(JSON.stringify(
        {
            "id": featureId,
            "data_type": data_type,
            "resolution": "instant",
            "start_time": JSON.stringify(today),
            "end_time": JSON.stringify(new Date()),
            "limit": 1
        }, null, '+'));

        postData = postData.replace(/%2B/g, '');

        var result = await this.GetURL("subdevices/get_data", null, null, postData);
        if (result)
        {
            let searchData = JSON.parse(result.body);
            this.updateLog(JSON.stringify(searchData, null, 2));
            return searchData.data[0][1];
        }

        return -1;
    }

    async getFeatureValues(featureId)
    {
        //https://mihome4u.co.uk/api/v1/subdevices/show
        let postData = 'params=' + encodeURIComponent(JSON.stringify(
        {
            "id": featureId,
        }, null, '+'));

        postData = postData.replace(/%2B/g, '');

        var result = await this.GetURL("subdevices/show", null, null, postData);
        if (result)
        {
            let searchData = JSON.parse(result.body);
            this.updateLog(JSON.stringify(searchData, null, 2));
            return searchData.data;
        }

        return -1;
    }

    async GetURL(url, UserName, Password, postData)
    {
        this.updateLog(url);

        return new Promise((resolve, reject) =>
        {
            try
            {
                let bodyData = "";
                if (postData)
                {
                    bodyData = postData;
                }
                if (!this.userName && !UserName)
                {
                    reject(
                    {
                        statusCode: 401,
                        statusMessage: "HTTPS: No user account"
                    });
                }

                let key = "";
                if (UserName)
                {
                    key = UserName;
                }
                else
                {
                    key = this.userName;
                }

                if (!this.apiKey && !Password)
                {
                    reject(
                    {
                        statusCode: 401,
                        statusMessage: "HTTPS: No password"
                    });
                }
                let secret = "";
                if (Password)
                {
                    secret = Password;
                }
                else
                {
                    secret = this.apiKey;
                }

                let https_options = {
                    host: "mihome4u.co.uk",
                    path: "/api/v1/" + url,
                    method: "POST",
                    headers:
                    {
                        "Authorization": "Basic " + new Buffer.from(key + ":" + secret, "utf8").toString("base64"),
                        "Content-Type": "application/x-www-form-urlencoded",
                        "Content-Length": bodyData.length
                    },
                };

                this.updateLog(https_options);

                let req = https.request(https_options, (res) =>
                {
                    if (res.statusCode === 200)
                    {
                        let body = [];
                        res.on('data', (chunk) =>
                        {
                            this.updateLog("retrieve data");
                            body.push(chunk);
                        });
                        res.on('end', () =>
                        {
                            this.updateLog("Done retrieval of data");
                            resolve(
                            {
                                "body": Buffer.concat(body)
                            });
                        });
                    }
                    else
                    {
                        let message = "";
                        if (res.statusCode === 204)
                        {
                            message = "No Data Found";
                        }
                        else if (res.statusCode === 400)
                        {
                            message = "Bad request";
                        }
                        else if (res.statusCode === 401)
                        {
                            message = "Unauthorized";
                        }
                        else if (res.statusCode === 403)
                        {
                            message = "Forbidden";
                        }
                        else if (res.statusCode === 404)
                        {
                            message = "Not Found";
                        }
                        this.updateLog("HTTPS Error: " + res.statusCode + ": " + message);
                        reject(
                        {
                            statusCode: res.statusCode,
                            statusMessage: "HTTPS Error: " + message
                        });
                    }
                }).on('error', (err) =>
                {
                    this.updateLog(err);
                    reject(
                    {
                        statusCode: -1,
                        statusMessage: "HTTPS Catch : " + err
                    });
                });
                if (bodyData)
                {
                    this.updateLog(postData);
                    req.write(postData);
                }
                req.end();
            }
            catch (err)
            {
                this.updateLog(err);
                reject(
                {
                    statusCode: -2,
                    statusMessage: "HTTPS Catch: " + err
                });
            }
        });
    }

    async onPoll()
    {
        this.timerProcessing = true;
        const promises = [];
        try
        {
            // Fetch the list of drivers for this app
            const drivers = this.homey.drivers.getDrivers();
            for (const driver in drivers)
            {
                let devices = this.homey.drivers.getDriver(driver).getDevices();
                for (var i = 0; i < devices.length; i++)
                {
                    let device = devices[i];
                    if (device.getDeviceValues)
                    {
                        promises.push(device.getDeviceValues());
                    }
                }
            }

            await Promise.all(promises);

        }
        catch (err)
        {
            this.updateLog("Polling Error: " + err);
        }

        var nextInterval = Number(this.homey.settings.get('pollInterval')) * 1000;
        if (nextInterval < 1000)
        {
            nextInterval = 5000;
        }
        this.updateLog("Next Interval = " + nextInterval, true);
        this.timerID = setTimeout(this.onPoll, nextInterval);
        this.timerProcessing = false;
    }

    updateLog(newMessage, errorLevel = 1)
    {
        if ((errorLevel == 0) || this.homey.settings.get('logEnabled'))
        {
            console.log(newMessage);

            const nowTime = new Date(Date.now());

            this.diagLog += "\r\n* ";
            this.diagLog += (nowTime.getHours());
            this.diagLog += ":";
            this.diagLog += nowTime.getMinutes();
            this.diagLog += ":";
            this.diagLog += nowTime.getSeconds();
            this.diagLog += ".";
            let milliSeconds = nowTime.getMilliseconds().toString();
            if (milliSeconds.length == 2)
            {
                this.diagLog += '0';
            }
            else if (milliSeconds.length == 1)
            {
                this.diagLog += '00';
            }
            this.diagLog += milliSeconds;
            this.diagLog += ": ";
            this.diagLog += "\r\n";

            this.diagLog += newMessage;
            this.diagLog += "\r\n";
            if (this.diagLog.length > 60000)
            {
                this.diagLog = this.diagLog.substr(this.diagLog.length - 60000);
            }
            this.homey.api.realtime('com.energenie.logupdated', { 'log': this.diagLog });
        }
    }

    async sendLog(body)
    {
        let tries = 5;

        let logData;
        if (body.logType == "diag")
        {
            logData = this.diagLog;
        }
        else
        {
            logData = this.detectedDevices;
        }

        while (tries-- > 0)
        {
            try
            {
                // create reusable transporter object using the default SMTP transport
                let transporter = nodemailer.createTransport(
                {
                    host: Homey.env.MAIL_HOST, //Homey.env.MAIL_HOST,
                    port: 465,
                    ignoreTLS: false,
                    secure: true, // true for 465, false for other ports
                    auth:
                    {
                        user: Homey.env.MAIL_USER, // generated ethereal user
                        pass: Homey.env.MAIL_SECRET // generated ethereal password
                    },
                    tls:
                    {
                        // do not fail on invalid certs
                        rejectUnauthorized: false
                    }
                });

                // send mail with defined transport object
                let info = await transporter.sendMail(
                {
                    from: '"Homey User" <' + Homey.env.MAIL_USER + '>', // sender address
                    to: Homey.env.MAIL_RECIPIENT, // list of receivers
                    subject: "Energenie " + body.logType + " log", // Subject line
                    text: logData // plain text body
                });

                this.updateLog("Message sent: " + info.messageId);
                // Message sent: <b658f8ca-6296-ccf4-8306-87d57a0b4321@example.com>

                // Preview only available when sending through an Ethereal account
                console.log("Preview URL: ", nodemailer.getTestMessageUrl(info));
                return this.homey.__('settings.logSent');
            }
            catch (err)
            {
                this.updateLog("Send log error: " + err.stack, 0);
            }
        }

        return (this.homey.__('settings.logSendFailed'));
    }
}

module.exports = MyApp;