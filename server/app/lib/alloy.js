import {ov_config} from "./ov_config"
import axios from "axios"
import {internationalNumber} from "./normalizers"

/*
 *
 * verifyAlloy()
 *
 * this function simply provides the alloy id and to see if the account already exists and is approved
 * to allow user to be an ambassador.
 *
 */
export async function verifyAlloy(first_name, last_name, address, city, state, zip, birth_date) {
  let alloyKey = ov_config.alloy_key
  let alloySecret = ov_config.alloy_secret

  console.log(
    `[ALLOY] Calling API with: ${first_name} ${last_name} ${address} ${city} ${state} ${zip} ${birth_date}`,
  )

  try {
    let response
    if (alloyKey && alloySecret) {
      response = await axios.get(
        `https://api.alloy.us/v1/verify?first_name=${first_name}&last_name=${last_name}&address=${address}&city=${city}&state=${state}&zip=${zip}&birth_date=${birth_date}`,
        {
          auth: {
            username: alloyKey,
            password: alloySecret,
          },
        },
      )
    }
    return response.data
  } catch (err) {
    console.log(`[ALLOY] Lookup failed with error ${err}`)
    return null
  }
}

/*
 *
 * fuzzyAlloy()
 *
 * A fuzzy search of Alloy
 *
 */
export async function fuzzyAlloy(first_name, last_name, state, zip) {
  let alloyKey = ov_config.alloy_key
  let alloySecret = ov_config.alloy_secret

  console.log(`[ALLOY] Calling Fuzzy API with: ${first_name} ${last_name} ${state} ${zip}`)

  try {
    let response
    if (alloyKey && alloySecret) {
      response = await axios.get(
        `https://api.alloy.us/v1/search?first_name=${first_name}&last_name=${last_name}&state=GA&zip=${zip}`,
        {
          auth: {
            username: alloyKey,
            password: alloySecret,
          },
        },
      )
    }
    return response.data.total
  } catch (err) {
    console.log(`[ALLOY] Fuzzy Search failed with error ${err}`)
    return null
  }
}
