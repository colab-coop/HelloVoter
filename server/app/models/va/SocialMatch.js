// SocialMatch nodes in Neo4J
module.exports = {
  similarity_metric: "number",
  source_id: "string",
  target_id: "string",

  participants: {
    // No "target" label is specified because SocialMatches can connect
    // Ambassador nodes or Tripler nodes.
    type: 'nodes',
    relationship: 'HAS_SOCIAL_MATCH',
    direction: 'in',
    cascade: 'detach',
    eager: true
  }
};
