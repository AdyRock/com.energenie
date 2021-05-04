module.exports = {
    async getLog({ homey, query })
    {
        return homey.app.diagLog;
    },
    async getDetected({ homey, query })
    {
        await homey.app.getDevices();
        return homey.app.detectedDevices;
    },
    async clearLog({ homey, body })
    {
        homey.app.diagLog = "";
        return 'OK';
    },
    async sendLog({ homey, body })
    {
        return await homey.app.sendLog(body);
    }
};