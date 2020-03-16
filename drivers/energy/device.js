'use strict';

const Homey = require('homey');

class MyDevice extends Homey.Device {
	
	onInit() {
		this.log('MyDevice has been inited');
		this.getDeviceValues();
	}

	async getDeviceValues()
    {
        Homey.app.updateLog( this.getName() + ': Getting Energy', true );

        try
        {
            const devData = this.getData();
            //console.log( devData );

			// Get the current power Value from the device using the unique feature ID stored during pairing
			const values = await Homey.app.getFeatureValues( devData.id );
            if ( values.last_data_instant >= 0 )
            {
                this.setAvailable();
                await this.setCapabilityValue( 'measure_power', values.last_data_instant );
            }

            // Get the current power Value from the device using the unique feature ID stored during pairing
            if ( values.today_wh >= 0 )
            {
                await this.setCapabilityValue( 'meter_power', values.today_wh / 1000 );
            }

            // Get the current battery Value from the device using the unique feature ID stored during pairing
            if ( values.voltage >= 0 )
            {
                await this.setCapabilityValue( 'measure_battery', ((4.5 - values.voltage) / (4.5 - 3.3)) * 1000 );
            }
        }
        catch ( err )
        {
            //this.setUnavailable();
            Homey.app.updateLog( this.getName() + " getDeviceValues Error " + err );
        }
    }
}

module.exports = MyDevice;