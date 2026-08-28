// GET /api/auth/applicant/magic?token=...
//
// The one tap sign in from section 15. The bot sends a button carrying this
// URL, the applicant presses it, and they land on the site signed in.
//
// **It is a full login, not a second factor**, which section 15 says outright
// and which decides everything else in this file. It creates a session on its
// own without a passkey, a code, or the challenge row from the password step,
// because the thing that authorised it was the password typed a moment earlier
// in the browser this link is bound to.
//
// **The binding is the whole security model.** A nonce is written into a cookie
// when the code is asked for and stored as a hash on the row; a link opened in
// any other browser matches nothing. That is what makes a forwarded message
// useless to whoever it was forwarded to, and it is the reason this can be a
// plain link at all.
//
// **A request carrying no nonce cookie does not spend the token.** Unfurlers,
// link checkers and mail scanners fetch URLs without cookies, and burning
// somebody's sign in before their thumb reached it would look exactly like a
// broken bot. The refusal is in api/_lib/telegram.js, where the reasoning sits
// beside the query that would otherwise do the spending.
//
// **This is a GET that changes state, deliberately.** A link in a chat message
// is a GET or it is not a link. What that costs is handled rather than ignored:
// the token is single use, it lasts five minutes, it is bound to one browser,
// and a fetch without the binding leaves it untouched. HEAD is not offered for
// the same reason, and it is the second deliberate exception to the rule phase 4
// left behind: a HEAD here would be a request to sign somebody in with the
// answer thrown away.
//
// It answers a redirect rather than JSON. Nothing fetches this; a person
// arrives at it with a whole browser, and the honest response is the page they
// were trying to reach.

import { methodNotAllowed } from '../../_lib/respond.js';
import { consumeMagicLink } from '../../_lib/telegram.js';
import { supabase, T } from '../../_lib/supabase.js';
import { createApplicantSession } from '../../_lib/session.js';
import { readCookie, clearCookie, COOKIE } from '../../_lib/cookies.js';
import { isFeatureOff } from '../../_lib/maintenance.js';
import {
  LIMITS,
  limited,
  recordFailures,
  subjectForIp,
} from '../../_lib/rate-limit.js';

/** Where a refusal sends them, with a reason the sign in page can read. */
const LOGIN = '/login';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET'])) return;

  // 8.12's guard, and the switch is telegram_2fa rather than telegram_link:
  // this is the sign in half, and an admin turning the second factor off has to
  // close the door this link goes through too.
  //
  // `isFeatureOff` rather than the shared `unavailable`, which answers with a
  // JSON error. Every other route in this build is called by a fetch and a JSON
  // 503 is the right answer there; this one is opened by a person pressing a
  // button in a chat, and showing them a page of JSON is not an answer at all.
  if (await isFeatureOff('telegram_2fa')) {
    return redirect(res, `${LOGIN}?magic=off`);
  }

  const url = new URL(req.url ?? '', 'http://localhost');
  const token = url.searchParams.get('token') ?? '';

  // Per address only. There is no account to key on until the token resolves,
  // and the token itself is the secret being guessed.
  const subjects = [subjectForIp(req)];
  if (await limited(res, 'applicant_2fa', subjects)) return;

  try {
    const nonce = readCookie(req, COOKIE.magicLinkNonce);
    const outcome = await consumeMagicLink(token, nonce);

    if (!outcome.ok) {
      // A missing nonce is not a failed attempt. It is almost always something
      // that is not a person, and counting it would let a busy unfurler lock a
      // shared address out of its own sign in.
      if (outcome.reason !== 'no_nonce') {
        await recordFailures('applicant_2fa', subjects, LIMITS.twoFactor);
      }
      return redirect(res, `${LOGIN}?magic=${outcome.reason}`);
    }

    // The link stands on its own, and the challenge row is still the record of
    // what was asked for at the password step. Reading it back is what carries
    // "stay signed in for 30 days" across to this session; without it a one tap
    // sign in would quietly ignore a box they ticked one screen earlier.
    const { data: challenge } = await supabase
      .from(T.loginChallenges)
      .select('id, stay_signed_in')
      .eq('user_id', outcome.applicantId)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (challenge) {
      await supabase.from(T.loginChallenges).delete().eq('id', challenge.id);
    }

    await createApplicantSession(
      res,
      outcome.applicantId,
      challenge?.stay_signed_in === true
    );

    // Spent, and the cookie with it. Nothing about this sign in is repeatable.
    clearCookie(res, COOKIE.magicLinkNonce);

    // No trusted device is recorded here, ever. 5d says trust is only offered
    // once the second factor has been satisfied and never on the password
    // screen, and a link tapped in a chat is not somebody deciding anything
    // about the browser it opens in.
    return redirect(res, '/account');
  } catch (cause) {
    console.error('[careers-gftv] magic link:', cause);
    return redirect(res, `${LOGIN}?magic=error`);
  }
}

function redirect(res, location) {
  // no-store on the way out as well as the way in. A cached 302 from a URL that
  // has already been spent is a browser insisting it can sign somebody in.
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Location', location);
  res.statusCode = 303;
  res.end();
}
