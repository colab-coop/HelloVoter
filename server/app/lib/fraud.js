import { ov_config } from './ov_config';

// The keys to this should be property names on the Ambassador, and
// the values should be numeric weights.  The weights should be
// POSITIVE if a positive value for the property means GOOD behaviour,
// NEGATIVE if a positive value for the property means BAD behaviour.
const TRUST_WEIGHTS = {
  ambassador_ekata_blemish: -1,
  tripler_ekata_blemish: -1,
  admin_bonus: 1,
  bad_triplee_penalty: -1,
};

// This should be a negative number, below which the user will be
// locked for fraud.
const FRAUD_THRESHOLD = parseFloat(ov_config.fraud_threshold) || -8;

// Determines whether the user's actions should be blocked for fraud,
// by comparing the total trust score to the FRAUD_THRESHOLD.
export const isLocked = (user) => {

  return calcTrust(user) < FRAUD_THRESHOLD;
};

// Calculates the total trust score, which will be compared against
// the FRAUD_THRESHOLD.  POSITIVE means GOOD behaviour.
export const calcTrust = (user) => {
  let trust = 0;
  for (const key of Object.keys(TRUST_WEIGHTS)) {
    trust += (user.get(key) || 0) * TRUST_WEIGHTS[key];
  }
  return trust;
};

// Gets all the details on trust to send to the admin front-end for display.
export const getTrustFactors = (user) => {
  const factors = {};
  for (const key of Object.keys(TRUST_WEIGHTS)) {
    factors[key] = user.get(key) || 0;
  }
  const trust = calcTrust(user);
  return {
    factors: factors,
    weights: TRUST_WEIGHTS,
    trust: trust
  };
};
