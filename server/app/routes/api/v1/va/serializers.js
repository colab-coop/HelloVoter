import {Router} from "express"
import format from "string-format"
import {v4 as uuidv4} from "uuid"

import {getValidCoordinates, normalizePhone} from "../../../../lib/normalizers"
import {ValidationError} from "../../../../lib/errors"
import {isLocked, getTrustFactors} from "../../../../lib/fraud"

import {formatDate, formatNumber} from "../../../../lib/format"
import PhoneNumber from "awesome-phonenumber"

/*
 *
 * Just some serialization functions
 *
 */

function serializeAddress(address) {
  if (!address) return ""
  let keys = ["address1", "city", "state", "zip"]
  let values = []
  keys.forEach((key) => {
    if (address[key]) values.push(address[key])
  })
  return values.join(", ")
}

function serializeName(first_name, last_name) {
  if (!last_name) return first_name
  return [first_name, last_name].join(" ")
}

function getPrimaryAccount(ambassador) {
  const edges = ambassador.get("owns_account") || []
  for (let e = 0; e < edges.length; e++) {
    const other = edges.get(e)?.otherNode()
    if (other?.get("is_primary")) return other
  }
  return null
}

function serializeAccount(account) {
  if (!account) return null
  let obj = {}
  ;["id", "account_id", "account_type"].forEach((x) => (obj[x] = account.get(x)))
  obj["account_data"] = !!account.get("account_data")
    ? JSON.parse(account.get("account_data"))
    : null
  return obj
}

function serializeAmbassador(ambassador) {
  let obj = {}
  ;[
    "id",
    "external_id",
    "date_of_birth",
    "first_name",
    "last_name",
    "phone",
    "email",
    "location",
    "signup_completed",
    "approved",
    "quiz_completed",
    "onboarding_completed",
    "payout_provider",
    "payout_additional_data",
    "admin",
    "has_w9",
    "paypal_approved",
  ].forEach((x) => (obj[x] = ambassador.get(x)))
  obj["address"] = !!ambassador.get("address")
    ? JSON.parse(ambassador.get("address").replace("#", "no."))
    : null
  obj["display_address"] = !!obj["address"] ? serializeAddress(obj["address"]) : null
  obj["display_name"] = serializeName(ambassador.get("first_name"), ambassador.get("last_name"))
  obj["hs_id"] = ambassador.get("hs_id") ? ambassador.get("hs_id").toString() : null
  const claimTriplerLimit = ambassador.get("claim_tripler_limit")
  if (claimTriplerLimit) {
    obj["claim_tripler_limit"] = claimTriplerLimit.toNumber()
  }

  const acct = getPrimaryAccount(ambassador)
  obj["account"] = serializeAccount(acct)
  obj["locked"] = isLocked(ambassador)
  obj["hs_id"] = ambassador.get("hs_id") ? ambassador.get("hs_id").toString() : ""

  let claimees = ambassador.get("claims")
  let array = []
  for (let index = 0; index < claimees.length; index++) {
    array.push(serializeTripler(claimees.get(index).otherNode()))
  }
  obj["claimees"] = array
  return obj
}

function serializeAmbassadorForAdmin(ambassador) {
  let obj = serializeAmbassador(ambassador)

  // add the values only admin will see here
  obj["verification"] = ambassador.get("verification")
  obj["quiz_completed"] = ambassador.get("quiz_completed")
  obj["onboarding_completed"] = ambassador.get("onboarding_completed")
  obj["giftcard_completed"] = ambassador.get("giftcard_completed")
  obj["signup_completed"] = ambassador.get("signup_completed")
  obj["payout_provider"] = ambassador.get("payout_provider")
  obj["admin_bonus"] = ambassador.get("admin_bonus") || 0
  obj["trust_factors"] = getTrustFactors(ambassador) || null
  obj["ekata_report"] = ambassador.get("ekata_report") || ""

  //claimees
  let claimees = ambassador.get("claims")
  let claimees_array = []
  for (let index = 0; index < claimees.length; index++) {
    claimees_array.push(serializeTripler(claimees.get(index).otherNode()))
  }
  obj["claimees"] = claimees_array

  //payouts
  let payouts = ambassador.get("gets_paid")
  let payouts_array = []
  for (let index = 0; index < payouts.length; index++) {
    payouts_array.push(serializePayout(payouts.get(index).otherNode()))
  }
  obj["payouts"] = payouts_array

  return obj
}

function serializePayout(payout) {
  return {
    id: payout.get("id"),
    amount: payout.get("amount") ? payout.get("amount").low : null,
    status: payout.get("status"),
    disbursement_id: payout.get("disbursement_id"),
    settlement_id: payout.get("settlement_id"),
    disbursed_at: payout.get("disbursed_at")
      ? new Date(payout.get("disbursed_at").toString())
      : null,
    settled_at: payout.get("settled_at") ? new Date(payout.get("settled_at").toString()) : null,
    error: payout.get("error") ? JSON.parse(payout.get("error")) : null,
    formatted_amount: payout.get("amount") ? formatNumber(payout.get("amount") / 100) : null,
    formatted_disbursed_at: payout.get("disbursed_at")
      ? formatDate(new Date(payout.get("disbursed_at").toString()))
      : null,
    formatted_settled_at: payout.get("settled_at")
      ? formatDate(new Date(payout.get("settled_at").toString()))
      : null,
    account: payout.get("to_account") ? serializeAccount(payout.get("to_account")) : null,
  }
}

function serializeTriplerForCSV(tripler) {
  let obj = {}
  ;[
    "voter_id",
    "id",
    "first_name",
    "last_name",
    "status",
    "phone",
    "location",
    "email",
    "verification",
  ].forEach((x) => (obj[x] = tripler.get(x)))
  obj["address"] = !!tripler.get("address")
    ? JSON.parse(tripler.get("address").replace("#", "no."))
    : null
  obj["display_address"] = !!obj["address"] ? serializeAddress(obj["address"]) : null
  obj["display_name"] = serializeName(tripler.get("first_name"), tripler.get("last_name"))
  obj["triplees"] = !!tripler.get("triplees") ? JSON.parse(tripler.get("triplees")) : null
  obj["is_ambassador_and_has_confirmed"] = tripler.get("is_ambassador_and_has_confirmed")
    ? true
    : false
  obj["is_ambassador"] = tripler.get("is_ambassador") ? true : false
  return obj
}

function serializeTripler(tripler) {
  let obj = {}
  let ambassador = tripler.get("is_ambassador")
  let was_once = ambassador ? ambassador.get("was_once") : null
  ;["id", "first_name", "last_name", "status", "phone", "location", "email", "age_decade"].forEach(
    (x) => (obj[x] = tripler.get(x)),
  )
  obj["address"] = !!tripler.get("address") ? JSON.parse(tripler.get("address")) : null
  obj["display_address"] = !!obj["address"] ? serializeAddress(obj["address"]) : null
  obj["display_name"] = serializeName(tripler.get("first_name"), tripler.get("last_name"))
  obj["display_phone"] = new PhoneNumber(`${tripler.get("phone")}`, "US").a.number.national
  obj["triplees"] = !!tripler.get("triplees") ? JSON.parse(tripler.get("triplees")) : null
  obj["is_ambassador"] = ambassador ? true : false
  obj["is_ambassador_and_has_confirmed"] = tripler.get("is_ambassador_and_has_confirmed")
    ? true
    : false
  return obj
}

function serializeNeo4JTripler(tripler) {
  let obj = {}
  ;[
    "distance",
    "id",
    "first_name",
    "last_name",
    "status",
    "phone",
    "location",
    "email",
    "age_decade",
  ].forEach((x) => (obj[x] = tripler[x]))
  obj["address"] = !!tripler.address ? JSON.parse(tripler.address) : null
  obj["display_address"] = !!obj["address"] ? serializeAddress(obj["address"]) : null
  obj["display_name"] = serializeName(tripler.first_name, tripler.last_name)
  obj["display_phone"] = new PhoneNumber(`${tripler.phone}`, "US").a.number.national
  obj["triplees"] = !!tripler.triplees ? JSON.parse(tripler.triplees) : null
  return obj
}

function serializeTriplee(triplee) {
  return `${triplee.first_name} ${triplee.last_name}`
}

function serializeTripleeForCSV(triplee) {
  return `${triplee.first_name} ${triplee.last_name} - ${triplee.housemate}`
}

module.exports = {
  serializeAmbassador: serializeAmbassador,
  serializeAmbassadorForAdmin: serializeAmbassadorForAdmin,
  serializeTripler: serializeTripler,
  serializeTriplerForCSV: serializeTriplerForCSV,
  serializeNeo4JTripler: serializeNeo4JTripler,
  serializePayout: serializePayout,
  serializeAccount: serializeAccount,
  serializeName: serializeName,
  serializeAddress: serializeAddress,
  serializeTriplee: serializeTriplee,
  serializeTripleeForCSV: serializeTripleeForCSV,
}
