/*
 *
 * This model corresponds to the Payout neo4j nodes
 *
 */
module.exports = {
  // This is the BlockPower internal ID
  id: {
    type: 'uuid',
    primary: true
  },
  // This indicates the amount the payout to the Ambassador should be, in USD cents. eg 2000 equals $20.00USD
  amount: {
    // TODO(ping): This has always been type "integer", but that causes Neode to
    // return a {high: 123, low: 456} object, so the type should really be "number".
    // We're not changing this for now (2020-12-19) for fear of breaking anything,
    // but we should clean this up after the Georgia runoffs.
    type: 'integer',
    required: true
  },
  // The Payout begins its life as 'pending'. The cron job in /background/payouts.js finds Payouts of this status
  //   and initiates the payout. The status upon completion becomes 'disbursed'.
  status: {
    type: 'string',
    default: 'pending'
  },
  // The date of the disbursal
  disbursed_at: {
    type: 'localdatetime',
    required: false
  },
  // This is obsolete. There was at one point a 2-phase payout, starting with the disbursal process, then
  //   the 'settlement' process which in theory pushed the funds from the Stripe account into the user's
  //   bank account. This turned out to be incorrect. Now, only the 'disbursement' process occurs. Stripe
  //   then pays out to the bank account at some point in the future without our involvement.
  settled_at: {
    type: 'localdatetime',
    required: false
  },
  // This is the disbursal ID given by Stripe at the time of disbursal
  disbursement_id: {
    type: 'string',
    required: false
  },
  // This is obsolete. see 'settled_at' above
  settlement_id: {
    type: 'string',
    required: false
  },
  // This attribute holds the stringified error message from Stripe if a disbursal fails for whatever reason.
  error: {
    type: 'string',
    required: false
  },
  // This appears to be an unused attribute.
  to_account: {
    type: 'node',
    relationship: 'TO_ACCOUNT',
    direction: 'out',
    target: 'Account',
    cascade: 'detach',
    eager: true
  }
};
