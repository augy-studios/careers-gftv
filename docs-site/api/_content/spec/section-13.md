---
title: 13. Google Apps Script submission webhook
access: developer
order: 16
summary: Build this.
---

# 13. Google Apps Script submission webhook

Build this. It is a small amount of code and it turns `did_apply` from a self reported claim into a recorded fact. The handoff modal in 7c stays exactly as specified, since not every submission will be matched, but the webhook becomes the authoritative source when the two disagree.

### What it does

An Apps Script bound to each job's Google Form fires on submit and posts the respondent's email, the job id, and the response id to the portal. The portal matches the email to a `gftvjobs_users` row and marks the application as genuinely submitted.

Only the email, the response id, and the timestamp are sent. The answers themselves never leave Google, which keeps the portal free of application content exactly as decided in section 10.

### Portal side

Add a table:

- `gftvjobs_form_submissions`: id uuid pk, job_id references `gftvjobs_jobs`, form_response_id text not null, email text not null, submitted_at timestamptz not null, matched_applicant_id uuid references `gftvjobs_users` on delete set null, received_at timestamptz default now(). Unique constraint on (job_id, form_response_id) so a retried delivery is idempotent.

Add `POST api/webhooks/form-submit`, enabled by default:

1. Compare the `x-portal-secret` header against `FORM_WEBHOOK_SECRET` using a timing safe comparison. Return 401 on mismatch and log nothing sensitive.
2. Validate the payload shape. Return 400 on anything malformed.
3. Insert into `gftvjobs_form_submissions`. If the unique constraint fires, return 200 and stop, since that is a duplicate delivery, not an error.
4. Look up `gftvjobs_users` by email, case insensitively.
5. On a match: set the applicant's most recent `gftvjobs_analytics` row for that job, pending or already resolved to No or timeout, to `did_apply` true, `response_state` answered, and record that the source was the webhook rather than the applicant. Move the `gftvjobs_applications` tracking row to `submitted`, set `applied_at` and `cooldown_until` per 7f if they are not already set, and write an event row attributing the change to the webhook. If no analytics row exists, because they reached the form by a shared link, create the tracking row anyway.
6. On no match: leave `matched_applicant_id` null and surface the row in the admin analytics page under an "unmatched submissions" list, so an admin can link it by hand. Someone applying with a different email than they registered with is the normal cause.
7. Always return 200 for anything that is not an auth or validation failure. Apps Script retries are noisy and a 500 helps nobody.
8. Rate limit the endpoint and cap the payload size.

`answer_source` on `gftvjobs_analytics` records what produced the answer, so the admin analytics page can show how much of the funnel is self reported versus confirmed. A webhook confirmation overrides an earlier No or a timeout, since a recorded submission beats silence or a misclick.

### Form side

One script per form, pasted into Extensions then Apps Script on the Google Form:

```javascript
// Set PORTAL_SECRET and JOB_ID in Project Settings, Script Properties.
function onCareersFormSubmit(e) {
  const props = PropertiesService.getScriptProperties();
  const answers = {};
  e.response.getItemResponses().forEach(function (r) {
    answers[r.getItem().getTitle()] = r.getResponse();
  });

  const payload = {
    job_id: props.getProperty('JOB_ID'),
    form_response_id: e.response.getId(),
    email: e.response.getRespondentEmail() || answers['Email'] || answers['Email address'] || '',
    submitted_at: e.response.getTimestamp().toISOString()
  };

  UrlFetchApp.fetch('https://careers.globalfurry.tv/api/webhooks/form-submit', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-portal-secret': props.getProperty('PORTAL_SECRET') },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

// Run once after copying the form.
function installCareersTrigger() {
  const form = FormApp.getActiveForm();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onCareersFormSubmit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onCareersFormSubmit').forForm(form).onFormSubmit().create();
}
```

### The setup cost, stated plainly

The code is short. The friction is that a form submit trigger is per form, so every new posting means a small setup step. Keep it to about two minutes:

- Maintain one template form with the script already inside it. Container bound scripts travel with a form copy, so copying the template carries the code over. Triggers do not copy, which is why `installCareersTrigger` exists as a one time run.
- Per new job: copy the template, edit the questions, set `JOB_ID` in Script Properties to the posting uuid, run `installCareersTrigger` once, authorise it.
- Put this checklist in the admin job editor as collapsible help text next to the Google Form URL field, with the posting uuid shown and a copy button, so nobody has to go hunting for it.

### Fallbacks

- If the webhook is never installed on a given form, nothing breaks. That posting simply relies on the applicant's own yes or no answer, and the admin analytics page marks its numbers as self reported.
- Add an admin action to manually mark a tracking row as submitted, for the unmatched-email case.
- Document the whole setup in the root README, including how to rotate `FORM_WEBHOOK_SECRET`.
