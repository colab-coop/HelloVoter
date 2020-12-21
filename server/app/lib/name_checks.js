const PREFIXES = ['mr', 'mr.', 'ms', 'ms.', 'mrs', 'mrs.'];
const SUFFIXES = ['ii', 'iii', 'iv', 'jr', 'jr.', 'sr', 'sr.'];

function splitWords(str) {
  // Treat all punctuation and spaces as word breaks, except apostrophes.
  return (str || '').replace(/['’]/g, '').replace(/\W+/g, ' ').trim().split(' ');
}

// All functions below are translated from the Python module
// fullsync.Fraud.tripletNameCheck.modules.genericNameValidator

function normalizeName(name) {
  let words = splitWords(name);
  if (words.length === 1) {
    const parts = words[0].match(/[A-Z][a-z\.]+/g);
    if (parts?.length >= 2 && parts[0].length > 1 && parts[1].length > 1) {
      words = parts;
    }
  }
  words = words.map(word => word.toLowerCase());
  words = removePrefix(words, PREFIXES, SUFFIXES);
  return words.join(' ');
}

// Given words, prefixes, and suffixes that are all lowercase, removes
// the first word if it's a prefix and the third word isn't a suffix.
function removePrefix(words, prefixes, suffixes) {
  if (words.length > 2) {
    if (prefixes.includes(words[0]) && !suffixes.includes(words[2])) {
      return words.slice(1);
    }
  }
  return words;
}

// Given words and suffixes that are all lowercase, removes the last
// word if it's a suffix.
function removeSuffix(words, suffixes) {
  if (suffixes.includes(words[words.length - 1])) {
    return words.slice(0, words.length - 1);
  }
  return words;
}

// Returns true if the name is non-empty and contains no characters
// other than letters, periods, apostrophes, or hyphens.
function allNameChars(name) {
  return !!name.match(/^[ A-Za-z.'’-]+$/);
}

// Returns true if the name contains at least one vowel.
function hasVowels(name) {
  return !!name.match(/[aeiouy]/);
}

// Applies some heuristics to guess whether a name seems legitimate.
function isNameValid(name) {
  const normName = normalizeName(name);
  const noSuffix = removeSuffix(splitWords(normName), SUFFIXES).join(' ');
  const noDots = noSuffix.replace(/\./g, '');
  if (noDots.length <= 1) return false;
  if (noDots.length >= 3 && !hasVowels(noSuffix)) return false;
  if (!allNameChars(noSuffix)) return false;
  const words = splitWords(noSuffix);
  if (words.length > 1) {
    for (const word of words) {
      if (!isNameValid(word)) return false;
    }
  }
  return true;
}

module.exports = {
  normalizeName,
  hasVowels,
  allNameChars,
  isNameValid
};
