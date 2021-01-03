/*
 *
 * This model corresponds to the Tripler neo4j nodes
 *
 */
module.exports = {
  // This is the BlockPower internal ID
  id: {
    type: "uuid",
    primary: true,
  },
  // This attribute contains the VoterID as imported from the voter data CSV
  voter_id: {
    type: "string",
  },
  first_name: {
    type: "string",
    required: true,
  },
  last_name: "string",
  date_of_birth: "string",
  hs_id: "string",
  phone: {
    type: "string",
  },
  email: "string",
  // This indicates what status the Tripler is in. When claimed, Triplers have a status of
  //   'unconfirmed'. When the Ambassador begins the confirmation process, they have a status
  //   of 'pending'. When the Tripler confirms, they have a status of 'confirmed'
  status: "string",
  // The date of confirmation
  confirmed_at: "localdatetime",
  // This indicates whether or not this Tripler has received an SMS encouraging them to upgrade
  //   and become an Ambassador themselves. This SMS is sent after a Tripler confirms, and is
  //   sent on a schedule as determined by the appropriate .env vars and /backgrounds/upgrade_sms.js
  upgrade_sms_sent: {
    type: "boolean",
    default: false,
  },
  address: {
    type: "string",
    required: true,
  },
  // This is the lat/lon data as imported from the voter data CSV
  location: {
    type: "point",
    required: true,
  },
  // This is the stringified JSON object sent by the Ambassador when initiating the Tripler
  //   confirmation process.
  triplees: "string",
  created_at: {
    type: "localdatetime",
    default: () => new Date(),
  },
  // This is unused. It was intended to be a part of a 'social distance' metric wherein
  //   social distance data was imported into the system to help the now-defunct 'suggest-tripler'
  //   function return Tripler results that the Ambassador was likely to know. This would work
  //   if a Tripler upgraded to an Ambassador, or if someone signed up as an Ambassador and matched
  //   the data of a Tripler in the system. This work was almost, but not quite, completed.
  knows: {
    type: "relationships",
    relationship: "KNOWS",
    target: "Tripler",
    properties: {
      distance: {
        type: "float",
      },
    },
    eager: true,
    cascade: "detach",
  },
  // This simply points back to the Ambassador that has a "claims" relationship with this Tripler
  claimed: {
    type: "node",
    target: "Ambassador",
    relationship: "CLAIMS",
    direction: "in",
    eager: true,
    cascade: "detach",
  },
  // This relationship points to this Tripler's Triplees.
  claims: {
    type: "relationships",
    relationship: "CLAIMS",
    direction: "out",
    target: "Triplee",
    properties: {
      since: {
        type: "localdatetime",
        default: () => new Date(),
      },
    },
    eager: true,
  },
  // Points to the EkataLocation(s) in which the Tripler is presumably located.
  ekata_located: {
    type: "relationships",
    target: "EkataLocation",
    relationship: "EKATA_LOCATED",
    direction: "out",
    eager: true,
    cascade: "detach",
  },
  // Points to the EkataPerson(s) with whom the Tripler may be associated.
  ekata_associated: {
    type: "relationships",
    target: "EkataPerson",
    relationship: "EKATA_ASSOCIATED",
    direction: "out",
    eager: true,
    cascade: "detach",
  },
  // This simply points back to the Ambassador that this Tripler now is
  is_ambassador: {
    type: "node",
    target: "Ambassador",
    relationship: "WAS_ONCE",
    eager: true,
    cascade: "detach",
  },
  // This indicates that the Tripler is now an Ambassador, and that Ambassador
  //   has already confirmed at least 1 Tripler themselves.
  is_ambassador_and_has_confirmed: {
    type: "boolean",
    default: false,
  },
  // This holds the stringified JSON as returned by Twilio and Ekata's caller ID lookup service
  verification: "string",
  // This holds the stringified JSON as returned by Twiilo, providing information on the Tripler's
  //   phone carrier, but only if this carrier is not blocked.
  carrier_info: "string",
  // This holds the stringified JSON as returned by Twiilo, providing information on the Tripler's
  //   phone carrier, but only if this carrier is blocked.
  blocked_carrier_info: "string",
  gender: "string",
  full_name: "string",
  // This is imported from the voter data CSV, in the form of "20-29", "40-49", and so on.
  age_decade: "string",
  // This is imported from the voter data CSV, and indicates the metro area they live in
  //   for example, 'GA Atlanta' would indicate this Tripler lives in the Atlanta metro region
  msa: "string",
  zip: "string",
  address1_with_house_number:"string",
  // The birth month (1-12) of this Tripler, according to the Ambassador.
  claimed_birth_month: "number",
  voted: {
    type: "boolean",
    default: false,
  },
  // Voting plans (actually links to start them) for Triplees canvassed by
  // this Tripler.  There should be three of these for each confirmed Tripler.
  canvassed_plans: {
    type: "nodes",
    direction: "out",
    relationship: "CANVASSED",
    target: "VotingPlan",
    cascade: "detach",
    eager: true,
  },
  // The Tripler's own voting plans.  Usually there should be at most one.
  own_plans: {
    type: "nodes",
    direction: "out",
    relationship: "OWNS",
    target: "VotingPlan",
    cascade: "detach",
    eager: true,
  }
}
