/*
 *
 * This model corresponds to the EkataLocation neo4j nodes
 * All data comes from Ekata
 */

module.exports = {
  // This is the Ekata Location id, it comes from Ekata
  id: {
    type: "string",
    primary: true,
  },
  accuracy: {
    type: "string",
  },
  street_line_1: {
    type: "string",
  },
  street_line_2: {
    type: "string",
  },
  city: {
    type: "string",
  },
  postal_code: {
    type: "string",
  },
  state_code: {
    type: "string",
  },
  zip4: {
    type: "string",
  },
}
