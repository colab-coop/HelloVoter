import { Router } from 'express';

import { ov_config } from '../../../../lib/ov_config';
import { version } from '../../../../../package.json';

import {
  _400, _401, geoCode
} from '../../../../lib/utils';

async function checkAddress(req, res) {
  if (!req.body.address) {
    return _400(res, "Address not provided");
  }

  let coordinates = await geoCode(req.body.address);
  return res.json({ valid: coordinates !== null });
}

module.exports = Router({ mergeParams: true })
  /*
   *
   * This route simply determines if an address is valid according to the census.gov geocoder
   *
   */
  .post('/shared/check-address', (req, res) => {
    if (!req.user) return _401(res, 'Permission denied.')
    return checkAddress(req, res);
  })
  /*
   *
   * This route is used by the frontend and the admin panel to display the organization name for the API they are talking to
   *
   */
  .get('/shared/orgname', (req, res) => {
    if (!req.user) return _401(res, 'Permission denied.')
    return res.json({ orgname: ov_config.organization_name });
  })
  .get('/shared/stats', async (req, res) => {
    let nv = await req.db.version();
    return res.json({
      admins: (await req.db.query('match (v:Ambassador {admin: true}) return count(v)')).data[0],
      ambassadors: {
        all: (await req.db.query('match (a:Ambassador) return count(a)')).data[0],
        signup_completed: (await req.db.query('match (a:Ambassador {signup_completed: true}) return count(a)')).data[0],
        onboarding_completed: (await req.db.query('match (a:Ambassador {onboarding_completed: true}) return count(a)')).data[0],
        all_voted: (await req.db.query('match (a:Ambassador {voted: true}) return count(a)')).data[0],
        signup_completed_voted: (await req.db.query('match (a:Ambassador {signup_completed: true, voted: true}) return count(a)')).data[0],
        onboarding_completed_voted: (await req.db.query('match (a:Ambassador {onboarding_completed: true, voted: true}) return count(a)')).data[0],
      },
      triplers: {
        all: (await req.db.query('match (t:Tripler) return count(t)')).data[0],
        pending: (await req.db.query('match (t:Tripler {status: "pending"}) return count(t)')).data[0],
        confirmed: (await req.db.query('match (t:Tripler {status: "confirmed"}) return count(t)')).data[0],
        all_voted: (await req.db.query('match (t:Tripler {voted: true}) return count(t)')).data[0],
        pending_voted: (await req.db.query('match (t:Tripler {status: "pending", voted: true}) return count(t)')).data[0],
        confirmed_voted: (await req.db.query('match (t:Tripler {status: "confirmed", voted: true}) return count(t)')).data[0],
      },
      triplees: {
        all: (await req.db.query('match (e:Triplee) return count(e)')).data[0],
        all_voted: (await req.db.query('match (e:Triplee {voted: true}) return count(e)')).data[0],
      },
      voting_plans: {
        all: (await req.db.query('match (v:VotingPlan) return count(v)')).data[0],
        clicked: (await req.db.query('match (v:VotingPlan) where exists(v.link_clicks) return count(v)')).data[0],
      },
      dbsize: await req.db.size(),
      version: version,
      neo4j_version: nv,
    });
  });
