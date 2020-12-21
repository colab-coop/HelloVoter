import format from 'string-format';
import sms from '../lib/sms';
import fifo from '../lib/fifo';
import triplerSvc from '../services/triplers';
import { ov_config } from '../lib/ov_config';

/*
 *
 * sms_task(tripler, ambassador)
 *
 * This function expects tripler and ambassador neode objects as parameters
 * It attempts to send an sms to a tripler that has confirmed, informing them of the opportunity to become an ambassador
 *   themselves, then sets the flag on the tripler that this sms has been sent
 * This function is called by the fifo buffer so that we throttle the Twilio sms sends.
 *
 */
async function sms_task(tripler, ambassador) {
  return {
    name: `Sending upgrade SMS to tripler ${tripler.get('phone')}`,
    execute: async () => {
      try {
        await sms(tripler.get('phone'), format(ov_config.tripler_upgrade_message,
                                         {
                                           tripler_first_name: tripler.get('first_name'),
                                           ambassador_first_name: ambassador.get('first_name'),
                                           wordpress_landing: ov_config.wordpress_landing
                                         }));
        await tripler.update({upgrade_sms_sent: true});
      } catch (err) {
        console.log("Unhandled error sending upgrade SMS: %s", err);
      }
    }
  }
}

/*
 *
 * sendSMS
 *
 * This function is called by the /lib/cron.js module on a schedule determined by env vars.
 * It collects all triplers that are confirmed but not yet sent the upgrade sms that informs them of the opportunity to
 *   become an ambassador themselves. Then if the tripler has exceeded a waiting period as determined by an env var,
 *   this function adds them to a list for the fifo buffer to process, sending an sms to each of them.
 *
 */
async function sendSMS() {
  let triplers = await triplerSvc.findRecentlyConfirmedTriplers();
  console.log('Preparing to SMS recently confirmed triplers...');
  console.log('%d triplers to be processed for sending SMS', triplers.length);

  await Promise.all(triplers.map(async(tripler) => {
    let waiting_period = 60 * ov_config.upgrade_sms_waiting_period; // in minutes
    let confirmed_at = new Date(tripler.get('confirmed_at').toString());
    let delta = (new Date() - confirmed_at) / 1000;
    if (delta > waiting_period) {
      let ambassador = tripler.get('claimed');
      if (ambassador) {
        fifo.add(await sms_task(tripler, ambassador));
      } else {
        console.warn(`Skipping SMS to unclaimed tripler ${tripler.get('phone')}`);
      }
    }
  }));
}

module.exports = () => {
  console.log('Sending tripler upgrade SMS');

  setTimeout(async() => {
    try {
      await sendSMS();
    } catch(err) {
      console.log('Error in tripler upgrade SMS background job: %s', err);  
    }
  });
}

