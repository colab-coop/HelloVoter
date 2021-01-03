import { stringify } from 'query-string';
import neode from '../lib/neode';
import { parseJson } from '../lib/json';

const START_URL = 'https://app.blockpower.civicengine.com/';
const PREFILL_URL = 'https://app.blockpower.civicengine.com/w/prepare';

const getFullName = (voter) => voter && [
  voter.get('first_name'), voter.get('last_name')
].filter(x => x).join(' ').trim();

const getAddress = (person) => {
  if (!person) return null;
  const address = parseJson(person.get('address'), {});
  return address ? [
    person.get('address1_with_house_number') || address.address1,
    address.city,
    address.state,
    address.zip
  ].filter(x => x).join(', ').trim() : null;
};

const getZip = (person) => {
  if (!person) return null;
  const address = parseJson(person.get('address'), {});
  return (address ? address.zip : null) || person.get('zip');
};

const prepareBallotReadyUrl = (voter, canvasser, link_code) => {
  const params = {
    name: getFullName(voter),
    first_name: voter.get('first_name'),
    last_name: voter.get('last_name'),
    // Let's leave out the email address for now because it was preloaded
    // with the Tripler, and it seems creepy to show them an e-mail address
    // from our files that they didn't enter themselves.
    // email: voter.get('email'),
    phone: voter?.get?.('phone'),
    address: getAddress(voter),
    utm_content: canvasser?.get?.('hs_id'),
    utm_term: voter?.get?.('hs_id'),
    // The link_code param is not used by BallotReady; it's included so it
    // will show up in the initial_url field in the BallotReady clickstream.
    link_code: link_code
  };
  if (params.address) {
    return PREFILL_URL + '?' + stringify(params);
  } else {
    // If we don't have an address, send the voter to START_URL, which will
    // ask them to enter their address.  We still include all the params;
    // even though BallotReady won't use them for prefilling, the URL will
    // be captured in the initial_url field in the BallotReady clickstream.
    return START_URL + '?' + stringify(params);
  }
};

module.exports = {
  prepareBallotReadyUrl
};
