/*
 *
 * This index, referenced by /app/createExpressApp.js, would seem to indicate that only
 *   Ambassador and Tripler neode neo4j node types are accessible. This is not the case.
 *   One must come to the conclusion that one does not need neode models in order for
 *   neode to access neo4j nodes. This entire directory might be pointless.
 *
 */
module.exports = {
  Ambassador: require("./Ambassador"),
  Tripler: require("./Tripler"),
  EkataLocation: require("./EkataLocation"),
  EkataPerson: require("./EkataPerson"),
  VotingPlan: require('./VotingPlan')
};
