// VotingPlan node definition
//
// Represents a voting plan, or a link that potentially leads to the creation
// of a voting plan; related to the voter who is making the plan and the
// canvasser who provided the link.
//
// This models the situation where an Ambassador canvasses a Tripler as:
// provider: Ambassador -[:PROVIDES_LINK]-> VotingPlan -[:FOR_VOTER]-> voter: Tripler
//
// TODO(ping): This should also be used to model a Tripler canvassing a Triplee:
// provider: Tripler -[:PROVIDES_LINK]-> VotingPlan -[:FOR_VOTER]-> voter: Triplee

module.exports = {
  id: { type: "uuid", primary: true },

  // BallotReady provides a "ballot_id" field (see the "User Data Dictionary").
  // It is uniquely generated each time a user begins their BallotReady flow,
  // so it can also serve as a unique ID for a voting plan created by a voter.
  ballot_id: "string",  // constrained unique

  create_time: { type: "number", required: true },
  last_send_time: "number",  // last time we texted this link to the voter

  link_code: { type: "string", required: true },  // constrained unique

  canvasser: {
    type: "node",
    direction: "in",
    relationship: "CANVASSED",
    target: "Ambassador",
    cascade: "detach",
    eager: true,
  },
  voter: {
    type: "node",
    direction: "in",
    relationship: "OWNS",
    target: "Tripler",
    cascade: "detach",
    eager: true,
  }
};
