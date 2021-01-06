import ambassadorSvc from '../services/ambassadors';
import triplerSvc from '../services/triplers';
import stripeSvc from '../services/stripe';
import paypalSvc from '../services/paypal';
import fifo from '../lib/fifo';
import { ov_config } from '../lib/ov_config';
import neode from '../lib/neode';
import {isLocked} from '../lib/fraud';

/*
 *
 * disburse_task(ambassador, tripler)
 *
 * This function expects ambassador and tripler neode objects as arguments
 * It is is called by the fifo buffer to throttle the Stripe / PayPal payouts
 * This function is the cron + fifo task that calls the payout service functions (disburse() for the Stripe and Paypal /service modules)
 * It tries to determine the correct account to pay out to, then calls the appropriate disburse function
 *
 */
async function disburse_task(ambassador, tripler) {
  return {
    name: `Disbursing ambassador: ${ambassador.get('phone')} for tripler: ${tripler.get('phone')}`,
    execute: async () => {
      try {
        console.log('Trying disbursement for ambassador (%s) for tripler (%s)', ambassador.get('phone'), tripler.get('phone'));
        let account = await ambassadorSvc.getPrimaryAccount(ambassador);
        if (!account) return;
        if (account.get('account_type') === 'stripe') {
          await stripeSvc.disburse(ambassador, tripler);
        } else if (account.get('account_type') === 'paypal') {
          await paypalSvc.disburse(ambassador, tripler);
        }
      }
      catch(err) {
       console.log('Error sending disbursement for ambassador (%s) for tripler (%s): %s', ambassador.get('phone'), tripler.get('phone'), err);
      }
    },
  };
}

/*
 *
 *
 * disburse()
 *
 * This function is called by the node-cron job on a schedule determined by the /lib/cron module, determined from env vars
 * This function attempts to find all ambassadors that are due a payout with this Cypher query, gets the appropriate neode objects
 *   and then calls the disburse_task function with the those neode objects as arguments
 *
 */
async function disburse() {
  console.log('Disbursing amount to ambassadors...');

  let query = `MATCH (:Account)<-[:OWNS_ACCOUNT]-(a:Ambassador {approved: true})-[gp:GETS_PAID]->(:Payout {status: 'pending'}) RETURN a.id, gp.tripler_id LIMIT ${ov_config.payout_batch_size}`;

  let res = await neode.cypher(query);

  if (res.records.length > 0) {
    console.log('%d ambassadors to be processed for disbursement', res.records.length);
    for(var x = 0; x < res.records.length; x++) {
      let record = res.records[x];
      let ambassador_id = record._fields[0];
      let tripler_id = record._fields[1];
      let ambassador = await ambassadorSvc.findById(ambassador_id);
      let tripler = await triplerSvc.findById(tripler_id);
      //We don't want to pay out locked ambassadors or triplers who are not claimed
      const locked = isLocked(ambassador)
      const triplerStatus = tripler.get("status")
      if (ambassador && tripler && !isLocked(ambassador) && triplerStatus == "confirmed") {
        fifo.add(await disburse_task(ambassador, tripler));
      }
    }
  }
}

module.exports = () => {
  console.log('Send payouts/retrying payouts');

  setTimeout(async() => {
    try {
      await disburse();
    } catch(err) {
      console.log('Error in payouts background job: %s', err);
    }
  });
}
