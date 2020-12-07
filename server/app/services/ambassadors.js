import {v4 as uuidv4} from "uuid"
import stringFormat from "string-format"
import {verifyAlloy} from "../lib/alloy"
import neode from "../lib/neode"

import {validateEmpty, validateUnique, assertUserPhoneAndEmail} from "../lib/validations"

import {ValidationError} from "../lib/errors"
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
    approved: false,
    location: {
      latitude: parseFloat(coordinates.latitude),
      longitude: parseFloat(coordinates.longitude),
    },
    external_id: ov_config.stress ? json.externalId + Math.random() : json.externalId,
    verification: JSON.stringify(verification, null, 2),
    carrier_info: JSON.stringify(carrierLookup, null, 2),
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
  return new_ambassador
}

/*
 *
 * getPrimaryAccount(ambassador)
 *
 * This function returns the primary Account node for a given Ambassador
 *
 * NOTE: there was originally no is_primary attribute on Ambassador nodes.
 *   The update that added this attribute did not do so via a migration.
 *   Therefore in the database, there existed (exists) legacy nodes without
 *   this attribute. This function checks if none of the Account nodes are
 *   is_primary:true and if none exist, it sets the first one to be primary.
 *
 */
async function getPrimaryAccount(ambassador) {
  let relationships = ambassador.get("owns_account")
  let primaryAccount = null

  if (relationships.length > 0) {
    relationships.forEach((ownsAccount) => {
      if (ownsAccount.otherNode().get("is_primary")) {
        primaryAccount = ownsAccount.otherNode()
      }
    })

    if (!primaryAccount) {
      // probably a legacy account
      relationships.forEach(async (ownsAccount) => {
        if (primaryAccount) return
        await ownsAccount.otherNode().update({is_primary: true})
        primaryAccount = ownsAccount.otherNode()
      })
    }
  }

  return primaryAccount
}

/*
 *
 * unclaimTriplers(req)
 *
 * This function simply removes the :CLAIMS relationship between the current
 *   Ambassador and the given Tripler.
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

module.exports = {
  findByExternalId: findByExternalId,
  findById: findById,
  signup: signup,
  getPrimaryAccount: getPrimaryAccount,
  unclaimTriplers: unclaimTriplers,
  searchAmbassadors: searchAmbassadors,
}
