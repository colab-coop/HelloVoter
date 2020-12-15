import { v4 as uuidv4 } from 'uuid';

import { _204, _404 } from '../../../../lib/utils';

import stripeSvc from '../../../../services/stripe';
import plaidSvc from '../../../../services/plaid';
import { error } from '../../../../services/errors';

/*
 *
 * createStripeAccount(req, res)
 *
 * This function calls Plaid and Stripe service functions to create a Stripe Connected Account and attach a bank account to it.
 *
 * NOTE: This function probably belongs in the /services/stripe module.
 */
async function createStripeAccount(req, res) {
  if (!req.body.token) return error(400, res, "Invalid value to parameter 'token'.");
  if (!req.body.account_id) return error(400, res, "Invalid value to parameter 'account_id'.");

  try {
    const bankAccountToken = await plaidSvc.createStripeBankToken(req.body.token, req.body.account_id);
    const stripeConnectAccount = await stripeSvc.createConnectAccount(req.user, bankAccountToken, req.publicIP);

    const account = await req.neode.create('Account', {
      id: uuidv4(),
      account_type: 'stripe',
      account_id: stripeConnectAccount.id,
      account_data: JSON.stringify({last4: stripeConnectAccount.external_accounts.data[0].last4}),
      is_primary: true
    });

    req.user.get('owns_account').forEach((entry) => {
      entry.otherNode().update({is_primary: false});
    });

    await req.user.relateTo(account, 'owns_account');
    await req.user.update({payout_provider: 'stripe'});
  } catch (err) {
    return error(400, res, err + ' ' + JSON.stringify(err, null, 2));
  }
  
  return _204(res);
}

// Marks an Account as no longer primary, to indicate that the user no
// longer wants payouts to go to this Account.
async function demoteStripeAccount(req, res) {
  if (!req.body.id) return error(400, res, "Parameter 'id' should be an Account node id.");
  const edges = req.user.get('owns_account');
  for (let e = 0; e < edges.length; e++) {
    const account = edges?.get(e)?.otherNode();
    if (account?.get('id') === req.body.id) {
      account.update({'is_primary': false});
      return _204(res);
    }
  }
  return _404(res, 'Account not found');
}

/*
 *
 * createStripeTestAccount(req, res)
 *
 * This function does the same thing as createStripeAccount, but does it in 'sandbox' mode.
 *
 */
async function createStripeTestAccount(req, res) {
  try {
    const bankAccountToken = await plaidSvc.createStripeTestBankToken();
    const stripeConnectAccount = await stripeSvc.createConnectAccount(req.user, bankAccountToken, req.publicIP);

    const account = await req.neode.create('Account', {
      id: uuidv4(),
      account_type: 'stripe',
      account_id: stripeConnectAccount.id,
      account_data: JSON.stringify({last4: stripeConnectAccount.external_accounts.data[0].last4})
    });
    await req.user.relateTo(account, 'owns_account');
    await req.user.update({payout_provider: 'stripe'});
  } catch (err) {
    return error(400, res, err + ' ' + JSON.stringify(err, null, 2));
  }
  return _204(res);
}

module.exports = {
  createStripeAccount: createStripeAccount,
  createStripeTestAccount: createStripeTestAccount,
  demoteStripeAccount: demoteStripeAccount
};
