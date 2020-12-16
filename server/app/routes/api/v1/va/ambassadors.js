import {Router} from "express"
import format from "string-format"
import {v4 as uuidv4} from "uuid"

import {getValidCoordinates, normalizePhone} from "../../../../lib/normalizers"
import {ValidationError} from "../../../../lib/errors"
import ambassadorsSvc from "../../../../services/ambassadors"
import {error} from "../../../../services/errors"
import {createVotingPlan, getVotingPlanUrl} from "../../../../services/voting_plans"

import {_204, _400, _401, _403, _404} from "../../../../lib/utils"

import {
  validateEmpty,
  validateCarrier,
  verifyCallerIdAndReversePhone,
  assertUserPhoneAndEmail,
} from "../../../../lib/validations"

import mail from "../../../../lib/mail"

import {
  serializeAmbassador,
  serializeAmbassadorForAdmin,
  serializeTripler,
  serializePayout,
  serializeName,
} from "./serializers"
import sms from "../../../../lib/sms"
import {ov_config} from "../../../../lib/ov_config"
import caller_id from "../../../../lib/caller_id"
import reverse_phone from "../../../../lib/reverse_phone"
import {makeAdminEmail} from "../../../../emails/makeAdminEmail"
import {getUserJsonFromRequest} from "../../../../lib/normalizers"

/*
 *
 * createAmbassador(req, res)
 *
 * This function is called by an admin for testing purposes only. This function is out of date.
 *
 */
async function createAmbassador(req, res) {
  let new_ambassador = null
  try {
    if (!validateEmpty(req.body, ["first_name", "phone", "address"])) {
      return error(400, res, "Invalid payload, ambassador cannot be created")
    }

    let coordinates, address
    try {
      await assertUserPhoneAndEmail("Ambassador", req.body.phone, req.body.email)
      ;[coordinates, address] = await getValidCoordinates(req.body.address)
    } catch (err) {
      return error(400, res, err.message, req.body)
    }

    new_ambassador = await req.neode.create("Ambassador", {
      id: uuidv4(),
      first_name: req.body.first_name,
      last_name: req.body.last_name || null,
      phone: normalizePhone(req.body.phone),
      email: req.body.email || null,
      address: JSON.stringify(address, null, 2),
      quiz_results: JSON.stringify(req.body.quiz_results, null, 2) || null,
      approved: false,
      // TODO: Remove "locked" from the model once we have fraud score components.
      locked: false,
      signup_completed: false,
      onboarding_completed: false,
      location: {
        latitude: parseFloat(coordinates.latitude),
        longitude: parseFloat(coordinates.longitude),
      },
    })
  } catch (err) {
    req.logger.error("Unhandled error in %s: %s", req.url, err)
    return error(500, res, "Unable to create ambassador")
  }
  return res.json(serializeAmbassador(new_ambassador))
}

/*
 *
 * countAmbassadors(req, res)
 *
 * This function was used by QA for testing purposes. It is out of date.
 *
 */
async function countAmbassadors(req, res) {
  let count = await req.neode.query().match("a", "Ambassador").return("count(a) as count").execute()

  return res.json({count: count.records[0]._fields[0].low})
}

/*
 *
 * fetchAmbassadors(req, res)
 *
 * This function was used by QA for testing purposes. It is out of date.
 *
 */
async function fetchAmbassadors(req, res) {
  let models = await ambassadorsSvc.searchAmbassadors(req)
  return res.json(models)
}

/*
 *
 * fetchAmbassador(req, res)
 *
 * This function was used by QA for testing purposes. It is out of date.
 *
 */
async function fetchAmbassador(req, res) {
  let ambassador = await req.neode.first("Ambassador", "id", req.params.ambassadorId)
  if (ambassador) {
    return res.json(serializeAmbassadorForAdmin(ambassador))
  } else {
    return _404(res, "Ambassador not found")
  }
}

/*
 *
 * fetchCurrentAmbassador(req, res)
 *
 * This function is called by the frontend for authentication purposes. The
 *   Ambassador data associated with the current account is returned as JSON
 *
 */
async function fetchCurrentAmbassador(req, res) {
  if (!req.user.get) return _404(res, "No current ambassador")
  return res.json(serializeAmbassador(req.user))
}

/*
 *
 * approveAmbassdaor(req, res)
 *
 * This function sets an Ambassador's "approved" flag to true.
 * When this function is called, an approval SMS is sent to the Ambassador.
 *
 */
async function approveAmbassador(req, res) {
  let found = await req.neode.first("Ambassador", "id", req.params.ambassadorId)

  if (!found) {
    return error(404, res, "Ambassador not found")
  }
  // per discussion - pressing "approve" in admin ONLY changes approve
  let json = {...{approved: true}}
  let updated = await found.update(json)

  try {
    await sms(
      found.get("phone"),
      format(ov_config.ambassador_approved_message, {
        ambassador_first_name: found.get("first_name"),
        ambassador_last_name: found.get("last_name") || "",
        ambassador_city: JSON.parse(found.get("address")).city,
        organization_name: ov_config.organization_name,
        ambassador_landing_page: ov_config.ambassador_landing_page,
      }),
    )
  } catch (err) {
    req.logger.error("Unhandled error in %s: %s", req.url, err)
    return error(500, res, "Error sending approved sms to the ambassador")
  }

  return _204(res)
}

/*
 *
 * updateW9Ambassador(req, res)
 *
 *
 */
async function updateW9Ambassador(req, res) {
  let found = await req.neode.first("Ambassador", "id", req.params.ambassadorId)

  if (!found) {
    return error(404, res, "Ambassador not found")
  }

  req.neode.cypher("MATCH (a:Ambassador {id: $id}) SET a.has_w9=toBoolean($has_w9)", {
    id: req.params.ambassadorId,
    has_w9: req.params.has_w9,
  })

  return _204(res)
}

/*
 * updateTriplerLimit(req, res)
 *
 * Update the maximum number of triplers an individual ambassador can claim.
 *
 */
async function updateTriplerLimit(req, res) {
  let found = await req.neode.first("Ambassador", "id", req.params.ambassadorId)

  if (!found) {
    return error(404, res, "Ambassador not found")
  }

  let newLimit = req.params.claim_tripler_limit
  if (newLimit === null || newLimit === undefined) {
    newLimit = "null"
  }

  req.neode.cypher(
    "MATCH (a:Ambassador {id: $id}) SET a.claim_tripler_limit=toInteger($claim_tripler_limit)",
    {
      id: req.params.ambassadorId,
      claim_tripler_limit: newLimit,
    },
  )

  return _204(res)
}

/*
 *
 * updateAmbassadorAdminBonus(req, res)
 * It gets its own function as some legacy ambassadors might not have this field, so we have to set it
 *
 */
async function updateAmbassadorAdminBonus(req, res) {
  let found = await req.neode.first("Ambassador", "id", req.params.ambassadorId)

  if (!found) {
    return error(404, res, "Ambassador not found")
  }

  req.neode.cypher("MATCH (a:Ambassador {id: $id}) SET a.admin_bonus=toInteger($admin_bonus)", {
    id: req.params.ambassadorId,
    admin_bonus: req.params.admin_bonus,
  })

  return _204(res)
}

/*
 *
 * updatePayPalApprovedAmbassdaor(req, res)
 *
 *
 */
async function updatePayPalApprovedAmbassador(req, res) {
  let found = await req.neode.first("Ambassador", "id", req.params.ambassadorId)

  if (!found) {
    return error(404, res, "Ambassador not found")
  }

  req.neode.cypher(
    "MATCH (a:Ambassador {id: $id}) SET a.paypal_approved=toBoolean($paypal_approved)",
    {id: req.params.ambassadorId, paypal_approved: req.params.paypal_approved},
  )
  return _204(res)
}
/*
 *
 * disapproveAmbassador(req, res)
 *
 * This function sets an Ambassador's "approved" flag to false.
 */
async function disapproveAmbassador(req, res) {
  let found = await req.neode.first("Ambassador", "id", req.params.ambassadorId)

  if (!found) {
    return error(404, res, "Ambassador not found")
  }
  //disapprove ONLY dissaproves. Before it would also lock.
  let json = {...{approved: false}}
  let updated = await found.update(json)
  return _204(res)
}

/*
 *
 * makeAdmin(req, res)
 *
 * This function makes an admin out of an Ambassador. Ambassadors are listed in the admin panel,
 *   and can be made an admin there.
 *
 * When this function is called, an admin email is sent, notifying them of this occurrance.
 *
 */
async function makeAdmin(req, res) {
  let found = await req.neode.first("Ambassador", "id", req.params.ambassadorId)

  if (!found) {
    return error(404, res, "Ambassador not found")
  }

  let json = {...{admin: true}}
  await found.update(json)

  // send email in the background
  setTimeout(async () => {
    let address = JSON.parse(found.get("address"))
    let body = makeAdminEmail(found, address)
    let subject = `New Admin for ${ov_config.organization_name}`
    await mail(ov_config.admin_emails, null, null, subject, body)
  }, 100)

  return _204(res)
}

/*
 *
 * signup(req, res)
 *
 * This is the main signup endpoint for Ambassadors. Any Ambassador signing up with a phone number
 *   that is from a blocked carrier will not be able to sign up.
 *
 * An external API call is made to determine caller ID information.
 *
 * This, and the carrier lookup, and the request body are passed to the Ambassador Service function signup()
 *
 * On signup, the Ambassador will receive an SMS
 *
 */
async function signup(req, res) {
  req.body.externalId = req.externalId
  let new_ambassador = null

  const carrierLookup = await validateCarrier(req.body.phone)
  const {
    carrier: {name: carrierName, isBlocked},
  } = carrierLookup
  if (isBlocked) {
    return error(
      400,
      res,
      `We're sorry, due to fraud concerns '${carrierName}' phone numbers are not permitted. Please try again.`,
      {request: req.body},
    )
  }

  const verifications = await verifyCallerIdAndReversePhone(req.body.phone)

  try {
    new_ambassador = await ambassadorsSvc.signup(req.body, verifications, carrierLookup)
  } catch (err) {
    if (err instanceof ValidationError) {
      return error(400, res, err.message, req.body)
    } else {
      req.logger.error("Unhandled error in %s: %s", req.url, err)
      return error(500, res, "Unable to update ambassador form data", {
        ambassador: req.body,
        verification: verifications,
      })
    }
  }

  if (new_ambassador.get('approved')) {
    const plan = await createVotingPlan(new_ambassador);
    try {
      await sms(
        new_ambassador.get("phone"),
        format(ov_config.ambassador_signup_message, {
          ambassador_first_name: new_ambassador.get("first_name"),
          ambassador_last_name: new_ambassador.get("last_name") || "",
          ambassador_city: JSON.parse(new_ambassador.get("address")).city,
          organization_name: ov_config.organization_name,
          ambassador_landing_page: ov_config.ambassador_landing_page,
        }),
      )
    } catch (err) {
      req.logger.error("Unhandled error in %s: %s", req.url, err)
      req.logger.error("Error sending signup sms to the ambassador")
    }

    // TODO(ping): This message should be sent 24 hours after signup, not immediately.
    if (ov_config.voting_plan_sms_for_ambassador) {
      try {
        await sms(
          new_ambassador.get("phone"),
          format(ov_config.voting_plan_sms_for_ambassador, {
            ambassador_first_name: new_ambassador.get("first_name"),
            ambassador_last_name: new_ambassador.get("last_name") || "",
            ambassador_city: JSON.parse(new_ambassador.get("address")).city,
            organization_name: ov_config.organization_name,
            ambassador_landing_page: ov_config.ambassador_landing_page,
            ambassador_voting_plan_link: getVotingPlanUrl(plan)
          }),
        )
      } catch (err) {
        req.logger.error("Unhandled error in %s: %s", req.url, err)
        req.logger.error("Error sending voting plan sms to the ambassador")
      }
    }
  } else {
    req.logger.warn("Ambassador not approved; not sending intro SMS")
  }

  return res.json(serializeAmbassador(new_ambassador))
}

/*
 *
 * updateAmbassador(req, res)
 *
 * This function is used to update the Ambassador
 *
 */

async function updateAmbassador(req, res) {
  let found = await req.neode.first("Ambassador", "id", req.params.ambassadorId)
  if (!found) {
    return error(404, res, "Ambassador not found")
  }

  try {
    await assertUserPhoneAndEmail("Ambassador", req.body.phone, req.body.email, found.get("id"))
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
  return res.json(serializeAmbassador(updated))
}

/*
 *
 * updateCurrentAmbassador(req, res)
 *
 * This function was intended to provide Ambassadors with a method of altering their profile information.
 * This updated information is sent to HubSpot.
 *
 */
async function updateCurrentAmbassador(req, res) {
  let found = req.user

  // Disabled form fields don't get sent from the frontend, so default it if missing.
  if (!req.body.phone) {
    req.body.phone = req.user.get("phone")
  } else if (req.user.get("phone") !== normalizePhone(req.body.phone)) {
    return error(
      400,
      res,
      "You're not allowed to change your phone number. Email support@blockpower.vote for help. (E8)",
      req.body,
    )
  }

  try {
    await assertUserPhoneAndEmail("Ambassador", req.body.phone, req.body.email, found.get("id"))
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

  //if ambassador doesn't currently have a hubspotID, this will set it
  if (!req.user.get("hs_id")) {
    await ambassadorsSvc.initialSyncAmbassadorToHubSpot(updated)
  }

  await ambassadorsSvc.syncAmbassadorToHubSpot(updated)

  return res.json(serializeAmbassador(updated))
}

async function deleteAmbassador(req, res) {
  let found = await req.neode.first("Ambassador", "id", req.params.ambassadorId)
  if (!found) {
    return error(404, res, "Ambassador not found")
  }

  if (req.user.get("id") === req.params.ambassadorId) {
    return error(400, res, "Cannot delete self")
  }

  found.delete()

  return _204(res)
}

/*
 *
 * claimTriplers(req, res)
 *
 * This cypher query finds how many Triplers this Ambassador already has claimed, limits the claim list to just
 *   the Triplers that can be claimed and still remain under the CLAIM_TRIPLER_LIMIT env var (or the claim_tripler_limit
 *   property of the ambassador, if it is set), then claims them.
 *
 * If the Ambassador has a Hubspot ID (hs_id), the Ambassador's tripler numbers are updated in HubSpot.
 */
async function claimTriplers(req, res) {
  if (!req.body.triplers || req.body.triplers.length === 0) {
    return error(400, res, "Invalid request, empty list of triplers")
  }

  let query = `
  match(a:Ambassador{id: "${req.user.get("id")}"})
  with a
  optional match(a)-[:CLAIMS]->(ct:Tripler)
  with a, count(distinct ct) as already_claimed_count
  match(t:Tripler)
  where t.id in [${req.body.triplers.map((t) => '"' + t + '"')}]
  with already_claimed_count, a, t, coalesce(a.claim_tripler_limit, ${
    ov_config.claim_tripler_limit
  }) - already_claimed_count as limit_claim
  optional match (t)<-[r:CLAIMS]-(:Ambassador)
  with limit_claim, a, collect(t.id)[0..limit_claim] as unclaimed_id, type(r) as rel
  where rel is null
  match(a), (t:Tripler)
  where t.id in unclaimed_id
  merge(a)-[r:CLAIMS]->(t)
  on create set r.since = datetime()
  return t.id
  `

  await req.neode.cypher(query)
  await ambassadorsSvc.sendTriplerCountsToHubspot(req.user)

  return _204(res)
}

/*
 *
 * unclaimTriplers(req, res)
 *
 * Just calls the unclaimTriplers service function, which removes the [:CLAIMS] relationship for the given list of Triplers
 */
async function unclaimTriplers(req, res) {
  if (!req.body.triplers || req.body.triplers.length === 0) {
    return error(400, res, "Invalid request, empty list of triplers")
  }

  await ambassadorsSvc.unclaimTriplers(req)

  return _204(res)
}

/*
 *
 * completeOnboarding(req, res)
 *
 * This function is obsolete. It was used when Ambassadors were vetted, and admins needed to approve Ambassadors.
 *
 */
async function completeOnboarding(req, res) {
  let found = req.user
  if (!found.get("signup_completed")) {
    return error(400, res, "Signup not completed for user yet")
  }

  let updated = await found.update({
    onboarding_completed: true,
    quiz_results: req.body.quiz_results
      ? JSON.stringify(req.body.quiz_results, null, 2)
      : req.body
      ? JSON.stringify(req.body, null, 2)
      : null,
  })
  return res.json(serializeAmbassador(updated))
}

/*
 *
 * ambassadorPayouts(ambassador, neode)
 *
 * This function really belongs in the ambassadorsSvc service module. For all Payouts connected to this Ambassador,
 *   get the serialized neode Payout object with associated Tripler name for the frontend screen.
 *
 */
async function ambassadorPayouts(ambassador, neode) {
  let payouts = []

  if (!ambassador.get("gets_paid") || ambassador.get("gets_paid").length === 0) return payouts

  await Promise.all(
    ambassador.get("gets_paid").map(async (entry) => {
      let payout = entry.otherNode()
      let obj = serializePayout(payout)
      let tripler = await neode.first("Tripler", "id", entry.get("tripler_id"))
      if (tripler.get) {
        obj.tripler_name = serializeName(tripler.get("first_name"), tripler.get("last_name"))
      } else {
        obj.tripler_name = "Tripler not found"
      }
      payouts.push(obj)
    }),
  )

  return payouts
}

/*
 *
 * fetchCurrentAmbassadorPayouts(req, res)
 *
 * Just calls the ambassadorPayouts service, which is just above, but really should be in the ambassadorsSvc module.
 *
 */
async function fetchCurrentAmbassadorPayouts(req, res) {
  return res.json(await ambassadorPayouts(req.user, req.neode))
}

/*
 *
 * fetchAmbassadorPayouts(req, res)
 *
 * This function is intended for admins to see Payouts for a particular Ambassador. Also used for QA purposes.
 *
 * Calls the same ambassadorPayouts service function as above.
 *
 */
async function fetchAmbassadorPayouts(req, res) {
  let ambassador = await req.neode.first("Ambassador", "id", req.params.ambassadorId)
  if (ambassador) {
    return res.json(await ambassadorPayouts(ambassador, req.neode))
  } else {
    return error(404, res, "Ambassador not found")
  }
}

/*
 *
 * claimedTriplers(req, res)
 *
 * For the current Ambassador, find all Triplers with the [:CLAIMS] relationship between them and this Ambassador,
 *   serialize those Triplers, and return as JSON.
 *
 */
function claimedTriplers(req, res) {
  let ambassador = req.user

  let triplers = {}
  ambassador
    .get("claims")
    .forEach(
      (entry) => (triplers[entry.otherNode().get("id")] = serializeTripler(entry.otherNode())),
    )

  return res.json(Object.values(triplers))
}

/*
 *
 * checkAmbassdaor(req, res)
 *
 * Admin / QA function just to determine existence of an Ambassador
 *
 */
function checkAmbassador(req, res) {
  return res.json({exists: !!req.user.get})
}

/*
 *
 * callerInfo(req, res)
 *
 * Admin / QA function to manually call the callerID and reverse phone lookups from Twilio and Ekata
 *
 */
async function callerInfo(req, res) {
  let ambassador = await req.neode.first("Ambassador", "id", req.params.ambassadorId)
  let callerId = await caller_id(ambassador.get("phone"))
  let reversePhone = await reverse_phone(ambassador.get("phone"))
  return res.json({twilio: callerId, ekata: reversePhone})
}

module.exports = Router({mergeParams: true})
  .post("/ambassadors/signup", (req, res) => {
    return signup(req, res)
  })
  .get("/ambassadors/current", (req, res) => {
    if (Object.keys(req.user).length === 0 && req.user.constructor === Object) {
      return fetchCurrentAmbassador(req, res)
    }
    if (!req.authenticated) return _401(res, "Permission denied.")
    return fetchCurrentAmbassador(req, res)
  })
  .put("/ambassadors/current", (req, res) => {
    if (!req.authenticated) return _401(res, "Permission denied.")
    return updateCurrentAmbassador(req, res)
  })
  .put("/ambassadors/current/triplers", (req, res) => {
    if (!req.authenticated) return _401(res, "Permission denied.")
    return claimTriplers(req, res)
  })
  .delete("/ambassadors/current/triplers", (req, res) => {
    if (!req.authenticated) return _401(res, "Permission denied.")
    return unclaimTriplers(req, res)
  })
  .get("/ambassadors/current/triplers", (req, res) => {
    if (!req.authenticated) return _401(res, "Permission denied.")
    return claimedTriplers(req, res)
  })
  .get("/ambassadors/exists", (req, res) => {
    return checkAmbassador(req, res)
  })
  .put("/ambassadors/current/complete-onboarding", (req, res) => {
    if (!req.authenticated) return _401(res, "Permission denied.")
    return completeOnboarding(req, res)
  })
  .get("/ambassadors/current/payouts", (req, res) => {
    if (!req.authenticated) return _401(res, "Permission denied.")
    return fetchCurrentAmbassadorPayouts(req, res)
  })

  .post("/ambassadors", (req, res) => {
    if (!req.authenticated) return _401(res, "Permission denied.")
    if (!req.admin) return _403(res, "Permission denied.")
    return createAmbassador(req, res)
  })
  .get("/ambassadors", (req, res) => {
    if (!req.authenticated) return _401(res, "Permission denied.")
    if (!req.admin) return _403(res, "Permission denied.")
    return fetchAmbassadors(req, res)
  })
  .get("/ambassadors/count", (req, res) => {
    if (!req.authenticated) return _401(res, "Permission denied.")
    if (!req.admin) return _403(res, "Permission denied.")
    return countAmbassadors(req, res)
  })
  .get("/ambassadors/:ambassadorId", (req, res) => {
    if (!req.authenticated) return _401(res, "Permission denied.")
    if (!req.admin) return _403(res, "Permission denied.")
    return fetchAmbassador(req, res)
  })
  .put("/ambassadors/:ambassadorId/approve", (req, res) => {
    if (!req.authenticated) return _401(res, "Permission denied.")
    if (!req.admin) return _403(res, "Permission denied.")
    return approveAmbassador(req, res)
  })
  .put("/ambassadors/:ambassadorId/has_w9/:has_w9", (req, res) => {
    if (!req.authenticated) return _401(res, "Permission denied.")
    if (!req.admin) return _403(res, "Permission denied.")
    return updateW9Ambassador(req, res)
  })
  .put("/ambassadors/:ambassadorId/admin_bonus/:admin_bonus", (req, res) => {
    if (!req.authenticated) return _401(res, "Permission denied.")
    if (!req.admin) return _403(res, "Permission denied.")
    return updateAmbassadorAdminBonus(req, res)
  })
  .put("/ambassadors/:ambassadorId/claim_tripler_limit/:claim_tripler_limit?", (req, res) => {
    if (!req.authenticated) return _401(res, "Permission denied.")
    if (!req.admin) return _403(res, "Permission denied.")
    return updateTriplerLimit(req, res)
  })
  .put("/ambassadors/:ambassadorId/paypal_approved/:paypal_approved", (req, res) => {
    if (!req.authenticated) return _401(res, "Permission denied.")
    if (!req.admin) return _403(res, "Permission denied.")
    return updatePayPalApprovedAmbassador(req, res)
  })
  .put("/ambassadors/:ambassadorId/disapprove", (req, res) => {
    if (!req.authenticated) return _401(res, "Permission denied.")
    if (!req.admin) return _403(res, "Permission denied.")
    return disapproveAmbassador(req, res)
  })
  .put("/ambassadors/:ambassadorId/admin", (req, res) => {
    if (ov_config.DEBUG) return makeAdmin(req, res)
    if (!req.authenticated) return _401(res, "Permission denied.")
    if (!req.admin) return _403(res, "Permission denied.")
    if (!ov_config.make_admin_api) return _403(res, "Permission denied.")
    return makeAdmin(req, res)
  })
  .put("/ambassadors/:ambassadorId", (req, res) => {
    if (!req.authenticated) return _401(res, "Permission denied.")
    if (!req.admin) return _403(res, "Permission denied.")
    return updateAmbassador(req, res)
  })
  .delete("/ambassadors/:ambassadorId", (req, res) => {
    if (!req.authenticated) return _401(res, "Permission denied.")
    if (!req.admin) return _403(res, "Permission denied.")
    return deleteAmbassador(req, res)
  })
  .get("/ambassadors/:ambassadorId/payouts", (req, res) => {
    if (!req.authenticated) return _401(res, "Permission denied.")
    if (!req.admin) return _403(res, "Permission denied.")
    return fetchAmbassadorPayouts(req, res)
  })
  .get("/ambassadors/:ambassadorId/caller-info", (req, res) => {
    if (!req.authenticated) return _401(res, "Permission denied.")
    if (!req.admin) return _403(res, "Permission denied.")
    return callerInfo(req, res)
  })
