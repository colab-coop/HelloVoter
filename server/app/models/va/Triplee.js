// Model for Triplee nodes in neo4j
module.exports = {
  // This is the BlockPower internal ID
  id: {
    type: "uuid",
    primary: true,
  },
  first_name: {
    type: "string",
    required: true,
  },
  last_name: "string",
  hs_id: "string",
  phone: "string",
  email: "string",
  address: "string",
  created_at: {
    type: "localdatetime",
    default: () => new Date(),
  },
  // This points back to the Tripler that claimed (canvassed) this Triplee.
  // At the moment each Triplee belongs to exactly one Tripler, because we
  // are making three new Triplee nodes for every Tripler, even if two
  // Triplers claim the same person as a Triplee.  If, in the future, we
  // decide to unify two Triplee nodes that represent the same person, then
  // a Triplee could be associated with more than one Tripler.
  claimed: {
    type: "node",
    target: "Tripler",
    relationship: "CLAIMS",
    direction: "in",
    eager: true,
    cascade: "detach",
  },
  voted: {
    type: "boolean",
    default: false,
  },
  // The Triplee's own voting plans.  Usually there should be at most one.
  own_plans: {
    type: "nodes",
    direction: "out",
    relationship: "OWNS",
    target: "VotingPlan",
    cascade: "detach",
    eager: true,
  }
}
