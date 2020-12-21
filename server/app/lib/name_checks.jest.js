import { normalizeName, hasVowels, allNameChars, isNameValid } from './name_checks';

test('normalizeName normalizes names correctly', () => {
  expect(normalizeName('a')).toBe('a')
  expect(normalizeName('ab')).toBe('ab')
  expect(normalizeName(' Mr Smith')).toBe('mr smith')
  expect(normalizeName(' Mr john Smith')).toBe('john smith')
  expect(normalizeName(' Mr Smith II')).toBe('mr smith ii')
  expect(normalizeName(' Mr john---Smith III')).toBe('john smith iii')
  expect(normalizeName(' NEO ')).toBe('neo')
  expect(normalizeName(" Ne'o ")).toBe('neo')
  expect(normalizeName(" Chris O'Dowd ")).toBe('chris odowd')
  expect(normalizeName(' MrSmith ')).toBe('mr smith')
  expect(normalizeName(' MrSmithJr. ')).toBe('mr smith jr')
  expect(normalizeName(' MrSmithJr1 ')).toBe('mr smith jr')
  expect(normalizeName(' John   Adams ')).toBe('john adams')
});

test('hasVowels checks names correctly', () => {
  expect(hasVowels('Bob')).toBe(true);
  expect(hasVowels('Vy')).toBe(true);
  expect(hasVowels('Vi')).toBe(true);
  expect(hasVowels('guy')).toBe(true);
  expect(hasVowels('vvssdddfff')).toBe(false);
});

test('allNameChars checks names correctly', () => {
  expect(allNameChars("D'Mitri")).toBe(true);
  expect(allNameChars("Santos-Dumont")).toBe(true);
  expect(allNameChars("Santos/Dumont")).toBe(false);
});

test('isNameValid accepts valid names', () => {
  expect(isNameValid("ae")).toBe(true)
  expect(isNameValid("al")).toBe(true)
  expect(isNameValid("long")).toBe(true)
  expect(isNameValid("jON")).toBe(true)
  expect(isNameValid("ng")).toBe(true)
  expect(isNameValid("Smith Jr")).toBe(true)
  expect(isNameValid("Smith Jr.")).toBe(true)
  expect(isNameValid("Johns Sr.")).toBe(true)
  expect(isNameValid("Johns Sr.")).toBe(true)
  expect(isNameValid("D'Mitri")).toBe(true)
  expect(isNameValid("D'monti")).toBe(true)
  expect(isNameValid("D'monti")).toBe(true)
  expect(isNameValid("Santos-Dumont")).toBe(true)
  expect(isNameValid("Dia’vonta")).toBe(true)
});

test('isNameValid rejects invalid names', () => {
  expect(isNameValid("a")).toBe(false)
  expect(isNameValid("lbl")).toBe(false)
  expect(isNameValid("2")).toBe(false)
  expect(isNameValid("a32")).toBe(false)
  expect(isNameValid("j0n")).toBe(false)
  expect(isNameValid("M.")).toBe(false)
  expect(isNameValid("b.")).toBe(false)
  expect(isNameValid("j2")).toBe(false)
  expect(isNameValid("a p")).toBe(false)
  expect(isNameValid("J K")).toBe(false)
  expect(isNameValid("")).toBe(false)
  expect(isNameValid(" ")).toBe(false)
});
