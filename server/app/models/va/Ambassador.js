/*
 *
 * This model corresponds to the Ambassador neo4j nodes
 */
module.exports = {
  // This is the BlockPower internal ID (uuidv4)
  id: {
    type: "uuid",
    primary: true,
  },
  // This is the ID given by Facebook or Google
  external_id: {
    type: "string",
  },
  hs_id: {
    type: "integer",
  },
  first_name: {
    type: "string",
    required: true,
  },
  last_name: {
    type: "string",
    required: true,
  },
  date_of_birth: "string",
  phone: {
    type: "string",
    required: true,
  },
  email: {
    type: "string",
  },
  address: {
    type: "string",
    required: true,
  },
  // This is the lat/lon data obtained either through address or zip
  location: {
    type: "point",
    required: true,
  },
  // This Neo4J relationship says that this Ambassador has "claimed" this Tripler.
  // The Ambassador is expected to send the SMS to the Tripler asking to confirm.
  // When one Ambassador claims a Tripler, that Tripler is not to be claimed by
  //   any other Ambassador.
  claims: {
    type: "relationships",
    relationship: "CLAIMS",
    direction: "out",
    target: "Tripler",
    properties: {
      since: {
        type: "localdatetime",
        default: () => new Date(),
      },
    },
    eager: true,
  },
  signup_completed: {
    // Has this voter completed the signup form?
    type: "boolean",
    default: false,
  },
  approved: {
    // Has this voter passed Alloy checks?
    type: "boolean",
    default: false,
  },
  quiz_completed: {
    // Has this voter completed the WordPress quiz?
    type: "boolean",
    default: false,
  },
  onboarding_completed: {
    // Has this voter completed all onboarding steps?
    type: "boolean",
    default: false,
  },
  giftcard_completed: {
    // Have we sent this voter a gift card for finishing onboarding?
    type: "boolean",
    default: false,
  },
  created_at: {
    type: "localdatetime",
    default: () => new Date(),
  },
  // TODO: Remove "locked" from the model once we have fraud score components.
  locked: {
    // Has this voter been flagged for fraud?
    type: "boolean",
    default: false,
  },
  admin: {
    // Does this voter have admin privileges?
    type: "boolean",
    default: false,
  },
  has_w9: {
    type: "boolean",
    default: false,
  },
  paypal_approved: {
    // Is this voter allowed to set up payouts via PayPal?
    type: "boolean",
    default: false,
  },
  payout_provider: {
    // "stripe" or "paypal"
    type: "string",
  },
  ambassador_ekata_blemish: {
    type: "number",
    default: 0,
  },
  tripler_ekata_blemish: {
    type: "number",
    default: 0,
  },
  // This relationship connects an Ambassador to a Payout. An Ambassador can have many
  //   Payouts. NOTE the tripler_id property of this relationship.
  gets_paid: {
    type: "relationships",
    relationship: "GETS_PAID",
    direction: "out",
    target: "Payout",
    properties: {
      since: {
        type: "localdatetime",
        default: () => new Date(),
      },
      tripler_id: "uuid",
    },
    eager: true,
  },
  // This relationship is obsolete and unused.
  first_reward: {
    type: "relationships",
    relationship: "FIRST_REWARD",
    direction: "out",
    target: "Payout",
    properties: {
      since: {
        type: "localdatetime",
        default: () => new Date(),
      },
      tripler_id: "uuid",
    },
    eager: true,
  },
  // This relationship connects an Ambassador to an Account. An Ambassador can have many
  //   different Accounts.
  owns_account: {
    type: "relationships",
    relationship: "OWNS_ACCOUNT",
    direction: "out",
    target: "Account",
    properties: {
      since: {
        type: "localdatetime",
        default: () => new Date(),
      },
    },
    eager: true,
  },
  // This relatinship is between an Ambassador and a Tripler. It signifies that an Ambassador
  //   was once the tripler this relationship connects with. This means the tripler has "upgraded"
  //   to become an Ambassador themselves. Note the "rewarded_previous_claimer" property, which
  //   indicates that the now-Ambassador has confirmed a Tripler, which rewards the original
  //   Ambassador that confirmed the tripler that became this Ambassador.
  was_once: {
    type: "relationship",
    relationship: "WAS_ONCE",
    direction: "out",
    target: "Tripler",
    properties: {
      rewarded_previous_claimer: "boolean",
      since: {
        type: "localdatetime",
        default: () => new Date(),
      },
    },
    eager: true,
  },
  // Points to the EkataPerson(s) with whom the Ambassador may be associated.
  ekata_associated: {
    type: "relationships",
    target: "EkataPerson",
    relationship: "EKATA_ASSOCIATED",
    direction: "out",
    eager: true,
    cascade: "detach",
  },
  // This contains the stringified JSON response from Twilio and Ekata's caller ID services
  verification: "string",
  // This contains the stringified JSON response from Twilio on the carrier data for this
  //   Ambassador's phone number
  carrier_info: "string",

  alloy_person_id: {
    type: "integer",
    default: null,
  },
  admin_bonus: {
    //a hopefully positive number denoting how trusted the ambassador is (but it can be negative)
    type: "number",
    default: 0,
  },
  bad_triplee_penalty: {
    // a score measuring the quality of the ambasador's tripler triplees
    type: "number",
    default: 0,
  },
  // Custom, per-ambassador limit on the number of triplers that can be claimed.
  // If null, the limit will be the value of the env var CLAIM_TRIPLER_LIMIT.
  claim_tripler_limit: {
    type: "integer",
    default: null,
  },
  //explains the ekata match scores
  ekata_report: {
    type: "string",
    default: null,
  },
  // Voting plans (actually links to start them) for Triplers canvassed by
  // this Ambassador.  There should be one of these for each confirmed Tripler.
  canvassed_plans: {
    type: "relationships",
    direction: "out",
    relationship: "CANVASSED",
    target: "VotingPlan",
    cascade: "detach"
  }
}
