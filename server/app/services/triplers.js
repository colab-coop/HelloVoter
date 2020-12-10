import stringFormat from "string-format"

import neo4j from "neo4j-driver"
import neode from "../lib/neode"
import {serializeName} from "../lib/utils"
import {normalizeGender, normalizePhone} from "../lib/normalizers"
import mail from "../lib/mail"
import {ov_config} from "../lib/ov_config"
import sms from "../lib/sms"
import {
  serializeTripler,
  serializeNeo4JTripler,
  serializeTriplee,
} from "../routes/api/v1/va/serializers"
import {confirmTriplerEmail} from "../emails/confirmTriplerEmail"
import ambassadorsSvc from "./ambassadors"


/*
 *
 * findById(triplerId)
 *
 * Simply finds a neode Tripler object by its uuid
 *
 */
async function findById(triplerId) {
  return await neode.first("Tripler", "id", triplerId)
}

/*
 *
 * findByPhone(phone)
 *
 * Simply finds a neode Tripler object by its normalized phone number
 *
 */
async function findByPhone(phone) {
  return await neode.first("Tripler", "phone", normalizePhone(phone))
}

/*
 *
 * findRecentlyConfirmedTriplers()
 *
 * This function finds Triplers that are confirmed but not yet sent an SMS
 *   letting them know that they too can be a Voting Ambassador.
 *
 * Note, this function is used by the upgrade_sms cron job.
 * Any Tripler matching this case will be sent an SMS scheduled by the
 *   appropriate .env vars that configure it.
 *
 */
async function findRecentlyConfirmedTriplers() {
  let confirmed_triplers = await neode.model("Tripler").all({status: "confirmed"})
  let recently_confirmed = []
  for (var x = 0; x < confirmed_triplers.length; x++) {
    let tripler = confirmed_triplers.get(x)
    if (
      (tripler.get("confirmed_at") && !tripler.get("upgrade_sms_sent")) ||
      tripler.get("upgrade_sms_sent") === false
    ) {
      recently_confirmed.push(tripler)
    }
  }
  return recently_confirmed
}

/*
 *
 * confirmTripler(triplerId)
 *
 * This function is the main service function that handles the data updating required
 *   when a Tripler replies "yes" to the confirmation SMS.
 *
 * The Tripler must have a status of "pending" if it is to be confirmed. If so,
 *   the status is changed to "confirmed", and a Payout neo4j node is created and
 *   attached to the Ambassador that has claimed this Tripler.
 *
 * If the Ambassador that is given this Payout was themselves a Tripler at one point,
 *   then the "Parent Ambassador" that claimed the Ambassador back when they were
 *   still a Tripler gets paid an additional "upgrade bonus", only once, to reward
 *   them for claiming/confirming a Tripler that went on to become an Ambassador themselves.
 *
 * An SMS is sent to the Ambassador that claims this Tripler, and an admin email is sent,
 *   depending on .env var configuration.
 * 
 * If the Ambassador that claims the tripler has a Hubspot ID, the Tripler counts (pending, confirmed, unconfirmed)
 * will be updated once this function is triggered. If the Ambassador does not have a Hubspot ID, the sendTriplerCountsToHubspot
 * should do nothing. 
 *
 */
async function confirmTripler(triplerId) {
  let tripler = await neode.first("Tripler", "id", triplerId)
  let ambassador = tripler.get("claimed")

  if (tripler && tripler.get("status") === "pending") {
    let confirmed_at = neo4j.default.types.LocalDateTime.fromStandardDate(new Date())
    await tripler.update({status: "confirmed", confirmed_at: confirmed_at})
    let payout = await neode.create("Payout", {
      amount: ov_config.payout_per_tripler,
      status: "pending",
    })
    await ambassador.relateTo(payout, "gets_paid", {
      tripler_id: tripler.get("id"),
    })

    // If this ambassador was once a tripler, then reward the ambassador that
    // initially claimed the then-tripler, only once per upgraded ambassador
    let allowBonus = ov_config.first_reward_payout > 0
    let was_once = ambassador.get("was_once")
    if (allowBonus && was_once && !was_once.get("rewarded_previous_claimer")) {
      let was_tripler = was_once.otherNode()
      if (was_tripler.get("status") === "confirmed") {
        await was_once.update({rewarded_previous_claimer: true})

        // TODO: Should this really be dependent on the payout? It doesn't seem to be used anywhere.
        await was_tripler.update({is_ambassador_and_has_confirmed: true})

        was_tripler = await neode.first("Tripler", "id", was_tripler.get("id"))
        // This must be done because 'eager' only goes so deep
        let claimer = was_tripler.get("claimed")
        let first_reward = await neode.create("Payout", {
          amount: ov_config.first_reward_payout,
          status: "pending",
        })
        await claimer.relateTo(first_reward, "gets_paid", {
          tripler_id: was_tripler.get("id"),
        })
      }
    }
  } else {
    throw "Invalid status, cannot confirm"
  }

  // send ambassador an sms
  let triplees = JSON.parse(tripler.get("triplees"))
  try {
    await sms(
      ambassador.get("phone"),
      stringFormat(ov_config.tripler_confirmed_ambassador_notification, {
        ambassador_first_name: ambassador.get("first_name"),
        ambassador_landing_page: ov_config.ambassador_landing_page,
        payment_amount: "$" + ov_config.payout_per_tripler / 100,
        tripler_first_name: tripler.get("first_name"),
        triplee_1: serializeTriplee(triplees[0]),
        triplee_2: serializeTriplee(triplees[1]),
        triplee_3: serializeTriplee(triplees[2]),
      }),
    )
  } catch (err) {
    console.log("Could not send ambassador SMS on tripler confirmation: %s", err)
  }

  // send email in the background
  setTimeout(async () => {
    let ambassador_name = serializeName(ambassador.get("first_name"), ambassador.get("last_name"))
    let relationships = ambassador.get("claims")
    let date_claimed = null
    let relationship = null
    let confirmed_at = neo4j.default.types.LocalDateTime.fromStandardDate(new Date())
    for (let x = 0; x < relationships.length; x++) {
      let this_claim = relationships.get(x)
      let claimed_tripler = this_claim.otherNode()
      if (tripler.id === claimed_tripler.id) {
        relationship = relationships.get(x)
        date_claimed = relationship.get("since")
      }
    }
    let address = JSON.parse(tripler.get("address"))
    let body = confirmTriplerEmail(
      tripler,
      address,
      relationship,
      confirmed_at,
      ambassador_name,
      triplees,
    )
    let subject = stringFormat(ov_config.tripler_confirm_admin_email_subject, {
      organization_name: ov_config.organization_name,
    })
    await mail(ov_config.admin_emails, null, null, subject, body)
  }, 100)

  await ambassadorsSvc.sendTriplerCountsToHubspot(ambassador)
}

/*
 *
 * detachTripler(triplerId)
 *
 * This function is called (by routes/api/v1/public/va/twilio.js) when a Tripler
 *   replies "no" to the confirmation SMS.
 * It sends the Tripler a "goodbye" SMS, and it sends the Ambassador that claimed
 *   the Tripler a "rejection" SMS.
 * The function then removes the Tripler's neo4j node.
 *
 * Also updates the Ambassador's tripler counts in hubspot.
 */
async function detachTripler(triplerId) {
  let tripler = await neode.first("Tripler", "id", triplerId)
  if (tripler) {
    let ambassador = tripler.get("claimed")
    await ambassadorsSvc.sendTriplerCountsToHubspot(ambassador)

    if (ambassador) {
      await sms(tripler.get("phone"), ov_config.rejection_sms_for_tripler)
      await sms(
        ambassador.get("phone"),
        stringFormat(ov_config.rejection_sms_for_ambassador, {
          ambassador_first_name: ambassador.get("first_name"),
          tripler_first_name: tripler.get("first_name"),
          ambassador_landing_page: ov_config.ambassador_landing_page,
        }),
      )
      await tripler.delete()
    }
  } else {
    throw "Invalid tripler, cannot detach"
  }
}

/*
 *
 * reconfirmTripler(triplerId)
 *
 * This function is called (by routes/api/v1/public/va/twilio.js) when a Tripler responds
 *   to the confirmation SMS with something other than "yes" or "no"
 *
 */
async function reconfirmTripler(triplerId) {
  let tripler = await neode.first("Tripler", "id", triplerId)
  if (tripler) {
    if (tripler.get("status") !== "pending") {
      throw "Invalid status, cannot proceed"
    }

    let ambassador = tripler.get("claimed")

    let triplees = JSON.parse(tripler.get("triplees"))
    await sms(
      tripler.get("phone"),
      stringFormat(ov_config.tripler_reconfirmation_message, {
        ambassador_first_name: ambassador.get("first_name"),
        ambassador_last_name: ambassador.get("last_name") || "",
        organization_name: process.env.ORGANIZATION_NAME,
        tripler_first_name: tripler.get("first_name"),
        triplee_1: serializeTriplee(triplees[0]),
        triplee_2: serializeTriplee(triplees[1]),
        triplee_3: serializeTriplee(triplees[2]),
      }),
    )
  } else {
    throw "Invalid tripler"
  }
}

/*
 *
 * This function appears to be unused.
 *
 *
 */
async function upgradeNotification(triplerId) {
  let tripler = await neode.first("Tripler", "id", triplerId)
  if (tripler) {
    await sms(
      tripler.get("phone"),
      stringFormat(ov_config.tripler_upgrade_message, {
        ambassador_first_name: ambassador.get("first_name"),
        ambassador_last_name: ambassador.get("last_name") || "",
        organization_name: process.env.ORGANIZATION_NAME,
        tripler_first_name: tripler.get("first_name"),
        triplee_1: serializeTriplee(triplees[0]),
        triplee_2: serializeTriplee(triplees[1]),
        triplee_3: serializeTriplee(triplees[2]),
      }),
    )
  } else {
    throw "Invalid tripler"
  }
}

/** Specifically for cypher matching. */
function normalizeName(name) {
  return (name || "").trim().replace(/-'/g, "").toLowerCase()
}

/**
 * Weight search params by roughly how significantly they narrow the search results.
 * Mainly used for performance reasons.
 */
function calculateQueryPoints(query) {
  const points = {
    firstName: 1,
    lastName: 1,
    phone: 2,
    distance: 0,
    age: 1,
    gender: 1,
    msa: 2,
  }
  const queryPoints = ["firstName", "lastName", "phone", "distance", "age", "gender", "msa"]
    .map((key) => (query[key] ? points[key] : 0))
    .reduce((a, b) => a + b, 0)
  return queryPoints
}

/*
 *
 * buildTriplerSearchQuery(req)
 *
 * The utility function for the search functions to build the cypher query
 *
 *
 */
function buildTriplerSearchQuery(req) {
  const {firstName, lastName, phone, distance, age, gender, msa} = req.query

  // Add an optional constraint for performance.
  const {zip} = JSON.parse(req.user.get("address"))
  // Guess whether this query will probably return too many results.
  const isBroadQuery = calculateQueryPoints(req.query) < 2
  const zipFilter = isBroadQuery ? `and node.zip starts with left("${zip}", 3)` : ""

  const firstNameNorm = normalizeName(firstName)
  const lastNameNorm = normalizeName(lastName)
  let triplerQuery, nameType, nameToCompare
  if (firstNameNorm && lastNameNorm) {
    triplerQuery = `CALL db.index.fulltext.queryNodes("triplerFullNameIndex", "*${firstNameNorm}* *${lastNameNorm}*") YIELD node`
    nameType = "full"
    nameToCompare = `first_n_q + ' ' + last_n_q`
  } else if (firstNameNorm) {
    triplerQuery = `CALL db.index.fulltext.queryNodes("triplerFirstNameIndex", "*${firstNameNorm}*") YIELD node`
    nameType = "first"
    nameToCompare = `first_n_q`
  } else if (lastNameNorm) {
    triplerQuery = `CALL db.index.fulltext.queryNodes("triplerLastNameIndex", "*${lastNameNorm}*") YIELD node`
    nameType = "last"
    nameToCompare = `last_n_q`
  } else {
    triplerQuery = `match (node:Tripler {status:"unconfirmed"})`
  }
  const nodeName = `replace(replace(toLower(node.${nameType}_name), '-', ''), "'", '')`
  const stringDistScores =
    firstName || lastName
      ? `
    apoc.text.levenshteinSimilarity(${nodeName}, ${nameToCompare}) as score1,
    apoc.text.jaroWinklerDistance(${nodeName}, ${nameToCompare}) as score2,
    apoc.text.sorensenDiceSimilarity(${nodeName}, ${nameToCompare}) as score3
  `
      : `
    0 as score1, 0 as score2, 0 as score3
  `

  const phoneFilter = phone ? `and node.phone in ["${normalizePhone(phone)}"]` : ""
  const genderFilter = gender ? `and node.gender in ["${normalizeGender(gender)}"]` : ""
  const ageFilter = age ? `and node.age_decade in ["${age}"]` : ""
  const msaFilter = msa ? `and node.msa in ["${msa}"]` : ""

  // 0 means "Doesn't matter".
  const distanceValue = distance == null ? 0 : parseFloat(distance)

  // TODO: Use parameter isolation for security.
  return `
    match (a:Ambassador {id: "${req.user.get("id")}"})
    ${triplerQuery}
    where
      not (node)<-[:CLAIMS]-(:Ambassador)
      and not (:Ambassador)-[:WAS_ONCE]->(node)
      ${phoneFilter}
      ${genderFilter}
      ${ageFilter}
      ${msaFilter}
    with a.location as a_location, node,a
    limit 500
    with a, a_location, node, ${firstNameNorm ? `"${firstNameNorm}"` : null} as first_n_q, ${
    lastNameNorm ? `"${lastNameNorm}"` : null
  } as last_n_q
    with a, a_location, node, first_n_q, last_n_q,
      ${stringDistScores}
    with
      a, node,  avg(score1 + score2 + score3) + (10000 /  distance(a_location, node.location)) * ${distanceValue} as final_score, distance(a_location, node.location) as distance
    optional match (s:SocialMatch {source_id: "${req.user.get("id")}"})-[:HAS_SOCIAL_MATCH]-(node)
    RETURN node, case when s.similarity_metric is null then 0 else s.similarity_metric end as similarity_metric
    order by similarity_metric desc, final_score desc
    limit 100
  `
}

/*
 *
 * searchTriplersAmbassador(req)
 *
 * The function for an Ambassador searching for Triplers.
 *
 */
async function searchTriplersAmbassador(req) {
  const query = buildTriplerSearchQuery(req)
  console.log(query)
  let collection = await neode.cypher(query)
  let models = []
  for (let index = 0; index < collection.records.length; index++) {
    let entry = collection.records[index]._fields[0].properties
    models.push(serializeNeo4JTripler(entry))
  }

  return models
}

/*
 *
 * updateTriplerBlockedCarrier(tripler, carrier)
 *
 * This function simply updates the "blocked_carrier_info" attribute of a Tripler.
 *
 * This function is called when a Tripler's phone number is identified to come
 *   from a carrier that is blocked as defined by the .env var.
 *
 */
async function updateTriplerBlockedCarrier(tripler, carrier) {
  await tripler.update({
    blocked_carrier_info: tripler.get("blocked_carrier_info")
      ? tripler.get("blocked_carrier_info") + JSON.stringify(carrier, null, 2)
      : JSON.stringify(carrier, null, 2),
  })
}

/*
 *
 * updateTriplerCarrier(tripler, carrier)
 *
 * This function simply updates a Tripler's "carrier_info" attribute.
 *
 * This function is called when a Tripler's phone number is identified
 *   NOT to come from a carrier that is blocked by the .env var.
 *
 */
async function updateTriplerCarrier(tripler, carrier) {
  await tripler.update({
    carrier_info: tripler.get("carrier_info")
      ? tripler.get("carrier_info") + JSON.stringify(carrier, null, 2)
      : JSON.stringify(carrier, null, 2),
  })
}

/*
 *
 * updateClaimedBirthMonth(tripler, month)
 *
 * This function simply updates a Tripler's "claimed_birth_month" attribute.
 *
 */
async function updateClaimedBirthMonth(tripler, month) {
  await tripler.update({
    claimed_birth_month: month,
  })
}

/*
 *
 * startTriplerConfirmation(ambassador, tripler, triplerPhone, triplees, verification)
 *
 * This function sends the Tripler an SMS asking them to confirm to vote and get their
 *   3 triplees to vote as well.
 *
 * The function updates the Tripler to "pending" status, and sends this new status to HubSpot
 *
 * Note the Ambassador that has claimed this Tripler can and often does update the Tripler's
 *   phone number at this time. The /routes side of this will do verification on the Tripler's
 *   phone number before calling this function.
 *
 */
async function startTriplerConfirmation(ambassador, tripler, triplerPhone, triplees, verification) {
  try {
    await sms(
      triplerPhone,
      stringFormat(ov_config.tripler_confirmation_message, {
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
    throw "Error sending confirmation sms to the tripler"
  }

  await tripler.update({
    triplees: JSON.stringify(triplees, null, 2),
    status: "pending",
    phone: triplerPhone,
    verification: tripler.get("verification")
      ? tripler.get("verification") + JSON.stringify(verification, null, 2)
      : JSON.stringify(verification, null, 2),
  })
  await ambassadorsSvc.sendTriplerCountsToHubspot(ambassador)
}

module.exports = {
  findById: findById,
  findByPhone: findByPhone,
  confirmTripler: confirmTripler,
  detachTripler: detachTripler,
  reconfirmTripler: reconfirmTripler,
  findRecentlyConfirmedTriplers: findRecentlyConfirmedTriplers,
  buildTriplerSearchQuery: buildTriplerSearchQuery,
  searchTriplersAmbassador: searchTriplersAmbassador,
  startTriplerConfirmation: startTriplerConfirmation,
  updateTriplerCarrier: updateTriplerCarrier,
  updateTriplerBlockedCarrier: updateTriplerBlockedCarrier,
  updateClaimedBirthMonth: updateClaimedBirthMonth,
}
