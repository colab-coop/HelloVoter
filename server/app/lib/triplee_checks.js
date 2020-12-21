import { normalizeName, isNameValid } from './name_checks';
import { parseJson } from './json';

function evaluateTripleeNames(ambassadorName, triplerName, tripleeNames) {
  console.log('evaluateTripleeNames', {ambassadorName, triplerName, tripleeNames});
  const nonUniqueNames = [];
  const suspiciousNames = [];
  const sameAsAmbassadorNames = [];
  const sameAsTriplerNames = [];

  const normAmbassadorName = normalizeName(ambassadorName);
  const normTriplerName = normalizeName(triplerName);

  const seenNames = new Set();
  for (const name of tripleeNames) {
    const norm = normalizeName(name);

    if (seenNames.has(norm)) nonUniqueNames.push(name);
    if (!isNameValid(norm)) suspiciousNames.push(name);
    if (norm === normAmbassadorName) sameAsAmbassadorNames.push(name);
    if (norm === normTriplerName) sameAsTriplerNames.push(name);

    seenNames.add(norm);
  }
  console.log('=>', {nonUniqueNames, suspiciousNames, sameAsAmbassadorNames, sameAsTriplerNames});
  return {
    nonUniqueNames,
    suspiciousNames,
    sameAsAmbassadorNames,
    sameAsTriplerNames
  };
}

function getFullName(node) {
  const first_name = node.get('first_name') || '';
  const last_name = node.get('last_name') || '';
  return (first_name + ' ' + last_name).trim();
}

function getTripleeNames(tripler) {
  const names = parseJson(tripler.get('triplees'), []);
  return names.map(
    ({first_name, last_name}) =>
    ((first_name || '') + ' ' + (last_name || '')).trim()
  );
}

function calcTripleeNameTrustFactors(ambassador, triplers) {
  const allTripleeNames = [];
  let numSuspiciousNames = 0;
  let numSameAsAmbassadorNames = 0;
  let numSameAsTriplerNames = 0;
  let numTriplersWithRepeatedTriplees = 0;

  for (const tripler of triplers) {
    // Triplers in the "unconfirmed" status have no triplees yet.
    if (!tripler.get('triplees')) continue;

    const tripleeNames = getTripleeNames(tripler);
    allTripleeNames.push(...tripleeNames.map(normalizeName));

    const result = evaluateTripleeNames(
      getFullName(ambassador), getFullName(tripler), tripleeNames);
    numSuspiciousNames += result.suspiciousNames.length;
    numSameAsAmbassadorNames += result.sameAsAmbassadorNames.length;
    numSameAsTriplerNames += result.sameAsTriplerNames.length;
    if (result.nonUniqueNames.length > 0) {
      numTriplersWithRepeatedTriplees += 1;
    }
  }
  const numUniqueTriplees = new Set(allTripleeNames).size;
  const numRepeatedNames = allTripleeNames.length - numUniqueTriplees;
  const results = {
    suspicious_triplee_names: numSuspiciousNames,
    triplee_names_matching_ambassador: numSameAsAmbassadorNames,
    triplee_names_matching_tripler: numSameAsTriplerNames,
    repeated_triplee_names_beyond_two: Math.max(0, numRepeatedNames - 2),
    triplers_with_repeated_triplee_names: numTriplersWithRepeatedTriplees,
  };
  console.log(`ambassador ${getFullName(ambassador)}:`, results);
  return results;
}

module.exports = {
  evaluateTripleeNames,
  calcTripleeNameTrustFactors
};
