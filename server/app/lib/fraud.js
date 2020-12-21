import { ov_config } from './ov_config';

// Trust factors should be one of these types:
//
//   - Flag (something that can be true or false): The property name
//     should be a complete statement, e.g. ambassador_has_bad_hair
//
//   - Count (a count of discrete items): The property name should
//     be a plural noun phrase, e.g. suspicious_triplee_names
//
//   - Score (any number that isn't a count): The property name should
//     be a singular noun phrase, e.g. ambassador_height_in_cm
//
// Following these conventions will make the property name readable
// (with underscores replaced by spaces) in a context that shows the
// trust factors, e.g.
//
// Ambassador: Sherlock Holmes
//     Ambassador lacks sufficient Ekata matches: true
//     Suspicious triplee names: 4
//     Triplee names matching ambassador: 0
//     Repeated triplee names beyond two: 1
//     Machine learning model score: 4.24
//
// and also in a context that shows the trust weights, e.g.
//
// Trust weights:
//     Ambassador lacks sufficient Ekata matches: -2 points
//     Suspicious triplee names: -4 points
//     Triplee names matching ambassador: 0 points
//     Repeated triplee names beyond two: -1 point
//     Machine learning model score: +2 points

// This object's keys should be property names on the Ambassador, and
// the values should be numeric weights.  The weights should be
// POSITIVE if a positive value for the property means GOOD behaviour,
// NEGATIVE if a positive value for the property means BAD behaviour.
const TRUST_WEIGHTS = {
  // Bonuses
  admin_bonus: 1,

  // Penalties
  ambassador_ekata_blemish: -1,
  tripler_ekata_blemish: -1,

  // How many triplee names don't look like names?
  suspicious_triplee_names: -1,

  // How many triplees have the same name as the ambassador?
  triplee_names_matching_ambassador: -1,

  // How many triplees have the same name as their tripler?
  triplee_names_matching_tripler: -1,

  // If more than two triplees have a name that matches any other triplees
  // of this ambassador, how many more? (i.e. subtract 2, ignore if negative)
  repeated_triplee_names_beyond_two: -1,

  // How many triplers have duplicates among their triplee names?
  triplers_with_repeated_triplee_names: -1,
};

// This should be a negative number.  If the user's total is at or
// below this number, their login will be locked for fraud.
const FRAUD_THRESHOLD = parseFloat(ov_config.fraud_threshold) || -8;

// Determines whether the user's actions should be blocked for fraud,
// by comparing the total trust score to the FRAUD_THRESHOLD.
export const isLocked = (user) => {
  if (!user) return false;
  return calcTrust(user) <= FRAUD_THRESHOLD;
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
  if (!user) return {
    factors: {},
    weights: {},
    trust: 0,
    fraud_threshold: FRAUD_THRESHOLD,
  };

  const factors = {};
  for (const key of Object.keys(TRUST_WEIGHTS)) {
    factors[key] = user.get(key) || 0;
  }
  return {
    factors: factors,
    weights: TRUST_WEIGHTS,
    trust: calcTrust(user),
    fraud_threshold: FRAUD_THRESHOLD,
  };
};
