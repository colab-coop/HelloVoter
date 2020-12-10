const {ov_config} = require("./ov_config")
const axios = require("axios")

async function getAmbassadorHSID(email) {
  let hs_key = ov_config.hubspot_api_key

  if (hs_key) {
    console.log(`[HS] Calling API with: ${email}`)
    try {
      let response
      response = await axios.post(
        `https://api.hubapi.com/crm/v3/objects/contacts/search?hapikey=${hs_key}`,
        {
          filterGroups: [
            {
              filters: [
                {
                  propertyName: "email",
                  value: email,
                  operator: "EQ",
                },
              ],
            },
          ],
        },
      )
      return response.data.results[0].id
    } catch (err) {
      console.log(`[HS] Lookup failed with error ${err}`)
      return null
    }
  }
}

async function updateHubspotAmbassador(req) {
  let hs_key = ov_config.hubspot_api_key
  console.log("req", req)
  console.log(`[HS] Updating Ambassador`)
  try {
    let response
    if (hs_key && req.hs_id) {
      response = await axios.patch(
        `https://api.hubapi.com/crm/v3/objects/contacts/${req.hs_id}?hapikey=${hs_key}`,
        {
          properties: {
            email: req.email ? req.email : null,
            firstname: req.first_name ? req.first_name : null,
            lastname: req.last_name ? req.last_name : null,
            num_unconfirmed_triplers: req.num_unconfirmed_triplers
              ? req.num_unconfirmed_triplers
              : 0,
            num_pending_triplers: req.num_pending_triplers ? req.num_pending_triplers : 0,
            num_confirmed_triplers: req.num_confirmed_triplers ? req.num_confirmed_triplers : 0,
            is_denied: req.approved ? "False" : "True",
            alloy_person_id: req.alloy_person_id ? req.alloy_person_id : null,
            quiz_completed: req.quiz_completed ? req.quiz_completed : null,
            onboarding_completed: req.onboarding_completed ? req.onboarding_completed : null,
            giftcard_completed: req.giftcard_completed ? req.giftcard_completed : null,
            google_fb_id: req.external_id ? req.external_id : null,
            google_fb_id: req.external_id ? req.external_id : null,
            phone: req.phone ? req.phone : null,
            is_admin: req.is_admin ? req.is_admin : null,
            signup_completed: req.signup_completed ? req.signup_completed : null,
            paypal_approved: req.paypal_approved ? req.paypal_approved : null,
            locked: req.locked ? req.locked : null,
            has_w9: req.has_w9 ? req.has_w9 : null,
            payout_provider: req.payout_provider ? req.payout_provider : null,
            website: req.website ? req.website : null,
          },
        },
      )
    }
    return response
  } catch (err) {
    console.log(`[HS] Update failed with error ${err}`)
    return null
  }
}

async function createHubspotContact(req) {
  let hs_key = ov_config.hubspot_api_key
  console.log("req", req)
  console.log(`[HS] Creating Hubspot Contact`)
  try {
    let response
    if (hs_key) {
      response = await axios.post(
        `https://api.hubapi.com/crm/v3/objects/contacts?hapikey=${hs_key}`,
        {
          properties: {
            email: req.email,
            firstname: req.first_name ? req.first_name : null,
            lastname: req.last_name ? req.last_name : null,
            num_unconfirmed_triplers: req.num_unconfirmed_triplers
              ? req.num_unconfirmed_triplers
              : 0,
            num_pending_triplers: req.num_pending_triplers ? req.num_pending_triplers : 0,
            num_confirmed_triplers: req.num_confirmed_triplers ? req.num_confirmed_triplers : 0,
            is_denied: req.approved ? "False" : "True",
            alloy_person_id: req.alloy_person_id ? req.alloy_person_id : null,
            quiz_completed: req.quiz_completed ? req.quiz_completed : null,
            onboarding_completed: req.onboarding_completed ? req.onboarding_completed : null,
            giftcard_completed: req.giftcard_completed ? req.giftcard_completed : null,
            google_fb_id: req.external_id ? req.external_id : null,
            phone: req.phone ? req.phone : null,
            is_admin: req.is_admin ? req.is_admin : null,
            signup_completed: req.signup_completed ? req.signup_completed : null,
            paypal_approved: req.paypal_approved ? req.paypal_approved : null,
            locked: req.locked ? req.locked : null,
            has_w9: req.has_w9 ? req.has_w9 : null,
            payout_provider: req.payout_provider ? req.payout_provider : null,
            website: req.website ? req.website : null,
          },
        },
      )
    }
    return response
  } catch (err) {
    console.log(`[HS] Create failed with error ${err}`)
    return null
  }
}

module.exports = {
  getAmbassadorHSID: getAmbassadorHSID,
  updateHubspotAmbassador: updateHubspotAmbassador,
  createHubspotContact: createHubspotContact,
}
