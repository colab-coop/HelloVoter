import { Router } from 'express';
import stripeSvc from '../../../../services/stripe';
import paypalSvc from '../../../../services/paypal';
import ambassadorSvc from '../../../../services/ambassadors';
import triplerSvc from '../../../../services/triplers';
import { error } from '../../../../services/errors';
import { validateEmail } from '../../../../lib/validations';

import {
  _204, _400, _401, _403
} from '../../../../lib/utils';

import { ov_config } from '../../../../lib/ov_config';

import stripe from './stripe';
import paypal from './paypal';

/*
 *
 * stripePayout(req)
 *
 * This function simply determines whether or not the user is requesting Stripe as the payout account type
 *
 */
function stripePayout(req) {
  return req.query.stripe && req.query.stripe.toLowerCase() === 'true' && ov_config.payout_stripe;
}

/*
 *
 * paypalPayout(req)
 *
 * This function simply determines whether or not the user is requesting PayPal as the payout account type
 *
 */
function paypalPayout(req) {
  return req.query.paypal && req.query.paypal.toLowerCase() === 'true' && ov_config.payout_paypal;
}

module.exports = Router({mergeParams: true})
/*
 *
 * This route determines what type of account the user wishes to connect, then calls the appropriate function
 *   NOTE: the "appropriate function" here lives in a module here in the routes directory. These functions
 *   really should be in the /services/stripe and /services/paypal modules.
 *
 */
.post('/payouts/account', async (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.')

  if (stripePayout(req)) {
    return stripe.createStripeAccount(req, res);
  }
  else if (paypalPayout(req)) {
    if (!validateEmail(req.body.email)) return _400(res, 'Invalid email.')
    return paypal.createPaypalAccount(req, res);
  }
  else {
    return error(400, res, 'Payouts not supported.');
  }
})

.delete('/payouts/account', async (req, res) => {
  return stripe.demoteStripeAccount(req, res);
})

/*
 *
 * This route is an admin route meant for creating test (sandbox) payout accounts for QA
 *
 */
.post('/payouts/test-account', async (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.')
  if (!req.admin) return _403(res, "Permission denied.");

  if (stripePayout(req)) {
    return stripe.createStripeTestAccount(req, res);
  }
  else if (paypalPayout(req)) {
    return error(400, res, 'Not implemented.');
  }
  else {
    return error(400, res, 'Payouts not supported.');
  }
})
/*
 *
 * This route is an admin route meant for QA / testing purposes
 *
 * It finds the Ambassador / Tripler combo given, and manually executes the disburse function.
 *   This is usually performed automatically on a schedule by the /lib/cron module.
 *
 */
.put('/payouts/disburse', async (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.')
  if (!req.admin) return _403(res, "Permission denied.");

  let ambassadorId = req.query['ambassador-id'];
  let triplerId = req.query['tripler-id'];

  if (!ambassadorId || !triplerId) {
    return error(400, res, 'Invalid parameters, cannot disburse.');
  }

  let ambassador = await ambassadorSvc.findById(ambassadorId);
  if (!ambassador) {
    return error(400, res, 'Invalid ambassador, cannot disburse.');
  }

  let tripler = await triplerSvc.findById(triplerId);
  if (!tripler) {
    return error(400, res, 'Invalid tripler, cannot disburse.');
  }

  let payoutType = '';
  req.user.get('owns_account').forEach(async (entry) => {
    if (entry.otherNode().get('account_type') === 'stripe' && entry.otherNode().get('is_primary')) {
      payoutType = 'stripe';
    } else if (entry.otherNode().get('account_type') === 'paypal' && entry.otherNode().get('is_primary')) {
      payoutType = 'paypal';
    }
  });

  try {
    if (payoutType === 'stripe') {
      await stripeSvc.disburse(ambassador, tripler);
    } else if (payoutType === 'paypal') {
      await paypalSvc.disburse(ambassador, tripler);
    }
  }
  catch (err) {
    req.logger.error('Unable to disburse money via (%s) to ambassador (%s) for tripler (%s): %s', payoutType, ambassador.get('phone'), tripler.get('phone'), err);
    return error(500, res, 'Unable to disburse money via (%s). Please contact support@blockpower.vote for help. E7', payoutType);
  }
  return _204(res);
})
/*
 *
 * This route is obsolete. It was originally used to manually settle a payout for testing / QA purposes, before settling was determined to be the incorrect way to do things.
 *
 */
.put('/payouts/settle', async (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.')
  if (!req.admin) return _403(res, "Permission denied.");

  let ambassadorId = req.query['ambassador-id'];
  let triplerId = req.query['tripler-id'];

  if (!ambassadorId || !triplerId) {
    return error(400, res, 'Invalid parameters, cannot settle.');
  }

  let ambassador = await ambassadorSvc.findById(ambassadorId);
  if (!ambassador) {
    return error(400, res, 'Invalid ambassador, cannot settle.');
  }

  let tripler = await triplerSvc.findById(triplerId);
  if (!tripler) {
    return error(400, res, 'Invalid tripler, cannot settle.');
  }

  // TODO: See what the default account is, and invoke appropriate payment provider api

  try {
    await stripeSvc.settle(ambassador, tripler);
  }
  catch (err) {
    req.logger.error('Unable to settle for ambassador (%s) for tripler (%s): %s', ambassador.get('phone'), tripler.get('phone'), err);
    return error(500, res, 'Unable to settle, please check logs.');
  }

  return _204(res);
});
