import { Router } from 'express';
import triplerSvc from '../../../../../services/triplers';
import { normalizePhone } from '../../../../../lib/normalizers';
import { ov_config } from '../../../../../lib/ov_config';

module.exports = Router({mergeParams: true})
/*
 *
 * /sms/receive
 *
 * This endpoint is expected to be called by Twilio, when a Tripler replies to the SMS with "YES", "NO", or other.
 *   This is set up in Twilio's Messaging Service, to be called by a number in that pool. The endpoint must be
 *   defined in the webhook field for the service.
 *
 * For testing purposes, the .env var 'TWILIO_SUPPORT_PROXY_RESPONSE' enables the use of any phone number
 *   to issue a "YES", "NO", or other on behalf of any phone number specified in the message.
 *
 * For example, a number were to send an SMS to the Twilio number(s) connected to this API via Twilio
 *   with a body of: `yes => 12025550000`, then the system will pretend that the Tripler associated
 *   with 12025550000 has replied "yes".
 *
 * If the Tripler replies "yes", the Tripler is confirmed using the Tripler Service confirmTripler function.
 *
 * If the Tripler replies "no", the Tripler is deleted from the system entirely.
 *
 * If the Tripler replies with anything else, another SMS will be sent, attempting to get confirmation
 *   with the added request that they reply either "yes" or "no" only.
 *
 */
.post('/sms/receive', async (req, res) => {

  // TODO security check needed to confirm message came from twilio

  let sender = normalizePhone(req.body.From);
  let response = req.body.Body.toLowerCase();

  if (ov_config.twilio_support_proxy_response) {
    let arr = response.split('=>').map((entry)=>entry.trim()).filter((entry)=>entry.length > 0)
    response = arr[0];
    if (arr.length > 1) {
      sender = normalizePhone(arr[1]);
    }
  }

  let tripler = await triplerSvc.findByPhone(sender);
  try {
    if (tripler) {
      if (response === 'yes') {
        await triplerSvc.confirmTripler(tripler.get('id'));
      }
      else if (response === 'no') {
        await triplerSvc.detachTripler(tripler.get('id'));
      }
      else {
        await triplerSvc.reconfirmTripler(tripler.get('id'));
      }
    }
    else {
      req.logger.error("Tripler not found", sender);
    }
  }
  catch(err) {
    req.logger.error(err, `Error while processing response ${response} from sender ${sender}`);
  }

  return res.send({});
})
