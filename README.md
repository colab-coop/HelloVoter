## Introduction
Welcome to the BlockPower Voting Ambassador Platform project!  BlockPower is a nonprofit focused on increasing voter turnout among Black citizens who don't vote regularly. BlockPower pays people in majority-Black neighborhoods to be "Voting Ambassadors" and talk with their friends, family members, and neighbors about the importance of voting. A Voting Ambassadors asks these friends, family members and neighbors to become "Vote Triplers" who will, in turn, remind 3 other people in their community to vote.

This software platform enables Voting Ambassadors to find people they know in the database to text them through the platform about their commitment to be a Vote Tripler, and to receive payments for affirmative responses from their Vote Triplers.  A simple sign-up form leads to the dashboard, where a Voting Ambassador can get started looking for people they know in the database. By default, the Voting Ambassador will be shown a list of people in their area (within a configurable number of meters from the Ambassador). This distance is calculated via the Neo4J apoc.distance function, using the Point data type either imported from CSV in the case of a Vote Tripler, or pulled from an external API (census.gov) in the case of Voting Ambassadors.  Voting Ambassadors can also find people they know in the list by setting a variety of search filters, including first and last name, phone number, metro area, age, gender and proximity. The Voting Ambassador can then "claim" a tripler by selecting one or more from the list. If a Vote Tripler is already claimed, no other Voting Ambassadors will see them in their lists going forward and therefore cannot claim an already claimed Vote Tripler.

Once the Ambassador has "claimed" one or more Vote Triplers, they can contact these Vote Triplers via standardized text (via a pool of Twilio longcodes) through the platform . The text will follow up with the Vote Tripler, prompting a confirmation from the Vote Tripler that they will remind 3 others to vote.  If that Vote Tripler responds "Yes" to the SMS, the system will record a pending payment for the Voting Ambassador. There is a maximum number of Vote Triplers each ambassador can claim that is configurable, as is payment amount. Voting Ambassadors can go through a simple process via Plaid-Link to login to their bank account and link it to the platform for payments via Stripe Connected Account (PayPal as another option to receive payments is coming soon).

Also see the [CONTRIBUTING](/CONTRIBUTING.md) document for more background and a technical overview.

### Frontend

A Vote Ambassador signs up with and interacts mainly with the React front-end. The front-end code can be found here: [hello-voter](https://github.com/colab-coop/hello-voter). 

### Admin-ui

This software also has the concept of "admin", an Ambassador account which is empowered to block Ambassadors, make another Ambassador an admin, and download CSV data reports of Ambassadors and their claimed Triplers.

The admin panel can be found here: [https://github.com/colab-coop/HelloVoter-admin-ui](https://github.com/colab-coop/HelloVoter-admin-ui).

## Development

### Prerequisites

- Node (we are using 12.18.2 in production). We recommend installing via [Node Version Manager](https://github.com/nvm-sh/nvm#installing-and-updating).
- [Docker](https://docs.docker.com/desktop/) is required to get the database running.

### Installation

1. Copy `.env.example` to `.env` and modify as needed: `cp server/.env.example server/.env`
1. If you use nvm, run 'nvm use' to install the right version of node
1. Install dependencies: `npm install`
1. Setup the database: `npm run database`
1. (optional) Seed the database with fake data: `(cd server && npm run seed:fresh)`
1. Start the server: `npm start`

### Usage

After following the steps above,
1. The API will be available at <http://localhost:8080/api/v1/>
1. The Neo4j Browser will be available at <http://localhost:7474/browser/>
    - Username `neo4j`, default password `hellovoter`
    - Example query to see all data: `MATCH (n) RETURN n`

For local development without requiring real OAuth:
1. Set `REACT_APP_NO_AUTH=1`
1. Modify an Ambassador to work with a mock Authorization token: `MATCH (a:Ambassador {admin: true}) SET a.external_id = "noauth:localuser"`
1. Use this Bearer token when making requests: `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Im5vYXV0aDpsb2NhbHVzZXIiLCJuYW1lIjoiTG9jYWwgVXNlciIsImVtYWlsIjoibG9jYWxAbG9jYWxob3N0IiwiaXNzIjoib3Vydm9pY2V1c2Eub3JnIiwiaWF0IjoxLCJleHAiOjIsImRpc2NsYWltZXIiOiJCbGFoIGJsYWggZGlzY2xhaW1lciJ9.qa5K2pgi1uLYkV7jP3aNvazcchvgBD8RwhdG6Q86GxlvusQx7nNCTr3LrAnn6pxDJxNidJoqjD3Ie77jj5hWK_-lbgtHMLhNXGExDxI8pQ0I5ZnAV_5pDu7vARinoy3mctQWFO2pIQSu8KzQc7eQ90IQZBseE7nQV-ugZRfK8Teo_48COcJxGxqwCNCO80G_JzBoif2xaWRb2i2n0qeSUKfXN4Fwy46JOiHFnL9yOS5s54tB6doe1wFJNYps8eVQbVkTBL1I9PQP4Gs-BmzND0vcQaczTdu_J50uvLL5do1FHb48lRhrA44ZrYv3EVwNsJXZtH3MbasxgPrZhl69VQ`

### Debugging

1. See hellovoter.log for output: `less +F server/hellovoter.log`

## Production Deployment

Note the deployment branch for the api is "ambassador", with tagged releases.

We (CoLab) are currently using an AWS cluster to deploy all of this code (api, frontend, and admin-ui). We use an Ansible playbook to provision the servers. We point the servers to a Neo4J database hosted at Graphene. The frontend is also hosted on an AWS server in the cluster, also using an Ansible playbook. We have CircleCI workflows implemented for deployment.

You are, of course, free to deploy in any way you wish, but we have not attempted any other deployment configuration so YMMV.

## License

	Software License Agreement (AGPLv3+)

	Copyright (c) 2020, Our Voice USA. All rights reserved.

        This program is free software; you can redistribute it and/or
        modify it under the terms of the GNU Affero General Public License
        as published by the Free Software Foundation; either version 3
        of the License, or (at your option) any later version.

        This program is distributed in the hope that it will be useful,
        but WITHOUT ANY WARRANTY; without even the implied warranty of
        MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
        GNU Affero General Public License for more details.

        You should have received a copy of the GNU Affero General Public License
        along with this program; if not, write to the Free Software
        Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301, USA.

**NOTE:** We relicense the mobile app code for the purposes of distribution on the App Store. For details, read our [CLA Rationale](CLA-Rationale.md)

Logos, icons, and other artwork depicting the Our Voice bird are copyright and not for redistribution without express written permission by Our Voice USA.

## .env file

The server requires a `.env` file to exist in the /server directory. This file controls the configuration of the api.

The meaning of each config item is as follows:

* `SERVER_PORT`: Port for node to listen on for http requests.
* `NEO4J_PROTOCOL`: Protocol for talking to neo4j.
* `NEO4J_HOST`: Hostname of your neo4j server.
* `NEO4J_PORT`: Port number of your neo4j server.
* `NEO4J_USER`: Username to use to connect to neo4j.
* `NEO4J_PASSWORD`: Password to use to connect to neo4j.
* `NEO4J_ENTERPRISE`: Flag to enable enterprise features in neo4j.
* `NEO4J_JMX_PORT`: The port on your `NEO4J_HOST` that exposes JMX. This port isn't exposed by default by Neo4j. See "Neo4j Configuration" below for how to set this up on the database side.
* `NEO4J_JMX_USER`: Username to use to connect to neo4j jmx.
* `NEO4J_JMX_PASS`: Password to use to connect to neo4j jmx.
* `ENABLE_GEOCODE`: Allow import of data that doesn't have longitude/latitude
* `DISABLE_JMX`: Don't attempt to connect to neo4j jmx.
* `DISABLE_APOC`: Don't use the neo4j apoc plugin. This limits data import functionality.
* `DISABLE_SPATIAL`: Don't use the neo4j spatial plugin. This limit turf functionality.
* `IP_HEADER`: Name of the header to check for, if you're behind an http reverse proxy and want to deny direct http requests.
* `GOOGLE_MAPS_KEY`: API Key for Google maps. Get one here: https://developers.google.com/maps/documentation/javascript/get-api-key
* `JOB_CONCURRENCY`: Number of import jobs that can run in parallel. This is only relevant if you're using Neo4j Enterprise Edition, as Community Edition is limited to 4 CPUs, and the minimum CPUs required for parallel jobs is 6.
* `SM_OAUTH_URL`: URL of the oauth provider.
* `JWT_PUB_KEY`: Path to the public key of the oauth provider.
* `WABASE`: URL of the HelloVoterHQ react application.
* `AUTOENROLL_FORMID`: The ID of the form new volunteers get auto-enrolled in with autoturf set so they can go right into the map with data, no approval needed. We use this for our demo server. You probably don't want to set this.
* `VOLUNTEER_ADD_NEW`: Whether or not volunteers can add new addresses & people that don't exist in the database.
* `PURGE_IMPORT_RECORDS`: By default, import records are kept in the database, so you can trace where things came from. For larger operations (>20 million), we recommend setting this to `1` as otherwise the speed of data imports will be significantly impacted.
* `DEBUG`: Whether or not cypher and other debugging info is sent to the console log.
* `PAYOUT_STRIPE`: Whether or not stripe is supported as a payout method.
* `PAYOUT_PAYPAL`: Whether or not paypal is supported as a payout method.
* `PAYOUT_PER_TRIPLER`: Amount in cents to be disbursed to the ambassador for every confirmed tripler.
* `PLAID_CLIENT_ID`: The client ID from your Plaid developer account. Needed for ambassador payouts.
* `PLAID_SECRET`: The secret from your Plaid developer account. Needed for ambassador payouts.
* `PLAID_PUBLIC_KEY`: The public key from your Plaid developer account. Needed for ambassador payouts.
* `PLAID_ENVIRONMENT`: The environment plaid is running in, can be sandbox, development or production.
* `STRIPE_SECRET_KEY`: The secret key from your Stripe developer account. Needed for ambassador payouts.
* `PAYPAL_ENVIRONMENT`: The environment paypal is running in, can be sandbox, development or production.
* `PAYPAL_CLIENT_ID`: The client ID from your Paypal developer account. Needed for ambassador payouts.
* `PAYPAL_CLIENT_SECRET`: The secret key from your Paypal developer account. Needed for ambassador payouts.
* `TWILIO_DISABLE`: Setting it to true will disable twilio.
* `TWILIO_ACCOUNT_SID`: SID of twilio account.
* `TWILIO_AUTH_TOKEN`: Auth token of twilio account.
* `TWILIO_FROM`: Number to send SMSes from.
* `TWILIO_SUPPORT_PROXY_RESPONSE`: Support proxy messages for development; message and proxy number separated by =>. For example: yes=>+1 111-111-1111
* `ORGANIZATION_NAME`: The name of the org
* `AMBASSADOR_LANDING_PAGE`: Link to the webpage where ambassador lands after approval, this is sent in SMS
* `BUSINESS_URL`: URL of the business running the platform or url of the organization; used in stripe while creating connect accounts
* `AMBASSADOR_APPROVED_MESSAGE`: The SMS message when an ambassador is approved
* `AMBASSADOR_SIGNUP_MESSAGE`: The SMS message when an ambassador signs up
* `TRIPLER_REMINDER_MESSAGE`: The SMS message when a tripler is reminded
* `TRIPLER_CONFIRMATION_MESSAGE`: The SMS message when a tripler begins confirmation process
* `TRIPLER_RECONFIRMATION_MESSAGE`: The SMS message when a tripler responds to other than YES or NO in response to confirmation message
* `LOG_REQUESTS`: If set to true, enable request/response body logging
* `LOG_REQUEST_MAX_BODY_LENGTH`: Maximum number of characters logged during request/response logging, default set to 1000
* `MAKE_ADMIN_API`: Flag to enable `PUT /admin` api which makes an ambassador amin, default set to false
* `AMBASSADOR_TRIPLER_RELATION_MAX_DISTANCE`: Distance in meters to decide if a tripler can be suggested to ambassador, default set to 10000
* `SUGGEST_TRIPLER_LIMIT`: Maximum number of triplers returned by suggest-triplers api, default set to 1000
* `CLAIM_TRIPLER_LIMIT`: Maximum number of triplers an ambassador can claim (unless overridden by the claim_tripler_limit property on the ambassador), default set to 12
* `PAYOUT_SCHEDULE`: Payout schedule in minutes, default set to 60 minutes
* `FIFO_WAKEUP`: FIFO queue wakeup/sleep interval in milliseconds, default set to 300 msec
* `DISABLE_AUTO_PAYOUTS`: Disable automatic payouts
* `DISABLE_JMX`: Disable JMX check from startup
* `DISABLE_EMAILS`: Disable email notifications
* `SMTP_SERVICE`: Name of the SMTP service being used
* `SMTP_FROM`: Email from which emails are to be sent
* `SMTP_USER`: User name for authorizing with SMTP server
* `SMTP_PASSWORD`: Password for authorizing with SMTP server
* `SMTP_SERVER`: Address of SMTP server
* `SMTP_USE_TLS`: Set to true if SMTP server supports secure connections
* `SMTP_PORT`: Port at which SMTP server is listening for connections
* `ADMIN_EMAILS`: Comma separated list of admin emails
* `NEW_AMBASSADOR_SIGNUP_ADMIN_EMAIL_SUBJECT`: Subject of the email sent to admins when new ambassador signs up
* `NEW_AMBASSADOR_SIGNUP_ADMIN_EMAIL_BODY`: Body of the email sent to admins when new ambassador signs up
* `TRIPLER_CONFIRM_ADMIN_EMAIL_SUBJECT`: Subject of the email sent to admins when a tripler confirms
* `TRIPLER_CONFIRM_ADMIN_EMAIL_BODY`: Body of the email sent to admins when a tripler confirms
* `DISABLE_UPGRADE_SMS`: Flag to disable the tripler upgrade sms background job
* `UPGRADE_SMS_WAITING_PERIOD`: The time interval (in minutes)
* `UPGRADE_SMS_SCHEDULE`: The time interval (in minutes) where the tripler upgrade sms background job fires
* `TRIPLER_UPGRADE_MESSAGE`: The SMS message when a tripler responds YES, informing them that they are eligible to become Voter Ambassadors
* `WORDPRESS_LANDING`: The URL for the landing page for when a Tripler wants to upgrade to Ambassador
* `ALLOWED_STATES`: A comma-separated list of 2-letter US state codes that determine which addresses are valid for ambassador signups
* `TRIPLER_CONFIRMED_AMBASSADOR_NOTIFICATION`: The SMS message that gets sent to the ambassador when one of their triplers is confirmed.
* `BLOCKED_CARRIERS`: A pipe-delimited list of carrier strings in order to block fraudulent phone numbers.
* `EKATA_API_KEY`: API key used for reverse phone lookup API from [Ekata.com](https://ekata.com/developer/documentation/api-overview/#tag/Reverse-Phone-API).
* `EKATA_ADDON`: If Ekata is available as a Twilio add-on, set this to true.
* `REJECTION_SMS_FOR_TRIPLER`: The SMS message that the tripler receives when they reply 'no' to the system.
* `REJECTION_SMS_FOR_AMBASSADOR`: The SMS message that the ambassador receives when one of their triplers replies 'no' to the system.
* `STRESS_TESTING`: If set to true, this allows the client to sign in as any external ID, without authentication.  Never set this in production!
* `EXCLUDE_UNREG_EXCEPT_IN`: Exclude unregistered voters except in these comma-separated 2-char states.
* `SEARCH_TRIPLER_MAX_DISTANCE`: Distance constraint on tripler search
* `PAYOUT_BATCH_SIZE`: How many payouts to attempt per job
* `PAYOUT_CRON_STRING`: Define the payout cron job
* `UPGRADE_SMS_CRON_STRING`: Define the upgrade sms cron job
* `TWILIO_MSG_SVC_SID`: The SID for the Twilio messaging service
* `NEO4J_ENCRYPTION`: Whether or not the neo4j encryption is enabled
* `HUBSPOT_API_KEY`: The API key for HubSpot
* `ALLOY_KEY`: The API key for Alloy Verify API
* `ALLOY_SECRET`: The API secret for Alloy Verify API
* `ALLOW_BONUS`: Defines if we are allowing upgrade bonus payments for triplers who upgrade to become ambassadors (upgrades identified by matching phone numbers
