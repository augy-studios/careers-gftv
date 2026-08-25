/**
 * Careers@GFTV form submission webhook. Section 13 of the specification.
 *
 * One copy of this lives inside each job's Google Form, as a container bound
 * Apps Script. When somebody submits the form it posts three facts to the
 * portal — the response id, the respondent's email, and the timestamp — and the
 * portal marks that person's application as genuinely submitted.
 *
 * **The answers never leave Google.** This script reads the item responses only
 * to find an email address in a form that does not collect one automatically,
 * and nothing but the address is ever sent. That is a decision from section 10
 * and not an oversight: the portal holds no application content, and adding a
 * field here would quietly reverse it.
 *
 * Setup is in the root README of the careers-gftv repository, under "The
 * application form webhook". The short version:
 *
 *   1. Extensions, then Apps Script, on the form.
 *   2. Paste this file in.
 *   3. Project Settings, Script Properties: set PORTAL_SECRET and JOB_ID.
 *   4. Run installCareersTrigger once and authorise it.
 *
 * Triggers do not travel with a copied form, which is the whole reason
 * installCareersTrigger exists. Container bound *code* does travel, so keeping
 * one template form with this already inside it makes step 2 unnecessary for
 * every posting after the first.
 */

/** Where the portal is. Only ever change this for a preview deployment. */
var PORTAL_URL = 'https://careers.globalfurry.tv/api/webhooks/form-submit';

/**
 * Fires on every submission.
 *
 * Failures are logged and swallowed. A throw here would show the respondent
 * nothing — they have already submitted, and the form has already told them so
 * — but it would fill the script's execution log with red and, on some trigger
 * types, cause Google to mail whoever installed it. The portal is authoritative
 * about whether a submission was recorded, and an admin can link one by hand
 * from the analytics page if this ever fails silently.
 */
function onCareersFormSubmit(e) {
  var props = PropertiesService.getScriptProperties();

  var secret = props.getProperty('PORTAL_SECRET');
  var jobId = props.getProperty('JOB_ID');

  // Checked rather than assumed, because the failure is otherwise invisible:
  // without these the post goes out and is refused, and the only trace is a
  // 401 nobody reads. A copied template with the properties not yet filled in
  // is the ordinary way this happens.
  if (!secret || !jobId) {
    console.error(
      'Careers webhook: PORTAL_SECRET or JOB_ID is not set in Script Properties. ' +
        'Nothing was sent. See Project Settings, Script Properties.'
    );
    return;
  }

  var answers = {};
  e.response.getItemResponses().forEach(function (r) {
    answers[r.getItem().getTitle()] = r.getResponse();
  });

  var email =
    e.response.getRespondentEmail() || answers['Email'] || answers['Email address'] || '';

  if (!email) {
    // The portal refuses a delivery with no address, because it can never match
    // anybody and would sit in the unmatched list forever. Saying so here is the
    // only place somebody setting the form up will see it.
    console.error(
      'Careers webhook: this form collects no email address. Turn on "Collect email ' +
        'addresses" in the form settings, or add a question titled Email.'
    );
    return;
  }

  var payload = {
    job_id: jobId,
    form_response_id: e.response.getId(),
    email: email,
    submitted_at: e.response.getTimestamp().toISOString()
  };

  try {
    var response = UrlFetchApp.fetch(PORTAL_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-portal-secret': secret },
      payload: JSON.stringify(payload),
      // Without this a non-2xx throws, and the throw is what turns one bad
      // delivery into a mailbox full of failure notices. The portal answers 200
      // for everything except an authentication or validation failure, so a
      // non-200 here is genuinely worth reading.
      muteHttpExceptions: true
    });

    var code = response.getResponseCode();

    if (code !== 200) {
      console.error(
        'Careers webhook: the portal answered ' + code + '. ' + response.getContentText()
      );
      return;
    }

    // The portal says 200 both for "recorded" and for "recorded, and this was a
    // duplicate delivery", and also for a JOB_ID that names no posting. The last
    // of those is a setup mistake worth surfacing.
    var body = JSON.parse(response.getContentText());
    if (body && body.data && body.data.recorded === false) {
      console.error('Careers webhook: not recorded. ' + response.getContentText());
    }
  } catch (err) {
    console.error('Careers webhook: the request failed. ' + err);
  }
}

/**
 * Run once after copying the template form, then authorise it.
 *
 * Deletes any existing trigger for this handler first, so running it twice
 * leaves one trigger rather than two. Two triggers would mean two deliveries
 * per submission, which the portal deduplicates on the response id — so it
 * would be harmless and completely invisible, which is exactly why it is worth
 * preventing here.
 */
function installCareersTrigger() {
  var form = FormApp.getActiveForm();

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onCareersFormSubmit') ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('onCareersFormSubmit').forForm(form).onFormSubmit().create();

  console.log('Careers webhook: trigger installed for ' + form.getTitle());
}

/**
 * Check the setup without submitting the form.
 *
 * Not in the specification, and here because the alternative is testing a
 * posting's form by filling it in as if you were an applicant, which writes a
 * real response and a real analytics row against whoever is signed in. This
 * sends a delivery with an obviously fake response id and an address that
 * matches nobody, so it lands in the portal's unmatched list, proves the secret
 * and the URL are right, and can be ignored or linked to nothing.
 */
function testCareersWebhook() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('PORTAL_SECRET');
  var jobId = props.getProperty('JOB_ID');

  if (!secret || !jobId) {
    console.error('Careers webhook: PORTAL_SECRET or JOB_ID is not set.');
    return;
  }

  var response = UrlFetchApp.fetch(PORTAL_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-portal-secret': secret },
    payload: JSON.stringify({
      job_id: jobId,
      form_response_id: 'setup-test-' + Date.now(),
      email: 'setup-test@example.invalid',
      submitted_at: new Date().toISOString()
    }),
    muteHttpExceptions: true
  });

  console.log(
    'Careers webhook test: ' + response.getResponseCode() + ' ' + response.getContentText()
  );
}
