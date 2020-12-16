import { Router } from 'express';

import {
  _401
} from '../../../../lib/utils';

import { serializeAmbassador, serializeTripler, serializePayout } from './serializers.js';
import { ov_config } from '../../../../lib/ov_config';
import { exportAmbassadorsJSON, exportTriplersJSON, exportAmbassadorsCSV, exportTriplersCSV } from '../../../../services/export';

module.exports = Router({mergeParams: true})
/*
 *
 * These routes just call the associated service functions in /services/export
 *
 */
.get('/json-export/ambassadors', async (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.')

  let json = await exportAmbassadorsJSON(req.neode);

  return res.send(json)
})
.get('/json-export/triplers', async (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.')

  let json = await exportTriplersJSON(req.neode);

  return res.send(json)
}).get('/csv-export/ambassadors', async (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.')

  let csv = await exportAmbassadorsCSV(req.neode);

  return res.send(csv)
})
.get('/csv-export/triplers', async (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.')

  let csv = await exportTriplersCSV(req.neode);

  return res.send(csv)
})
