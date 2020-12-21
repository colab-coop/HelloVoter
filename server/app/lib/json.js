// Parses JSON without throwing exceptions.  If the JSON is malformed,
// returns the given default value.
function parseJson(str, defaultValue) {
  try {
    return JSON.parse(str);
  } catch (e) {
    console.warn('Invalid JSON: ', str);
  }
  return defaultValue;
}

module.exports = {
  parseJson
};
