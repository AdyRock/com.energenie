Adds support for Energenie Mi|Home products using the Energenie hub.

After installing the app you need to generate an API key in the Configure app page.
Enter your user name and password for your Energenie Mi|Home account and touch Save Changes.
Your credentials will be used to fetch an API key from Energenie and it will be displayed on the page.
The API key can not be set manually and is only shown as a confirmation that it has been set.
Your password is cleared and not stored once an API key has been obtained.

The Polling Interval is the time in seconds between requesting new values from the installed devices.

The unsupported tab shows details of any devices that are discovered that are not support by the app.
The data for the panel is captured during the add device procedure.

The Log tab can show diagnostics data to help resolve issues.
As the log consumes memory (maximum 5000 bytes) on your Homey it is recommend that you only switch it on if you are having problems.
If your device is not working correctly then switch the log on and operate the device in a way that makes it fail.
Copy the contents of the log panel, remove any sensitive data and then send it to the developer either via GitHub or the community forum.

To add a device, use the standard method from the devices screen.

Currently supported devices:

*  Whole House Monitor


