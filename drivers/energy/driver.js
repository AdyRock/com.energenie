'use strict';

const Homey = require('homey');

class EnergyDriver extends Homey.Driver {
	
	onInit() {
		this.log('EnergyDriver has been initialized');
	}
	
    // this is the easiest method to overwrite, when only the template 'Drivers-Pairing-System-Views' is being used.
    async onPairListDevices()
    {
        return this.homey.app.getDevicesOfType( 'house' );
    }
}

module.exports = EnergyDriver;