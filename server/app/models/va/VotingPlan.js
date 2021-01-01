// VotingPlan node definition
//
// Represents a voting plan, or a link that potentially leads to the creation
// of a voting plan; related to the voter who is making the plan and the
// canvasser who provided the link.
//
// The voter can be an Ambassador, a Tripler, or (when we have Triplee nodes)
// a Triplee; Ambassadors have no canvasser.  The three patterns look like this:
//
//                                 (v: VotingPlan) <-[:OWNS]- (a: Ambassador)
// (a: Ambassador) -[:CANVASSED]-> (v: VotingPlan) <-[:OWNS]- (b: Tripler)
//    (b: Tripler) -[:CANVASSED]-> (v: VotingPlan) <-[:OWNS]- (c: Triplee)

module.exports = {
  id: { type: "uuid", primary: true },

  // BallotReady provides a "ballot_id" field (see the "User Data Dictionary").
  // It is uniquely generated each time a user begins their BallotReady flow,
  // so it can also serve as a unique ID for a voting plan created by a voter.
  ballot_id: "string",  // constrained unique

  create_time: { type: "number", required: true },
  last_send_time: "number",  // last time we texted this link to the voter

  link_code: { type: "string", required: true },  // constrained unique
  link_clicks: "string",  // a JSON array of timestamps when the link was used

  canvasser: {
    type: "node",
    direction: "in",
    relationship: "CANVASSED",
    cascade: "detach",
    eager: true,
  },
  voter: {
    type: "node",
    direction: "in",
    relationship: "OWNS",
    cascade: "detach",
    eager: true,
  }
};
