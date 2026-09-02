// GET  /api/auth/staff/recovery-codes   how many are left in each set
// POST /api/auth/staff/recovery-codes   generate one set, shown once
//
// The staff realm's two code sets, per 5g. It is the applicant realm's
// recovery-codes route against two different tables, which is what 5g asks for
// in its opening sentence: staff codes work "exactly as 5c describes for
// applicants".
//
//   recovery  gftvjobs_staff_recovery_codes, from migration 038. **This
//             build's own table.** Gets past the password, on the staff forgot
//             password flow, and nowhere else.
//   backup    gftvhello_backup_codes. **Not this build's table.** Gets past the
//             second factor, and it is one of the four things section 2 permits
//             this project to write because the login flow already owns it.
//
// **The two are never interchangeable**, and 5g says why in one sentence: "a
// code lying in a chat log must not be able to do both". They are two tables
// rather than one with a purpose column so that is enforced by the schema, and
// accounts.js is the only place a name is mapped onto a table.
//
// **Regenerating the backup set reaches gftv.asia**, because that table is
// shared with it. The page says so beside that button and not beside the other
// one, which is the sort of distinction a single "these are shared" sentence at
// the top of a page would lose.

import { ok, fail, ERR, methodNotAllowed, readJson, failInternal } from '../../_lib/respond.js';
import { requireStaff } from '../../_lib/session.js';
import { auditStaff, AUDIT } from '../../_lib/audit.js';
import { FIELD } from '../../_lib/validate.js';
import {
  generateCodeSet,
  codeCounts,
  codesLow,
  isCodeSet,
  verifyRealmPassword,
  CODES_PER_SET,
  LOW_CODE_WARNING,
} from '../../_lib/accounts.js';
import {
  LIMITS,
  limited,
  recordFailures,
  subjectForIp,
  subjectForUser,
} from '../../_lib/rate-limit.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'POST'])) return;

  const session = await requireStaff(req, res);
  if (!session) return;

  const userId = session.user.id;

  try {
    if (req.method === 'GET') {
      const counts = await codeCounts('staff', userId);
      return ok(res, {
        codes: counts,
        codes_low: {
          recovery: codesLow(counts.recovery),
          backup: codesLow(counts.backup),
        },
        low_code_threshold: LOW_CODE_WARNING,
        codes_per_set: CODES_PER_SET,
      });
    }

    const body = await readJson(req, res);
    if (!body) return;

    const which = String(body.set ?? 'recovery');
    if (!isCodeSet('staff', which)) {
      return fail(res, ERR.BAD_REQUEST, 'That is not a set of codes this site has.', {
        details: { set: FIELD.INVALID },
      });
    }

    const subjects = [subjectForIp(req), subjectForUser('staff', userId)];
    if (await limited(res, 'code_generation', subjects)) return;

    const correct = await verifyRealmPassword('staff', userId, body.current_password);
    if (!correct) {
      await recordFailures('code_generation', subjects, LIMITS.codeGeneration);
      return fail(res, ERR.UNAUTHORISED, 'That password was not right.', {
        details: { current_password: FIELD.INVALID },
      });
    }

    // Before the write, per 5f: "every destructive action writes an audit row
    // to gftvjobs_audit_log before it executes". Regenerating is destructive in
    // the way that matters here -- it invalidates every code the account still
    // had -- and for the backup set it is destructive in gftv.asia's table.
    await auditStaff(session.user, AUDIT.RECOVERY_CODES_GENERATED, {
      set: which,
      ...(which === 'backup' ? { reaches: 'gftvhello_backup_codes' } : {}),
    });

    const codes = await generateCodeSet('staff', userId, which);

    return ok(res, {
      set: which,
      codes,
      counts: await codeCounts('staff', userId),
      // 5c, and 5g inherits it: there is no email in this build, so a recovery
      // code set is the only self serve way back into a staff account. The
      // client owns the copy, the download, and the "I have saved these"
      // checkbox; this says the codes are not recoverable so a client cannot
      // treat the response as something it may fetch again.
      shown_once: true,
      reaches_gftv_asia: which === 'backup',
    });
  } catch (cause) {
    return failInternal(res, cause, 'staff recovery codes');
  }
}
