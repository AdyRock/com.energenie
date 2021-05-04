'use strict';

const Homey = require('homey');

class EnergyDevice extends Homey.Device {
	
	onInit() {
		this.log('EnergyDevice has been initialized');
		this.getDeviceValues();
	}

	async getDeviceValues()
    {
        this.homey.app.updateLog( this.getName() + ': Getting Energy', true );

        try
        {
            const devData = this.getData();

			// Get the current power Value from the device using the unique feature ID stored during pairing
			const values = await this.homey.app.getFeatureValues( devData.id );
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
                // Calculate battery level as a percentage of full charge that matches the official Soma App
                // The range should be between 3.1 and 5 volts for 0 to 100% charge
                var batteryPct = ((values.voltage - 3.1) / (5 - 3.1)) * 100;

                // Keep in range of 0 to 100% as the level can be more than 100% when on the charger
                if ( batteryPct > 100 )
                {
                    batteryPct = 100;
                }
                else if ( batteryPct < 0 )
                {
                    batteryPct = 0;
                }
                await this.setCapabilityValue( 'measure_battery', Math.round(batteryPct) );
            }
        }
        catch ( err )
        {
            //this.setUnavailable();
            this.homey.app.updateLog( this.getName() + " getDeviceValues Error " + err );
        }
    }
}

module.exports = EnergyDevice;