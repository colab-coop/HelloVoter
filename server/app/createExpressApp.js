/*
 *
 * This is the entrypoint to a lot of the setup and configuration of the API.
 *
 * Note that much of this comes from the [HelloVoter](https://github.com/OurVoiceUSA/HelloVoter) app, not the BlockPower app, which is built on top of HelloVoter.
 *
 * As such, some of the code here does not concern the BlockPower app. Specifically, the 'invite' route and related code.
 *
 */
import express from 'express';
import 'express-async-errors';
import expressLogging from 'express-logging';
import cors from 'cors';
import logger from 'logops';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import bodyParser from 'body-parser';
import mobile from 'is-mobile';
import fs from 'fs';
import fetch from 'node-fetch';
import audit from 'morgan-body';

import { ov_config } from './lib/ov_config';
import ambassadorSvc from './services/ambassadors';
import { ip } from './lib/ip';
import { isLocked } from './lib/fraud';
import { getVotingPlan } from './services/voting_plans';
import { prepareBallotReadyUrl } from './services/ballot_ready';

import {
  cqdo, _400, _401, _403, _404, _500, _503
} from './lib/utils';

const router = require('./routes/createRouter.js')();

var public_key;
var jwt_iss = ov_config.jwt_iss;

export function doExpressInit(log, db, qq, neode) {

  // Initialize http server
  const app = express();
  const corsConfig = { exposedHeaders: ['x-sm-oauth-url'] };
  // If running in dev, allow cross-origin requests from other ports on localhost
  if (process.env['NODE_ENV'] === 'development') {
    corsConfig['origin'] = /^https?:\/\/localhost(:\d+)?/;
  }

  app.disable('x-powered-by');
  app.disable('etag');
  app.use(bodyParser.json({limit: '5mb'}));
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(cors(corsConfig));
  app.use(helmet());

  if (log) {
    // generic logger
    app.use(expressLogging(logger));

    // request logging
    if (ov_config.log_requests) {
      let maxBodyLength = parseInt(ov_config.log_request_max_body_length || 1000);
      audit(app, { noColors: true, maxBodyLength: maxBodyLength });
    }
  }

  if (ov_config.no_auth) {
    console.warn("Starting up without authentication!");
  } else if (ov_config.jwt_pub_key) {
    public_key = fs.readFileSync(ov_config.jwt_pub_key, "utf8");
  } else {
    console.log("JWT_PUB_KEY not defined, attempting to fetch from "+ov_config.sm_oauth_url+'/pubkey');
    fetch(ov_config.sm_oauth_url+'/pubkey')
    .then(res => {
      jwt_iss = res.headers.get('x-jwt-iss');
      if (res.status !== 200) throw "http code "+res.status;
      return res.text()
    })
    .then(body => {
      public_key = body;
    })
    .catch((e) => {
      console.log("Unable to read SM_OAUTH_URL "+ov_config.sm_oauth_url);
      console.log(e);
      process.exit(1);
    });
  }

  // require ip_header if config for it is set
  if (!ov_config.DEBUG && ov_config.ip_header) {
    app.use(function (req, res, next) {
      if (!req.header(ov_config.ip_header)) {
        console.log('Connection without '+ov_config.ip_header+' header');
       return _400(res, "Missing required header.");
      }
      else next();
    });
  }

  // add req.user if there's a valid JWT
  app.use(async function (req, res, next) {

    if (req.method == 'OPTIONS') return next(); // skip OPTIONS requests

    req.user = {};
    req.db = db;
    req.qq = qq;
    req.neode = neode;
    req.logger = logger;
    req.publicIP = ip();
    req.models = require('./models/va');

    req.isLocal = req.connection.remoteAddress === req.connection.localAddress;

    res.set('x-sm-oauth-url', ov_config.sm_oauth_url);

    if (!public_key && !ov_config.no_auth) {
      return _503(res, "Server is starting up.");
    }

    // Endpoints that don't require authentication

    if (req.url === '/') return next();
    if (req.url === '/poke') return next();
    if (req.url.match(/^\/links\//)) return next();
    if (req.url.match(/^\/HelloVoterHQ.*mobile\//)) return next();
    if (req.url.match(/^\/HelloVoterHQ.*public\//)) return next();
    if (req.url.match(/^\/.*public\//)) return next();
    //if (req.url.match(/^\/.*va\//)) return next();
    if (req.url.match(/\/\.\.\//)) return _400(res, "Not OK..");

    // Check for authentication
    const userPromise = authenticateUser(req, res);
    if (userPromise) {
      const user = await userPromise;
      if (isLocked(user)) {
        return _403(res, "Your account is locked.");
      }

      if (user) {
        req.user = user;
        req.authenticated = true;
        req.admin = user.get('admin');
      }

      next();
    }
  });

  // short link redirector
  app.get('/links/:code', (req, res) =>
    getVotingPlan(req.params.code).then(
      (plan) => {
        if (plan) {
          const voter = plan.get('voter');
          const canvasser = plan.get('canvasser');
          if (voter || canvasser) {
            res.redirect(prepareBallotReadyUrl(voter, canvasser));
          } else {
            _500(res, 'Voting plan has no voter and no canvasser.');
          }
        } else {
          _404(res, 'Link code not found.');
        }
      }
    )
  );

  // healtcheck
  app.get('/poke', (req, res) => {
    return cqdo(req, res, 'return timestamp()', false)
  });

  app.get('/HelloVoterHQ/mobile/invite', invite);
  app.get('/HelloVoterHQ/[0-9A-Z]+/mobile/invite', invite);

  app.use('/HelloVoterHQ/api/v1', router);
  app.use('/HelloVoterHQ/[0-9A-Z]+/api/v1', router);

  app.use('/api/v1/va', router);
  app.use('/api/v1/public/va', router);

  // default error handler
  app.use((err, req, res, next) => {
    return _500(res, err);
  });

  return app;
}

function invite(req, res) {
 let url = 'https://ourvoiceusa.org/hellovoter/';
 if (mobile({ua:req.get('User-Agent')})) url = 'OurVoiceApp://invite?inviteCode='+req.query.inviteCode+'&'+(req.query.orgId?'orgId='+req.query.orgId:'server='+req.query.server);
 res.redirect(url);
}

// Returns a promise for the Ambassador node for the authenticated user.
function authenticateUser(req, res) {
  try {

    if (ov_config.stress_testing && req.query.testingExternalId) {
      // In stress testing mode, allow the client to choose any external ID.
      req.externalId = 'testing:' + req.query.testingExternalId;
    } else {
      if (!req.header('authorization')) {
        _400(res, "Missing required header.");
        return null;
      }
      let token = req.header('authorization').split(' ')[1];
      if (ov_config.no_auth) {
        req.externalId = jwt.decode(token).id;
      } else {
        req.externalId = jwt.verify(token, public_key).id;
      }
    }

    /*
    // verify props
    if (!u.id) return _401(res, "Your token is missing a required parameter.");
    if (u.iss !== jwt_iss) return _401(res, "Your token was issued for a different domain.");
    if (u.aud && (
      (ov_config.jwt_aud && u.aud !== ov_config.jwt_aud) ||
      (!ov_config.jwt_aud && u.aud !== req.header('host'))
    )) return _401(res, "Your token has an incorrect audience.");
    */

    /*
      Are you developing locally and having trouble linking your account to your test database?
      Find a Ambassador you'd like to authenticate as and set the node's externalID parameter to 
      the req.externalId produced here.
    */
  } catch (e) {
    _401(res, "Invalid token: " + e);
    return null;
  }

  return ambassadorSvc.findByExternalId(req.externalId);
}
