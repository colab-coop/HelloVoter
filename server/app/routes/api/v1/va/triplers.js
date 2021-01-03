import {Router} from "express"
import stringFormat from "string-format"
import {v4 as uuidv4} from "uuid"

import {getValidCoordinates, normalizePhone} from "../../../../lib/normalizers"
import {ov_config} from "../../../../lib/ov_config"
import triplersSvc from "../../../../services/triplers"
import {error} from "../../../../services/errors"

import {_204, _401, _403, geoCode} from "../../../../lib/utils"

import {
  validateEmpty,
  validatePhone,
  validateUniquePhone,
  verifyCallerIdAndReversePhone,
  validateCarrier,
  assertUserPhoneAndEmail,
} from "../../../../lib/validations"

import {
  serializeAmbassador,
  serializeTripler,
  serializeNeo4JTripler,
  serializeTriplee,
} from "./serializers"

import sms from "../../../../lib/sms"
import neode from "../../../../lib/neode"
import {getUserJsonFromRequest} from "../../../../lib/normalizers"

/*
 *
 * createTripler(req, res)
 *
 * This function is an admin function that manually creates a new Tripler in the system. It is somewhat out of date, as Triplers
 *   now have additional fields that this function does not take into account, such as msa, gender, date_of_birth, etc...
 *
 */
async function createTripler(req, res) {
  let new_tripler = null
  try {
    if (!validateEmpty(req.body, ["first_name", "phone", "address"])) {
      return error(400, res, "Invalid payload, tripler cannot be created")
    }

    let coordinates, address
    try {
      await assertUserPhoneAndEmail("Tripler", req.body.phone, req.body.email)
      ;[coordinates, address] = await getValidCoordinates(req.body.address)
    } catch (err) {
      return error(400, res, err.message, req.body)
    }

    const obj = {
      id: uuidv4(),
      first_name: req.body.first_name,
      last_name: req.body.last_name || null,
      phone: normalizePhone(req.body.phone),
      email: req.body.email || null,
      address: JSON.stringify(address, null, 2),
      triplees: !req.body.triplees ? null : JSON.stringify(req.body.triplees, null, 2),
      location: {
        latitude: parseFloat(coordinates.latitude),
        longitude: parseFloat(coordinates.longitude),
      },
      status: "unconfirmed",
    }

    new_tripler = await req.neode.create("Tripler", obj)
  } catch (err) {
    req.logger.error("Unhandled error in %s: %s", req.url, err)
    return error(500, res, "Unable to create tripler")
  }
  return res.json(serializeTripler(new_tripler))
}

/*
 *
 * searchTriplersAmbassador(req, res)
 *
 * This function simply returns the result of the service function for searching Triplers.
 *
 */
async function searchTriplersAmbassador(req, res) {
  let models = await triplersSvc.searchTriplersAmbassador(req)
  return res.json(models)
}

/*
 *
 * fetchTripler(req, res)
 *
 * This function returns a given tripler, serialized into JSON.
 *
 */
async function fetchTripler(req, res) {
  let ambassador = req.user
  let tripler = null
  ambassador.get("claims").forEach((entry) => {
    if (entry.otherNode().get("id") === req.params.triplerId) {
      tripler = entry.otherNode()
    }
  })

  if (!tripler) {
    return error(400, res, "Invalid tripler id, could not fetch tripler.", {
      ambassador: serializeAmbassador(ambassador),
      triplerId: req.params.triplerId,
    })
  }
  return res.json(serializeTripler(tripler))
}

/*
 *
 * updateTripler(req, res)
 *
 * This admin function updates attributes of a Tripler node.
 *
 */
async function updateTripler(req, res) {
  let found = await req.neode.first("Tripler", "id", req.params.triplerId)
  if (!found) {
    return error(404, res, "Tripler not found")
  }

  try {
    await assertUserPhoneAndEmail("Tripler", req.body.phone, req.body.email, found.get("id"))
  } catch (err) {
    return error(400, res, err.message, req.body)
  }

  let json
  try {
    json = await getUserJsonFromRequest(req.body)
  } catch (err) {
    return error(400, res, err.message)
  }
  let updated = await found.update(json)
  return res.json(serializeTripler(updated))
}

/*
 *
 * startTriplerConfirmation(req, res)
 *
 * This function finds the Tripler given by the Ambassador, verifies caller ID, carrier info, and phone uniqueness, then verifies number of triplees.
 * The function updates a Tripler's birthdate, then begins the confirmation process by calling the service function.
 * This will send the Tripler the SMS to confirm, and set the Tripler status to 'pending'
 *
 */
async function startTriplerConfirmation(req, res) {
  let ambassador = req.user
  let tripler = null
  ambassador.get("claims").forEach((entry) => {
    if (entry.otherNode().get("id") === req.params.triplerId) {
      tripler = entry.otherNode()
    }
  })

  if (!tripler) {
    return error(400, res, "Invalid tripler id, could not start tripler confirmation.", {
      ambassador: serializeAmbassador(ambassador),
      triplerId: req.params.triplerId,
    })
  }

  let triplerPhone = req.body.phone ? normalizePhone(req.body.phone) : tripler.get("phone")

  const verifications = await verifyCallerIdAndReversePhone(triplerPhone)

  if (tripler.get("status") !== "unconfirmed") {
    return error(400, res, "Invalid status, cannot proceed to begin tripler confirmation.", {
      ambassador: serializeAmbassador(ambassador),
      tripler: serializeTripler(tripler),
      verification: verifications,
    })
  }

  if (triplerPhone) {
    if (!validatePhone(triplerPhone)) {
      return error(
        400,
        res,
        "Our records suggest that this number may not be the vote tripler's phone number. Please email support@blockpower.vote for help. E4",
      )
    }

    if (!(await validateUniquePhone("Tripler", triplerPhone, tripler.get("id")))) {
      return error(
        400,
        res,
        "Our records suggest that this number may not be the vote tripler's phone number. Please email support@blockpower.vote for help. E3",
        {
          ambassador: serializeAmbassador(ambassador),
          tripler: serializeTripler(tripler),
          verification: verifications,
        },
      )
    }
  }

  if (triplerPhone === ambassador.get("phone")) {
    return error(
      400,
      res,
      "Our records suggest that this number may not be the vote tripler's phone number. Please email support@blockpower.vote for help. E2",
    )
  }

  const {
    carrier: {name: carrierName, isBlocked},
  } = await validateCarrier(triplerPhone)
  if (isBlocked) {
    await triplersSvc.updateTriplerBlockedCarrier(tripler, carrierName)
    return error(
      400,
      res,
      "Our records suggest that this number may not be the vote tripler's phone number. Please email support@blockpower.vote for help. E1",
      {ambassador: serializeAmbassador(ambassador), tripler: serializeTripler(tripler)},
    )
  } else {
    await triplersSvc.updateTriplerCarrier(tripler, carrierName)
  }

  let triplees = req.body.triplees
  if (!triplees || triplees.length !== 3) {
    return error(400, res, "Insufficient triplees, cannot start confirmation")
  }

  let month = +req.body.tripler_birth_month
  if (month) {
    await triplersSvc.updateClaimedBirthMonth(tripler, month)
  }

  try {
    await triplersSvc.startTriplerConfirmation(
      ambassador,
      tripler,
      triplerPhone,
      triplees,
      verifications,
    )
  } catch (err) {
    req.logger.error("Unhandled error in %s: %s", req.url, err)
    return error(500, res, "Error in startTriplerConfirmation")
  }

  return _204(res)
}

/*
 *
 * remindTripler(req, res)
 *
 * This function checks for phone validity then sends a reminder SMS to the Tripler.
 *
 * NOTE: Parts of this function probably belong in the /services/tripler module.
 *
 */
async function remindTripler(req, res) {
  let ambassador = req.user
  let tripler = null

  // TODO get ambassador directory from tripler, and then compare
  ambassador.get("claims").forEach((entry) => {
    if (entry.otherNode().get("id") === req.params.triplerId) {
      tripler = entry.otherNode()
    }
  })

  if (!tripler) {
    return error(400, res, "Invalid tripler id, could not remind tripler.", {
      ambassador: ambassador,
      triplerId: req.params.triplerId,
    })
  } else if (tripler.get("status") !== "pending") {
    return error(400, res, "Invalid status, cannot proceed to remind tripler.", {
      ambassador: ambassador,
      triplerId: req.params.triplerId,
    })
  }

  let new_phone = req.body.phone
  if (new_phone) {
    if (!validatePhone(req.body.phone)) {
      return error(
        400,
        res,
        "Our records suggest that this number may not be the vote tripler's phone number. Please email support@blockpower.vote for help. E4",
      )
    }

    await tripler.update({phone: new_phone})
  }

  let triplees = JSON.parse(tripler.get("triplees"))

  try {
    await sms(
      tripler.get("phone"),
      stringFormat(ov_config.tripler_reminder_message, {
        ambassador_first_name: ambassador.get("first_name"),
        ambassador_last_name: ambassador.get("last_name") || "",
        organization_name: ov_config.organization_name,
        tripler_first_name: tripler.get("first_name"),
        tripler_city: JSON.parse(tripler.get("address")).city,
        triplee_1: serializeTriplee(triplees[0]),
        triplee_2: serializeTriplee(triplees[1]),
        triplee_3: serializeTriplee(triplees[2]),
      }),
    )
  } catch (err) {
    req.logger.error("Unhandled error in %s: %s", req.url, err)
    return error(500, res, "Error sending reminder sms to the tripler")
  }

  return _204(res)
}

/*
 *
 * confirmTripler(req, res)
 *
 * This admin function manually confirms a tripler. In the normal course of functioning, when a Tripler confirms the SMS, Twilio will hit the '/sms/receive' API endpoint.
 * That will then execute the service confirmTripler function. This function calls it manually by an admin for QA / testing purposes.
 *
 */
async function confirmTripler(req, res) {
  let tripler = await triplersSvc.findById(req.params.triplerId)

  if (!tripler) {
    return error(404, res, "Invalid tripler")
  }

  if (tripler.get("status") !== "pending") {
    return error(400, res, "Invalid status, cannot confirm tripler.", serializeTripler(tripler))
  }

  try {
    await triplersSvc.confirmTripler(req.params.triplerId)
  } catch (err) {
    req.logger.error("Unhandled error in %s: %s", req.url, err)
    return error(500, res, "Error confirming a tripler")
  }
  return _204(res)
}

/*
 *
 * deleteTripler(req, res)
 *
 * This admin function simply deletes a Tripler
 *
 */
async function deleteTripler(req, res) {
  let tripler = await triplersSvc.findById(req.params.triplerId)

  if (!tripler) {
    return error(404, res, "Invalid tripler")
  }

  tripler.delete()
  return _204(res)
}

/*
 *
 * getTriplerLimit(req, res)
 *
 * This function is called by the frontend to determine this API instance's CLAIM_TRIPLER_LIMIT env var.
 *
 */
async function getTriplerLimit(req, res) {
  return res.json({limit: ov_config.claim_tripler_limit})
}

module.exports = Router({mergeParams: true})
  .post("/triplers", (req, res) => {
    if (!req.authenticated) return _401(res, "Permission denied.")
    if (!req.admin) return _403(res, "Permission denied.")
    return createTripler(req, res)
  })
  .put("/triplers/:triplerId", (req, res) => {
    if (!req.authenticated) return _401(res, "Permission denied.")
    if (!req.admin) return _403(res, "Permission denied.")
    return updateTripler(req, res)
  })
  .put("/triplers/:triplerId/confirm", (req, res) => {
    if (!req.authenticated) return _401(res, "Permission denied.")
    if (!req.admin) return _403(res, "Permission denied.")
    return confirmTripler(req, res)
  })
  .delete("/triplers/:triplerId", (req, res) => {
    if (!req.authenticated) return _401(res, "Permission denied.")
    if (!req.admin) return _403(res, "Permission denied.")
    return deleteTripler(req, res)
  })

  .get("/triplers", (req, res) => {
    if (!req.authenticated) return _401(res, "Permission denied.")
    return searchTriplersAmbassador(req, res)
  })
  .put("/triplers/:triplerId/start-confirm", (req, res) => {
    if (!req.authenticated) return _401(res, "Permission denied.")
    return startTriplerConfirmation(req, res)
  })
  .put("/triplers/:triplerId/remind", (req, res) => {
    if (!req.authenticated) return _401(res, "Permission denied.")
    return remindTripler(req, res)
  })
  .get("/triplers/:triplerId", (req, res) => {
    if (!req.authenticated) return _401(res, "Permission denied.")
    return fetchTripler(req, res)
  })
  .get("/triplers-limit", (req, res) => {
    if (!req.authenticated) return _401(res, "Permission denied.")
    return getTriplerLimit(req, res)
  })
  .post('/triplers/create_triplees', async (req, res) => {
    if (!req.authenticated) return _401(res, "Permission denied.")
    if (!req.admin) return _403(res, "Permission denied.")
    const results = await neode.cypher(
      'MATCH (t:Tripler {status: "confirmed"}) WHERE EXISTS(t.triplees) AND NOT (t)-[:CLAIMS]->() RETURN t.id as id LIMIT $limit',
      {limit: +req.body.count || 0}
    );
    const processed = [];
    for (let i = 0; i < results.records.length; i++) {
      const id = results.records[i].get('id');
      const tripler = await neode.first('Tripler', 'id', id);
      req.logger.warn(['id', id, 'tripler', tripler]);
      if (tripler) {
        await triplersSvc.createTripleeNodes(tripler);
        let email = tripler.get('email');
        if (!email) {
          email = tripler.get("alloy_person_id") + "@faux.blockpower.vote";
          tripler.update({email: email});
        }
        processed.push(email);
      }
    }
    return res.json(processed);
  })
