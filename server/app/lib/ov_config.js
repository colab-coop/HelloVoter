/*
 *
 * This const object is built from the .env file, using the getConfig function, which takes the env var name
 *   as the first argument, then whether or not the var is required, then the default value if the env var
 *   is missing from the .env file
 *
 * NOTE: if you add an env var to the .env file, you MUST provide it here if it is to be used via ov_config,
 *   as is the standard on this project.
 *
 */
import dotenv from "dotenv"
import {getConfig} from "./common"

dotenv.config()

export const ov_config = {
  server_port: getConfig("server_port", false, 8080),
  server_ssl_port: getConfig("server_ssl_port", false, 8443),
  server_ssl_key: getConfig("server_ssl_key", false, null),
  server_ssl_cert: getConfig("server_ssl_cert", false, null),
  ip_header: getConfig("client_ip_header", false, null),
  neo4j_protocol: getConfig("neo4j_protocol", false, "bolt"),
  neo4j_host: getConfig("neo4j_host", false, "localhost"),
  neo4j_port: getConfig("neo4j_port", false, 7687),
  neo4j_user: getConfig("neo4j_user", false, "neo4j"),
  neo4j_password: getConfig("neo4j_password", false, "hellovoter"),
  neo4j_enterprise: getConfig("neo4j_enterprise", false, false),
  neo4j_jmx_port: getConfig("neo4j_jmx_port", false, 9999),
  neo4j_jmx_user: getConfig("neo4j_jmx_user", false, "monitor"),
  neo4j_jmx_pass: getConfig("neo4j_jmx_pass", false, "Neo4j"),
  enable_geocode: getConfig("enable_geocode", false, false),
  disable_jmx: getConfig("disable_jmx", false, false),
  disable_apoc: getConfig("disable_apoc", false, false),
  disable_spatial: getConfig("disable_spatial", false, false),
  job_concurrency: parseInt(getConfig("job_concurrency", false, 1)),
  jwt_pub_key: getConfig("jwt_pub_key", false, null),
  jwt_aud: getConfig(
    "jwt_aud",
    false,
    process.env.NODE_ENV === "production" ? null : "gotv.ourvoiceusa.org",
  ),
  client_base_uri: getConfig(
    'client_base_uri',
    false,
    process.env.NODE_ENV === 'production' ? 'https://blockpower.vote' :
      (process.env.NODE_ENV === 'staging' ? 'https://stage2.app.blockpower.vote/blockpower' : 'http://localhost:3000')
  ),
  jwt_iss: getConfig("jwt_iss", false, "ourvoiceusa.org"),
  twilio_disable: getConfig("twilio_disable", false, false),
  twilio_account_sid: getConfig("twilio_account_sid", true, null),
  twilio_auth_token: getConfig("twilio_auth_token", true, null),
  twilio_from: getConfig("twilio_from", true, null),
  twilio_support_proxy_response: getConfig("twilio_support_proxy_response", false, false),
  google_maps_key: getConfig("google_maps_key", false, null),
  sm_oauth_url: getConfig("sm_oauth_url", false, "https://ws.ourvoiceusa.org/auth"),
  no_auth: getConfig("react_app_no_auth", false, false),
  volunteer_add_new: getConfig("volunteer_add_new", false, null),
  purge_import_records: getConfig("purge_import_records", false, null),
  wabase: getConfig("wabase", false, "https://apps.ourvoiceusa.org"),
  DEBUG: getConfig("debug", false, false),
  payout_stripe: getConfig("payout_stripe", false, false),
  payout_paypal: getConfig("payout_paypal", false, false),
  payout_per_tripler: getConfig("payout_per_tripler", true, 0),
  plaid_client_id: getConfig("plaid_client_id", true, null),
  plaid_secret: getConfig("plaid_secret", true, null),
  plaid_public_key: getConfig("plaid_public_key", true, null),
  plaid_environment: getConfig("plaid_environment", true, null),
  stripe_secret_key: getConfig("stripe_secret_key", true, null),
  paypal_environment: getConfig("paypal_environment", true, null),
  paypal_client_id: getConfig("paypal_client_id", true, null),
  paypal_client_secret: getConfig("paypal_client_secret", true, null),
  organization_name: getConfig("organization_name", false, "unknown org name"),
  ambassador_landing_page: getConfig("ambassador_landing_page", true, null),
  business_url: getConfig("business_url", true, null),
  ambassador_approved_message: getConfig("ambassador_approved_message", true, null),
  ambassador_signup_message: getConfig("ambassador_signup_message", true, null),
  stress_testing: getConfig("stress_testing", false, false),
  log_requests: getConfig("log_requests", false, false),
  log_request_max_body_length: getConfig("log_request_max_body_length", false, 1000),
  make_admin_api: getConfig("make_admin_api", false, false),
  tripler_confirmation_message: getConfig("tripler_confirmation_message", true, null),
  tripler_reminder_message: getConfig("tripler_reminder_message", true, null),
  tripler_reconfirmation_message: getConfig("tripler_reconfirmation_message", true, null),
  rejection_sms_for_tripler: getConfig("rejection_sms_for_tripler", true, null),
  rejection_sms_for_ambassador: getConfig("rejection_sms_for_ambassador", true, null),
  voting_plan_sms_for_ambassador: getConfig("voting_plan_sms_for_ambassador", false, ""), // optional so we can turn this on in staging, off in production
  voting_plan_sms_for_tripler: getConfig("voting_plan_sms_for_tripler", false, ""), // optional so we can turn this on in staging, off in production
  ambassador_tripler_relation_max_distance: getConfig(
    "ambassador_tripler_relation_max_distance",
    false,
    10000,
  ),
  suggest_tripler_limit: getConfig("suggest_tripler_limit", false, 1000),
  claim_tripler_limit: getConfig("claim_tripler_limit", false, 12),
  needs_additional_1099_data_tripler_disbursement_limit: getConfig("needs_additional_1099_data_tripler_disbursement_limit", false, 45000), // in cents
  payout_schedule: getConfig("payout_schedule", false, 60),
  fifo_wakeup: getConfig("fifo_wakeup", false, 300),
  disable_auto_payouts: getConfig("disable_auto_payouts", true, false),
  disable_emails: getConfig("disable_emails", false, false),
  smtp_service: getConfig("smtp_service", true, null),
  smtp_from: getConfig("smtp_from", true, null),
  smtp_user: getConfig("smtp_user", true, null),
  smtp_password: getConfig("smtp_password", true, null),
  smtp_server: getConfig("smtp_server", true, null),
  smtp_use_tls: getConfig("smtp_use_tls", true, null),
  smtp_port: getConfig("smtp_port", true, null),
  admin_emails: getConfig("admin_emails", false, null),
  new_ambassador_signup_admin_email_subject: getConfig(
    "new_ambassador_signup_admin_email_subject",
    false,
    "Ambassador signed up",
  ),
  new_ambassador_signup_admin_email_body: getConfig(
    "new_ambassador_signup_admin_email_body",
    false,
    "",
  ),
  tripler_confirm_admin_email_subject: getConfig(
    "tripler_confirm_admin_email_subject",
    false,
    "Tripler confirmed",
  ),
  tripler_confirm_admin_email_body: getConfig("tripler_confirm_admin_email_body", false, ""),
  disable_upgrade_sms: getConfig("disable_upgrade_sms", false, false),
  upgrade_sms_waiting_period: getConfig("upgrade_sms_waiting_period", true, null),
  upgrade_sms_schedule: getConfig("upgrade_sms_schedule", false, null),
  tripler_upgrade_message: getConfig("tripler_upgrade_message", true, null),
  wordpress_landing: getConfig("wordpress_landing", true, null),
  allowed_states: getConfig("allowed_states", true, []),
  tripler_confirmed_ambassador_notification: getConfig(
    "tripler_confirmed_ambassador_notification",
    true,
    null,
  ),
  first_reward_payout: getConfig("first_reward_payout", true, 0),
  // This should be a pipe delimited list of strings
  blocked_carriers: getConfig("blocked_carriers", false, ""),
  ekata_api_key: getConfig("ekata_api_key", false, null),
  ekata_addon: getConfig("ekata_addon", false, null),

  ambassadorEkataThreshold: parseInt(getConfig("ambassador_ekata_threshold", false, 1)),
  ambassadorEkataPenalty: parseInt(getConfig("ambassador_ekata_penalty", false, 2)),
  triplerEkataPenalty: parseInt(getConfig("tripler_ekata_penalty", false, 1)),
  triplerEkataBonus: parseInt(getConfig("tripler_ekata_bonus", false, 2)),

  exclude_unreg_except_in: getConfig("exclude_unreg_except_in", false, ""),
  search_tripler_max_distance: getConfig("search_tripler_max_distance", false, 150000),
  payout_batch_size: getConfig("payout_batch_size", false, 100),
  payout_cron_string: getConfig("payout_cron_string", false, "*/60 * * * *"),
  upgrade_sms_cron_string: getConfig("upgrade_sms_cron_string", false, "*/60 * * * *"),
  twilio_msg_svc_sid: getConfig("twilio_msg_svc_sid", false, null),
  neo4j_encryption: getConfig("neo4j_encryption", false, "ON"),
  hubspot_api_key: getConfig("hubspot_api_key", false, ""),
  // Alloy
  alloy_key: getConfig("alloy_key", true, ""),
  alloy_secret: getConfig("alloy_secret", true, ""),
  alloy_bypass_keyword: getConfig("alloy_bypass_keyword", false, ""),

  // Voting plan links
  short_link_base_url: getConfig(
    "short_link_base_url", false, "blockpower.vote"
  ).replace(/\/*$/, '')
}
