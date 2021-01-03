import {v4 as uuidv4} from "uuid"
import neode from '../lib/neode';
import {ov_config} from "../lib/ov_config"
import {parseJson} from '../lib/json';
import { selectTemplate, fillTemplate, getTemplateUsageCount } from '../lib/link_code';

const createVotingPlan = async (voter, canvasser, lowPrivacyMode) => {
  const template = await selectTemplate(
    voter.get('first_name'), voter.get('last_name'), lowPrivacyMode);
  const linkCode = await reserveLinkCode(template, lowPrivacyMode ? 2 : 10);
  const plan = await getVotingPlan(linkCode);
  plan.relateTo(voter, 'voter');
  if (canvasser) plan.relateTo(canvasser, 'canvasser');
  return plan;
};

const reserveLinkCode = async (template, privacyFactor) => {
  const usageCount = await getTemplateUsageCount(template);

  // Ensure at least one placeholder.
  if (!template.match(/_/)) template += '_';
  const numPlaceholders = (template.match(/_/g) || []).length;

  // Ensure a collision rate of at most 50%.
  if (privacyFactor < 2) privacyFactor = 2;

  // Use enough digits to keep the collision rate below 1/privacyFactor.
  let numDigits = 0;
  let numPossibilities = 1;
  while (usageCount > numPossibilities / privacyFactor) {
    numDigits++;
    for (let i = 0; i < numPlaceholders; i++) numPossibilities *= 8;
  }

  // Keep trying randomized link codes until we get a fresh one.
  let numAttempts = 0;
  while (true) {
    const linkCode = fillTemplate(template, numDigits);
    const result = await neode.cypher(`
      MERGE (p: VotingPlan {link_code: $link_code})
      ON CREATE SET
        p.id = $uuid,
        p.new = true,
        p.create_time = timestamp()
      ON MATCH SET p.new = false
      RETURN p.new as new
    `, {link_code: linkCode, uuid: uuidv4()});
    if (result.records[0].get('new') === true) {
      return linkCode;
    }

    // Since there's at most a 50% chance of a collision on each attempt, it's
    // unlikely we'll fail 100 times in a row.  However, there's a remote chance
    // of a race condition, so let's add more digits to ensure termination.
    if (++numAttempts > 100) {
      numAttempts = 0;
      numDigits++;
    }
  }
};

const getVotingPlan = async (linkCode) =>
  await neode.first('VotingPlan', 'link_code', linkCode);

const getVotingPlanUrl = (plan) =>
  ov_config.short_link_base_url + '/' + plan.get('link_code');

const recordVotingPlanClick = async (plan) => {
  const clicks = plan.get('link_clicks');
  const createTime = +plan.get('create_time');
  const timestamps = parseJson(clicks, []) || [];
  timestamps.push((new Date()).toISOString());
  await plan.update({
    link_clicks: JSON.stringify(timestamps),
    create_time: createTime
  });
};

module.exports = {
  createVotingPlan,
  getVotingPlan,
  getVotingPlanUrl,
  recordVotingPlanClick
};
