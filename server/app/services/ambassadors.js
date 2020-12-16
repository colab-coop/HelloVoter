import {v4 as uuidv4} from "uuid"
import stringFormat from "string-format"
import {verifyAlloy, fuzzyAlloy} from "../lib/alloy"
import {getAmbassadorHSID, updateHubspotAmbassador, createHubspotContact} from "../lib/crm"

import neode from "../lib/neode"

import {validateEmpty, validateUnique, assertUserPhoneAndEmail} from "../lib/validations"

import {ValidationError} from "../lib/errors"
import {isLocked} from "../lib/fraud"
import {trimFields} from "../lib/utils"
import {getValidCoordinates, normalizePhone} from "../lib/normalizers"
import mail from "../lib/mail"
import {ov_config} from "../lib/ov_config"
import {signupEmail} from "../emails/signupEmail"
import {serializeAmbassadorForAdmin} from "../routes/api/v1/va/serializers"

/*
 *
 * findByExternalId(externalId)
 *
 * Simply returns the neode object that corresponds to the given external ID (from Facebook / Google)
 *
 */
async function findByExternalId(externalId) {
  return await neode.first("Ambassador", "external_id", externalId)
}

/*
 *
 * findById(id)
 *
 * Simply returns the neode object that corresponds to the given ID
 *
 */
async function findById(id) {
  return await neode.first("Ambassador", "id", id)
}

/*
 *
 * signup(json, verification, carrierLookup)
 *
 * This is the main service function for Ambassador signup.
 *
 * It validates a variety of data and if all is valid, creates the neode Ambassador object.
 *   If the given Ambassador was once a Tripler, a :WAS_ONCE relationship is created between them
 *
 * This function then sends an admin email informing admins of the ambassador creation.
 *
 */
async function signup(json, verification, carrierLookup) {
  json = trimFields(json)

  if (!validateEmpty(json, ["first_name", "phone", "address"])) {
    throw new ValidationError("Invalid payload, ambassador cannot be created")
  }

  await assertUserPhoneAndEmail("Ambassador", json.phone, json.email, null, true)

  if (!(await validateUnique("Ambassador", {external_id: json.externalId}))) {
    throw new ValidationError(
      "If you have already signed up as an Ambassador using Facebook or Google, you cannot sign up again.",
    )
  }

  const [coordinates, address] = await getValidCoordinates(json.address)

  const DOB = json.date_of_birth.split("/")
  let date_of_birth_month = DOB[0]
  let date_of_birth_day = DOB[1]
  const date_of_birth_year = DOB[2]

  if (date_of_birth_day.length === 1) {
    date_of_birth_day = "0" + date_of_birth_day
  }

  if (date_of_birth_month.length === 1) {
    date_of_birth_month = "0" + date_of_birth_month
  }

  const birth_date = date_of_birth_year + "-" + date_of_birth_month + "-" + date_of_birth_day
  const alloy_response = await verifyAlloy(
    json.first_name,
    json.last_name,
    json.address.address1,
    json.address.city,
    json.address.state,
    json.address.zip,
    birth_date,
  )
  let existing_ambassador = null

  if (alloy_response) {
    existing_ambassador = await neode.first("Ambassador", {
      alloy_person_id: alloy_response.data.alloy_person_id,
    })
  }
  //if there's a fuzzy match, approve the Ambassador
  let fuzzy = await fuzzyAlloy(
    json.first_name,
    json.last_name,
    json.address.state,
    json.address.zip,
  )

  let new_ambassador = await neode.create("Ambassador", {
    id: uuidv4(),
    first_name: json.first_name,
    last_name: json.last_name || null,
    phone: normalizePhone(json.phone),
    email: json.email || null,
    date_of_birth: json.date_of_birth || null,
    address: JSON.stringify(address, null, 2),
    quiz_results: JSON.stringify(json.quiz_results, null, 2) || null,
    signup_completed: true,
    approved: fuzzy > 0 ? true : false,
    location: {
      latitude: parseFloat(coordinates.latitude),
      longitude: parseFloat(coordinates.longitude),
    },
    external_id: ov_config.stress ? json.externalId + Math.random() : json.externalId,
    verification: JSON.stringify(verification, null, 2),
    carrier_info: JSON.stringify(carrierLookup, null, 2),
    hs_id: null,
  })

  if (existing_ambassador && !existing_ambassador.get("external_id")) {
    // existing ambassador exists and does not have an external id
    // delete it and copy over the approved and alloy_person_id
    let alloy_person_id = existing_ambassador.get("alloy_person_id")
    let approved = existing_ambassador.get("approved")
    //copy all the relationships from one to the other
    let query = `MATCH (old:Ambassador {alloy_person_id: $alloy_person_id})
              MATCH (new:Ambassador {id: $new_ambassador})
              OPTIONAL MATCH (old)-[out:HAS_SOCIAL_MATCH]->(s1:SocialMatch)
              OPTIONAL MATCH (old)<-[in:HAS_SOCIAL_MATCH]-(s2:SocialMatch)
              WITH new, old, collect(distinct s1) as outs, collect(distinct s2) as ins
              FOREACH (x in outs | CREATE (new)-[:HAS_SOCIAL_MATCH]->(x))
              FOREACH (y in ins | CREATE (new)<-[:HAS_SOCIAL_MATCH]-(y))`

    let status = await neode.cypher(query, {
      alloy_person_id: existing_ambassador.get("alloy_person_id"),
      new_ambassador: new_ambassador.get("id"),
    })
    existing_ambassador.delete()
    new_ambassador.update({alloy_person_id: alloy_person_id, approved: approved})
  }

  // send email in the background
  setTimeout(async () => {
    let address = JSON.parse(new_ambassador.get("address"))
    let body = signupEmail(new_ambassador, address)
    let subject = stringFormat(ov_config.new_ambassador_signup_admin_email_subject, {
      organization_name: ov_config.organization_name,
    })
    await mail(ov_config.admin_emails, null, null, subject, body)
  }, 100)

  let existing_tripler = await neode.first("Tripler", {
    phone: normalizePhone(json.phone),
  })

  if (existing_tripler) {
    new_ambassador.relateTo(existing_tripler, "was_once")
  }

  initialSyncAmbassadorToHubSpot(new_ambassador)

  if (typeof verification[1] !== "undefined") {
    setAmbassadorEkataAssociatedPeople(new_ambassador, verification)
  }

  return new_ambassador
}

/*
 * initialSyncAmbassadorToHubSpot(ambassador)
 * If the given Ambassador node doesn't already have an `hs_id`:
 * (a) populates `hs_id` by asking HubSpot for the HubSpot ID associated
 * with the Ambassador's e-mail address, then
 * (b) sends the other data fields on the node over to HubSpot.
 */
async function initialSyncAmbassadorToHubSpot(ambassador) {
  //only continue if there's no hs_id

  let obj = {}
  ;["first_name", "last_name", "approved", "email", "phone", "external_id"].forEach(
    (x) => (obj[x] = ambassador.get(x)),
  )
  obj["alloy_person_id"] = ambassador.get("alloy_person_id")
    ? ambassador.get("alloy_person_id").toString()
    : null
  obj["website"] =
    "https://app.blockpower.vote/ambassadors/admin/#/volunteers/view/" + ambassador.get("id")
  if (!ambassador.get("hs_id")) {
    console.log("no hs id, gettig it from hs")
    let hs_response = await getAmbassadorHSID(ambassador.get("email"))
    if (!hs_response) {
      createHubspotContact(obj)
      hs_response = await getAmbassadorHSID(ambassador.get("email"))
    }

    if (!hs_response) {
      return null
    }

    let cypher_response = await neode.cypher(
      "MATCH (a:Ambassador {id: $id}) SET a.hs_id=$hs_id RETURN a.first_name, a.hs_id",
      {
        id: ambassador.get("id"),
        hs_id: hs_response,
      },
    )

    // send initial data to hubspot, so you know if it's working
    obj["hs_id"] = hs_response

    updateHubspotAmbassador(obj)
  }
  return ambassador.get("hs_id")
}

/*
 * syncAmbassadorToHubSpot(ambassador)
 * syncs Ambassador to Hubspot. Ambassador must have a hs_id
 */

async function syncAmbassadorToHubSpot(ambassador) {
  //only continue if there IS hs_id
  if (ambassador.get("hs_id")) {
    let obj = {}
    ;[
      "first_name",
      "last_name",
      "approved",
      "quiz_completed",
      "onboarding_completed",
      "external_id",
      "phone",
      "signup_completed",
      "has_w9",
      "paypal_approved",
      "giftcard_completed",
      "is_admin",
      "payout_provider",
    ].forEach((x) => (obj[x] = ambassador.get(x)))
    obj["website"] =
      "https://app.blockpower.vote/ambassadors/admin/#/volunteers/view/" + ambassador.get("id")
    obj["hs_id"] = ambassador.get("hs_id").toString()
    obj["alloy_person_id"] = ambassador.get("alloy_person_id")
      ? ambassador.get("alloy_person_id").toString()
      : null
    obj["locked"] = isLocked(ambassador)
    updateHubspotAmbassador(obj)
  }
  return ambassador.get("hs_id")
}

/*
 * sendTriplerCountsToHubspot(ambassador)
 */
async function sendTriplerCountsToHubspot(ambassador) {
  //only continue if there's a hs_id
  console.log("ambassador id:", ambassador.get("id"))
  if (ambassador.get("hs_id")) {
    console.log("ambassador hs_id:", ambassador.get("hs_id").toString())

    let pending_triplers_result = await neode.cypher(
      "MATCH (a:Ambassador {id: $id})-[r:CLAIMS]->(t:Tripler {status:'pending'}) RETURN t",
      {
        id: ambassador.get("id"),
      },
    )
    let confirmed_triplers_result = await neode.cypher(
      "MATCH (a:Ambassador {id: $id})-[r:CLAIMS]->(t:Tripler {status:'confirmed'}) RETURN t",
      {
        id: ambassador.get("id"),
      },
    )
    let unconfirmed_triplers_result = await neode.cypher(
      "MATCH (a:Ambassador {id: $id})-[r:CLAIMS]->(t:Tripler {status:'unconfirmed'}) RETURN t",
      {
        id: ambassador.get("id"),
      },
    )
    let obj = {}
    ;["first_name", "last_name", "approved", "external_id"].forEach(
      (x) => (obj[x] = ambassador.get(x)),
    )
    obj["hs_id"] = ambassador.get("hs_id").toString()
    obj["num_pending_triplers"] = pending_triplers_result.records.length
    obj["num_unconfirmed_triplers"] = unconfirmed_triplers_result.records.length
    obj["num_confirmed_triplers"] = confirmed_triplers_result.records.length

    updateHubspotAmbassador(obj)
  }
  return ambassador.get("hs_id")
}

/*
 * updateEkataMatchScore(ambassador)
 * Based on the ambassador's verification string and that of the the triplers connected to it,
 * update the ambassador's Ekata Match Penalty.
 */

async function updateEkataMatchScore(ambassador) {
  let ekataReport = "EKATA REPORT\n"
  //resetting (in case any validation score changed, it calculates fresh)
  let ambassadorMatches = 0
  let tripler_ekata_blemish = 0
  let ambassador_ekata_blemish = 0
  let re = /\d* \w{1,2}/
  let triplerRe = /"address1":"(\w{1,4})/

  //these are still being tuned to find the best fit

  let ambassadorEkataThreshold = ov_config.ambassadorEkataThreshold || 1
  ekataReport +="================================================="
  ekataReport +="\nambassadorEkataThreshold:" + ambassadorEkataThreshold +"\n"
  
  let ambassadorEkataPenalty = ov_config.ambassadorEkataPenalty || 2
  ekataReport +="ambassadorEkataPenalty:" + ambassadorEkataPenalty +"\n"

  let triplerEkataPenalty = ov_config.triplerEkataPenalty || 1
  ekataReport +="triplerEkataPenalty:" + triplerEkataPenalty +"\n"

  let triplerEkataBonus = ov_config.triplerEkataBonus || 2
  ekataReport +="triplerEkataBonus:" + triplerEkataBonus +"\n"
  ekataReport +="=================================================\n"

  let query =
    "MATCH (a:Ambassador {id:$a_id})-[:CLAIMS]->(t:Tripler) WHERE  t.status <> 'unconfirmed' RETURN t.first_name as first_name, t.last_name as last_name, t.address as address, t.verification as verification"
  let collection = await neode.cypher(query, {a_id: ambassador.get("id")})
  for (let index = 0; index < collection.records.length; index++) {
    let invidualTriplerMatchScore = 0
    let triplerAddress = (collection.records[index].get("address") || '').toLowerCase()
    let verificationString = (collection.records[index].get("verification") || "").toString().toLowerCase()
    let triplerProperties = []
    triplerProperties.push(collection.records[index].get("first_name").toLowerCase())
    triplerProperties.push(collection.records[index].get("last_name").toLowerCase())
    triplerProperties.push(triplerAddress.match(triplerRe)[1].toLowerCase())

    ekataReport += "\nTRIPLER PROPERTIES: " + triplerProperties + "\n"
    for (let i in triplerProperties) {
      ekataReport += "\n" + triplerProperties[i] + " "
      if (verificationString.includes(triplerProperties[i])) {

        invidualTriplerMatchScore++
        ekataReport += "matches\n"
      } else {
      ekataReport += "doesn't match\n"
      }
    }

    if (invidualTriplerMatchScore >= 1) {
      ekataReport += "\nthis tripler's individual match score is " + invidualTriplerMatchScore + ", which is >1, blemishes are going down"

    // if the individual tripler has one or more matches (good), then the overall tripler blemish is made smaller
      tripler_ekata_blemish = tripler_ekata_blemish - triplerEkataBonus
    } else {
      ekataReport += "\nthis tripler's individual match score is " + invidualTriplerMatchScore + ", which is <1, blemishes are going up"

    // if the individual tripler has less than one match (bad), then the overall tripler blemish is made larger
      tripler_ekata_blemish = tripler_ekata_blemish + triplerEkataPenalty
    }
  }
  ekataReport += "\ntripler_ekata_blemish:" + tripler_ekata_blemish
  ekataReport +="\n=================================================\n"


  // determining the blemishness of the ambassador

  let verificationString = ambassador.get("verification").toLowerCase()
  let ambassadorAddress = ambassador.get("address").toLowerCase()

  let ambassadorProperties = [
    ambassador.get("first_name").toLowerCase(),
    ambassador.get("last_name").toLowerCase(),
    ambassadorAddress.match(re)[0].toLowerCase() ? ambassadorAddress.match(re)[0].toLowerCase() : ""
  ]
  ekataReport += "\nAMBASSADOR PROPERTIES: " + ambassadorProperties + "\n"

  for (let i in ambassadorProperties) {
    ekataReport += "\n" + ambassadorProperties[i] + " "

    if (verificationString.includes(ambassadorProperties[i])) {
      ambassadorMatches++
       ekataReport += "matches\n"
    } else {
      ekataReport += "doesn't match\n"
    }
  }

  // if the ambassador does not have enough matches, levy the penalty

  if (ambassadorMatches < ambassadorEkataThreshold) {
    ekataReport += "\nthis ambassador's individual match score is " + ambassadorMatches + ", which is less than the threshold, " + ambassadorEkataThreshold + "\n"
    ambassador_ekata_blemish = ambassadorEkataPenalty
  }
  
  let reportQuery = "MATCH (a:Ambassador {id:$a_id}) SET a.ekata_report=toString($ekataReport)"
  await neode.cypher(reportQuery, {a_id: ambassador.get("id"), ekataReport:ekataReport})

  ambassador.update({
    ambassador_ekata_blemish: ambassador_ekata_blemish,
    tripler_ekata_blemish: Math.max(0,tripler_ekata_blemish), //tripler_ekata_blemish should not be negative, floor is 0
  })
}

// Returns the primary Account node for a given Ambassador.
async function getPrimaryAccount(ambassador) {
  const edges = ambassador.get("owns_account") || []
  for (let e = 0; e < edges.length; e++) {
    const other = edges.get(e)?.otherNode()
    if (other?.get("is_primary")) return other
  }
  return null
}

/*
 *
 * unclaimTriplers(req)
 *
 * This function simply removes the :CLAIMS relationship between the current
 *   Ambassador and the given Tripler, and updates the Hubspot Tripler Counts for the Ambassador
 *
 */
async function unclaimTriplers(req) {
  let ambassador = req.user

  for (var x = 0; x < req.body.triplers.length; x++) {
    let result = await req.neode
      .query()
      .match("a", "Ambassador")
      .where("a.id", ambassador.get("id"))
      .relationship("CLAIMS", "out", "r")
      .to("t", "Tripler")
      .where("t.id", req.body.triplers[x])
      .detachDelete("r")
      .execute()
  }

  await sendTriplerCountsToHubspot(ambassador)
  await updateEkataMatchScore(ambassador)
}

/*
 *
 * buildAmbassadorSearchQuery(req)
 *
 * The utility function for the search functions to build the cypher query
 *
 *
 */
function buildAmbassadorSearchQuery(req) {
  return `
    match (a:Ambassador)
    where
      a.external_id is not null
    return a
    order by a.last_name asc
    limit 500`
}

/*
 *
 * searchAmbassadors(req)
 *
 * The function for an Ambassador searching for Triplers.
 *
 */
async function searchAmbassadors(req) {
  const query = buildAmbassadorSearchQuery(req)
  let collection = await neode.cypher(query)
  let models = []
  for (let index = 0; index < collection.records.length; index++) {
    let entry = collection.records[index]._fields[0].properties
    models.push(entry)
  }

  return models
}

async function setAmbassadorEkataAssociatedPeople(ambassador, verification) {
  if (typeof verification[1] !== "undefined") {
    const people = verification[1]["name"]["result"]["associated_people"]
    const query = `
  match (a:Ambassador {id:$a_id})
  merge (e:EkataPerson {id:$e_id})
  merge (a)-[r:EKATA_ASSOCIATED]->(e)
  `
  
    for (let i = 0; i < people.length; i++) {
      let params = {}
      params["a_id"] = ambassador.get("id")
      params["e_id"] = people[i]["id"]
      await neode.cypher(query, params)
    }
  }
}

module.exports = {
  findByExternalId: findByExternalId,
  findById: findById,
  signup: signup,
  getPrimaryAccount: getPrimaryAccount,
  unclaimTriplers: unclaimTriplers,
  searchAmbassadors: searchAmbassadors,
  initialSyncAmbassadorToHubSpot: initialSyncAmbassadorToHubSpot,
  sendTriplerCountsToHubspot: sendTriplerCountsToHubspot,
  syncAmbassadorToHubSpot: syncAmbassadorToHubSpot,
  updateEkataMatchScore: updateEkataMatchScore,
}
