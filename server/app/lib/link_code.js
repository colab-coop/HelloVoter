import neode from './neode';

// Avoid zero, as it is harder to pronounce unambiguously.
// ("05" can be pronounced "oh-five"; "50" sounds like "fifteen".)
const randomDigit = () => Math.floor(1 + Math.random() * 9);

const randomDigits = (count) => {
  let digits = ""
  for (let i = 0; i < count; i++) {
    digits += randomDigit();
  }
  return digits;
};

const lowercaseLettersOnly = (name) => name.toLowerCase().replace(/[^a-z]/g, '');

const selectTemplate = async (firstName, lastName, lowPrivacyMode) => {
  const first = lowercaseLettersOnly(firstName);
  const last = lowercaseLettersOnly(lastName);

  const firstInitial = first.substr(0, 1);
  const lastInitial = last.substr(0, 1);

  // Various ways that we can combine the first and last name to make
  // a template.  The template could actually contain anything; we
  // are only using the voter's name in order to make the link code
  // something they can easily spell correctly, send in a text, speak
  // or hear over the phone, etc.  We could use random easy-to-spell
  // dictionary words, but names are likely to vary more and still be
  // correctly spellable by the voter.
  const options = [
    {maxLength: 12, template: first + '_' + last + '_'}
  ];

  // Avoid "o" and "l" as initials, since they look like "0" and "1".
  if (firstInitial != 'o' && firstInitial != 'l') options.push(
    {maxLength: 16, template: firstInitial + '_' + last + '_'}
  );
  if (lastInitial != 'o' && lastInitial != 'l') options.push(
    {maxLength: 16, template: first + '_' + lastInitial + '_'}
  );

  // Low-privacy link code templates only have digits at the end.
  if (lowPrivacyMode) {
    for (const option of options) {
      option.template = option.template.replace(/_/g, '') + '_';
    }
  }

  let lowestCost = Infinity;
  let bestTemplate = null;

  // First look for the least-used template that satisfies maxLength.
  for (const option of options) {
    if (option.template.length <= option.maxLength) {
      const usageCount = await getTemplateUsageCount(option.template);
      if (usageCount < lowestCost) {
        lowestCost = usageCount;
        bestTemplate = option.template;
      }
    }
  }

  // If no candidates were within maxLength, just pick the shortest one.
  if (bestTemplate == null) {
    lowestCost = Infinity;
    for (const option of options) {
      if (option.template.length < lowestCost) {
        lowestCost = option.template.length;
        bestTemplate = option.template;
      }
    }
  }

  // Now count that we used this template, and return it.
  incrementTemplateUsageCount(bestTemplate);
  return bestTemplate;
};

const fillTemplate = (template, numDigits) => template.replace(/_/g, () => randomDigits(numDigits));

const getTemplateUsageCount = async (template) => {
  const node = await neode.model('LinkCodeTemplate').first({id: template});
  return node?.get?.('count') || 0;
};

const incrementTemplateUsageCount = (template) => {
  // We use MERGE to avoid a race condition in creating a new node.
  // We use t += {count: t.count + 1} instead of t.count = t.count + 1
  // to avoid a race condition in incrementing the count.
  neode.cypher(`
    MERGE (t: LinkCodeTemplate {id: $template})
    ON CREATE SET t.count = 1
    ON MATCH SET t += {count: t.count + 1}
  `, {template});
};

module.exports = {
  selectTemplate,
  fillTemplate,
  getTemplateUsageCount
};
