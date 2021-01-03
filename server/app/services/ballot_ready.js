import { stringify } from 'query-string';
import neode from '../lib/neode';

const BASE_URL = 'https://app.blockpower.civicengine.com/w/prepare';

const getFullName = (voter) => voter && [
  voter.get('first_name'), voter.get('last_name')
].filter(x => x).join(' ');

const getAddress = (person) => {
  if (!person) return null;
  let address = {};
  try {
    address = JSON.parse(person.get('address'));
  } catch (e) { }
  let address1 = person.get('address1_with_house_number') ||  address.address1;
  return address ? [
    address1,
    address.city,
    address.state,
    address.zip
  ].join(', ') : null;
};

const getZip = (person) => {
  if (!person) return null;
  let address = {};
  try {
    address = JSON.parse(person.get('address'));
  } catch (e) { }
  return (address ? address.zip : null) || person.get('zip');
};

const prepareBallotReadyUrl = (voter, canvasser, link_code) => {
  let params;
  params = {
    name: getFullName(voter),
    // Let's leave out the email address for now because it was preloaded
    // with the Tripler, and it seems creepy to show them an e-mail address
    // from our files that they didn't enter themselves.
    // email: voter.get('email'),
    phone: voter?.get?.('phone'),
    // If the voter doesn't have an address, use the zip code of the canvasser.
    address: getAddress(voter) || getZip(canvasser),
    utm_content: canvasser?.get?.('hs_id'),
    utm_term: voter?.get?.('hs_id'),
    // The link_code param is not used by BallotReady; we include it so that
    // it will show up in the initial_url field in the BallotReady clickstream.
    link_code: link_code
  };
  return BASE_URL + '?' + stringify(params);
};

module.exports = {
  prepareBallotReadyUrl
};
