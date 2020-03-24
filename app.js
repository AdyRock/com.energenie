'use strict';

const Homey = require('homey');
const https = require("https");
const POLL_INTERVAL = 3000;

const CapabilityMap = [{
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
	},
]

class MyApp extends Homey.App {

	async onInit() {
		this.log('Energenie has started...');

		this.apiKey = Homey.ManagerSettings.get('apiKey');
		this.userName = Homey.ManagerSettings.get('userName');
		if (Homey.ManagerSettings.get('pollInterval') < 1) {
			Homey.ManagerSettings.set('pollInterval', 5);
		}

		this.log("Energenie has started for " + this.userName + " and Key: " + this.apiKey + " or pw: " + Homey.ManagerSettings.get('password') + " Polling every " + Homey.ManagerSettings.get('pollInterval') + " seconds");

		// Callback for app settings changed
		Homey.ManagerSettings.on('set', async function (setting) {
			if (setting != 'diaglog') {
				Homey.app.log("Setting " + setting + " has changed.");
				if ((setting === 'userName') && (Homey.app.userName != Homey.ManagerSettings.get('userName'))) {
					// A new Username has been set
					Homey.app.userName = Homey.ManagerSettings.get('userName');
					Homey.app.apiKey = "";
					Homey.ManagerSettings.set('apiKey', "");
				}

				if ((setting === 'userName') || (setting === 'password')) {
					if (Homey.ManagerSettings.get('userName') && Homey.ManagerSettings.get('password')) {
						this.log("Getting API Key for " + Homey.ManagerSettings.get('userName') + " and pw: " + Homey.ManagerSettings.get('password'));
						try {
							await Homey.app.GetAPIKey(Homey.ManagerSettings.get('userName'), Homey.ManagerSettings.get('password'));
						} catch (err) {
							this.log(err);
						}
					}
				}

				if (setting === 'pollInterval') {
					clearTimeout(Homey.app.timerID);
					if (Homey.app.apiKey && !Homey.app.timerProcessing) {
						if (Homey.ManagerSettings.get('pollInterval') > 1) {
							Homey.app.timerID = setTimeout(Homey.app.onPoll, Homey.ManagerSettings.get('pollInterval') * 1000);
						}
					}
				}
			}
		});

		if (this.userName && Homey.ManagerSettings.get('password')) {
			this.log("Getting API Key for " + this.userName + " and pw: " + Homey.ManagerSettings.get('password'));
			await Homey.app.GetAPIKey(this.userName, Homey.ManagerSettings.get('password'));
		}

		this.onPoll = this.onPoll.bind(this);

		if (this.apiKey) {
			if (Homey.ManagerSettings.get('pollInterval') > 1) {
				this.updateLog("Start Polling");
				this.timerID = setTimeout(this.onPoll, Number(Homey.ManagerSettings.get('pollInterval')) * 1000);
			}
		}

		this.updateLog('************** App has initialised. ***************');
	}

	async GetAPIKey(UserName, Password) {
		//https://mihome4u.co.uk/api/v1/users/profile
		clearTimeout(Homey.app.timerID);
		const url = "users/profile";
		let searchResult = await Homey.app.GetURL(url, UserName, Password);
		if (searchResult) {
			let searchData = JSON.parse(searchResult.body);
			Homey.app.updateLog(JSON.stringify(searchData, null, 2));
			Homey.app.apiKey = searchData.data.api_key;
			Homey.ManagerSettings.set('apiKey', Homey.app.apiKey);
			Homey.ManagerSettings.unset('password');
			Homey.app.timerID = setTimeout(Homey.app.onPoll, Number(Homey.ManagerSettings.get('pollInterval')) * 1000);
			return Homey.app.apiKey;
		} else {
			Homey.app.updateLog("Getting API Key returned NULL");
			return null;
		}
	}

	async getDevicesOfType(deviceType) {
		//https://mihome4u.co.uk/api/v1/subdevices/list
		const url = "subdevices/list";
		let searchResult = await Homey.app.GetURL(url);
		if (searchResult) {
			let searchData = JSON.parse(searchResult.body);
			Homey.app.updateLog(JSON.stringify(searchData, null, 2));
			if (searchData.status === "success") {
				const devices = [];

				// Create an array of devices of the requested type
				for (const subDevice of searchData['data']) {
					// Look up the product code to get our type
					Homey.app.updateLog("Found device: " + subDevice);

					if (subDevice['device_type'] == deviceType) {
						var data = {};
						data = {
							"id": subDevice['id'],
						};

						// Find supported capabilities
						var capabilities = [];
						for (const feature of CapabilityMap) {
							if (subDevice[feature['id']] != null) {
								//Add to the table
								capabilities.push(feature['type']);
							}
						}
						// Add this device to the table
						devices.push({
							"name": subDevice['label'],
							"capabilities": capabilities,
							data
						})
					} else {
						Homey.app.updateLog("Wrong device type");
					}
				}

				return devices;
			}

			reject({
				statusCode: -3,
				statusMessage: "HTTPS Error: " + searchData.status
			});
		} else {
			Homey.app.updateLog("Getting API Key returned NULL");
			reject({
				statusCode: -3,
				statusMessage: "HTTPS Error: Nothing returned"
			});
		}
	}

	async getFeatureValue(featureId, data_type) {
		//https://mihome4u.co.uk/api/v1/subdevices/get_data
		var today = new Date();
		today.setHours(today.getHours() - 10);
		let postData = 'params=' + encodeURIComponent(JSON.stringify({
			"id": featureId,
			"data_type": data_type,
			"resolution": "instant",
			"start_time": JSON.stringify(today),
			"end_time": JSON.stringify(new Date()),
			"limit": 1
		}, null, '+'));

		postData = postData.replace(/%2B/g, '');

		var result = await this.GetURL("subdevices/get_data", null, null, postData);
		if (result) {
			let searchData = JSON.parse(result.body);
			Homey.app.updateLog(JSON.stringify(searchData, null, 2));
			return searchData.data[0][1];
		}

		return -1;
	}

	async getFeatureValues(featureId) {
		//https://mihome4u.co.uk/api/v1/subdevices/show
		let postData = 'params=' + encodeURIComponent(JSON.stringify({
			"id": featureId,
		}, null, '+'));

		postData = postData.replace(/%2B/g, '');

		var result = await this.GetURL("subdevices/show", null, null, postData);
		if (result) {
			let searchData = JSON.parse(result.body);
			Homey.app.updateLog(JSON.stringify(searchData, null, 2));
			return searchData.data;
		}

		return -1;
	}

	async GetURL(url, UserName, Password, postData) {
		Homey.app.updateLog(url);

		return new Promise((resolve, reject) => {
			try {
				let bodyData = "";
				if (postData) {
					bodyData = postData;
				}
				if (!Homey.app.userName && !UserName) {
					reject({
						statusCode: 401,
						statusMessage: "HTTPS: No user account"
					});
				}

				let key = "";
				if (UserName) {
					key = UserName;
				} else {
					key = Homey.app.userName;
				}

				if (!Homey.app.apiKey && !Password) {
					reject({
						statusCode: 401,
						statusMessage: "HTTPS: No password"
					});
				}
				let secret = "";
				if (Password) {
					secret = Password;
				} else {
					secret = Homey.app.apiKey;
				}

				let https_options = {
					host: "mihome4u.co.uk",
					path: "/api/v1/" + url,
					method: "POST",
					headers: {
						"Authorization": "Basic " + new Buffer(key + ":" + secret, "utf8").toString("base64"),
						"Content-Type": "application/x-www-form-urlencoded",
						"Content-Length": bodyData.length
					},
				}

				Homey.app.updateLog(https_options);

				let req = https.request(https_options, (res) => {
					if (res.statusCode === 200) {
						let body = [];
						res.on('data', (chunk) => {
							Homey.app.updateLog("retrieve data");
							body.push(chunk);
						});
						res.on('end', () => {
							Homey.app.updateLog("Done retrieval of data");
							resolve({
								"body": Buffer.concat(body)
							});
						});
					} else {
						let message = "";
						if (res.statusCode === 204) {
							message = "No Data Found";
						} else if (res.statusCode === 400) {
							message = "Bad request";
						} else if (res.statusCode === 401) {
							message = "Unauthorized";
						} else if (res.statusCode === 403) {
							message = "Forbidden";
						} else if (res.statusCode === 404) {
							message = "Not Found";
						}
						Homey.app.updateLog("HTTPS Error: " + res.statusCode + ": " + message);
						reject({
							statusCode: res.statusCode,
							statusMessage: "HTTPS Error: " + message
						});
					}
				}).on('error', (err) => {
					Homey.app.updateLog(err);
					reject({
						statusCode: -1,
						statusMessage: "HTTPS Catch : " + err
					});
				});
				if (bodyData) {
					Homey.app.updateLog(postData);
					req.write(postData);
				}
				req.end();
			} catch (err) {
				Homey.app.updateLog(err);
				reject({
					statusCode: -2,
					statusMessage: "HTTPS Catch: " + err
				});
			}
		});
	}

	async onPoll() {
		Homey.app.timerProcessing = true;
		const promises = [];
		try {
			// Fetch the list of drivers for this app
			const drivers = Homey.ManagerDrivers.getDrivers();
			for (const driver in drivers) {
				let devices = Homey.ManagerDrivers.getDriver(driver).getDevices();
				for (var i = 0; i < devices.length; i++) {
					let device = devices[i];
					if (device.getDeviceValues) {
						promises.push(device.getDeviceValues());
					}
				}
			}

			await Promise.all(promises);

		} catch (err) {
			Homey.app.updateLog("Polling Error: " + err);
		}

		var nextInterval = Number(Homey.ManagerSettings.get('pollInterval')) * 1000;
		if (nextInterval < 1000) {
			nextInterval = 5000;
		}
		Homey.app.updateLog("Next Interval = " + nextInterval, true);
		Homey.app.timerID = setTimeout(Homey.app.onPoll, nextInterval);
		Homey.app.timerProcessing = false;
	}

	updateLog(newMessage) {
		//		Homey.app.log(newMessage);

		if (Homey.ManagerSettings.get('logEnabled')) {
			Homey.app.log(newMessage);
			var oldText = Homey.ManagerSettings.get('diagLog');
			if (oldText.length > 5000) {
				oldText = "";
			}
			oldText += "* ";
			oldText += newMessage;
			oldText += "\r\n";
			Homey.ManagerSettings.set('diagLog', oldText);
		}
	}
}

module.exports = MyApp;