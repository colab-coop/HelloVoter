import PhoneNumber from 'awesome-phonenumber';
import EmailValidator from 'email-validator';
import neode from '../lib/neode';
import { ov_config } from './ov_config';
import { normalizePhone } from './normalizers';
import carrier from './carrier';
import caller_id from './caller_id';
import reverse_phone from './reverse_phone';
import { ValidationError } from './errors';

const ALLOWED_STATES = ov_config.allowed_states
  .toUpperCase()
  .split(',')
  .map((state) => state.trim());

/*
 *
 * _isEmpty(obj)
 *
 * This helper function is used by validateEmpty to determine if a field is empty or not
 *
 */
function _isEmpty(obj) {
  if (!obj) return true;
  if (typeof obj === 'object') return Object.keys(obj).length === 0;
  if (typeof obj === 'string') return !(obj.trim());
  return false;
}

/*
 *
 * validateEmpty(obj, keys)
 *
 * This function determines if an object and its fields is empty or not
 *
 */
export function validateEmpty(obj, keys) {
  if (_isEmpty(obj)) return false;
  for (var i = 0; i < keys.length; i++) {
    if (_isEmpty(obj[keys[i]])) return false;
  }
  return true;
}

/*
 *
 * validatePhone(phone)
 *
 * This function simply uses the `awesome-phonenumber` package to determine if a phone number
 *   string is a valid US phone number.
 *
 */
export function validatePhone(phone) {
  return (new PhoneNumber(phone, 'US')).isValid();
}

/*
 *
 * validateEmail(email)
 *
 * This function simply uses the `email-validator` package to determine if an email
 *   string is valid or not.
 *
 */
export function validateEmail(email) {
  return EmailValidator.validate(email || "");
}

/*
 *
 * validateUniquePhone(modelName, phone, existingId)
 *
 * This function calls validateUnique to determine if the phone number is unique
 *
 */
export async function validateUniquePhone(modelName, phone, existingId = null) {
  return validateUnique(modelName, { phone: normalizePhone(phone) }, existingId);
}

/**
 * Returns true if a node with these properties does not yet exist,
 * or if it only matches the given ID (useful when updating an existing node).
 */
export async function validateUnique(modelName, properties, existingId = null) {
  const all = await neode.all(modelName, properties);
  if (all.length === 0) return true;
  if (all.length > 1) return false;
  // Exactly one match, return false unless it's existingId.
  return all.first().get('id') === existingId;
}

/*
 *
 * validateState(state)
 *
 * This function takes the ALLOWED_STATES env var and matches it against the provided state.
 *   If the state is not allowed, the Ambassador will not be allowed to sign up.
 *
 */
export function validateState(state) {
  return ALLOWED_STATES.indexOf(state) >= 0;
}

/*
 *
 * validateCarrier(phone)
 *
 * This function checks the provided phone number with Twilio to determine the carrier.
 * If the carrier matches one of the carriers in the BLOCKED_CARRIERS env var, the Ambassador will not
 *   be able to signup, and the Tripler will not begin confirmation process.
 *
 */
export async function validateCarrier(phone) {
  return await carrier(normalizePhone(phone));
}

/** Check against Twilio caller ID and Ekata data. */
export async function verifyCallerIdAndReversePhone(phone) {
  const verifications = [];

  let twilioCallerId = await caller_id(phone);
  if (twilioCallerId) {
    try {
      verifications.push({
        source: 'Twilio',
        name: twilioCallerId
      })
    } catch (err) {
      console.log("Could not get verification info for ambassador: %s", err);
    }
  }

  let ekataReversePhone = await reverse_phone(phone);
  if (ekataReversePhone) {
    try {
      verifications.push({
        source: 'Ekata',
        name: ekataReversePhone.addOns.results.ekata_reverse_phone
      })
    } catch (err) {
      console.log("Could not get verification info for ambassador: %s", err);
    }
  }

  return verifications;
}

/** Throws if phone or email is invalid or duplicate. */
export async function assertUserPhoneAndEmail(modelName, phone, email, id = null, requireEmail = false) {
  if (phone) {
    if (!validatePhone(phone)) {
      throw new ValidationError("Our system doesn't understand that phone number. Please try again.");
    }

    if (!await validateUniquePhone(modelName, phone, id)) {
      throw new ValidationError(`That ${modelName} phone number is already in use. Email support@blockpower.vote for help. (E5)`);
    }
  }

  if (email || requireEmail) {
    if (!validateEmail(email)) {
      throw new ValidationError('Our records suggest that this email address may not be valid. ' +
        'Email support@blockpower.vote for help. (E7)');
    }

    if (!await validateUnique(modelName, { email }, id)) {
      throw new ValidationError(`That ${modelName} email address is already in use. Email support@blockpower.vote for help. (E6)`);
    }
  }

  return true;
}
