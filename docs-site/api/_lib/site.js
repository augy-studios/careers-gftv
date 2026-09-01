// GENERATED FILE. Do not edit this copy.
//
// Written by gen-docs-lib.js from main-site/api/_lib/site.js.
// Change that file and run:  node gen-docs-lib.js
//
// It exists because Vercel builds each project from its own root directory, so
// this site cannot import the portal's modules. 5h: duplicate them, and keep
// the two copies identical.
//
// One line, and the whole of what makes this copy say it is the docs site.
// Both of the places that record which application did something read it:
// the audit row's metadata per 5f and 5g, and a passkey's registered_on per
// 5f. It is a file rather than a constant in each of them so this generator
// has one rule to keep instead of two that must agree.
//
// What differs from the portal's copy, and why:
//   - this build is the docs site
// Which site this copy of the shared helpers is running on.
//
// As of phase 13 there are two applications writing one database, and two
// places in it record which of them did something: the `site` in every audit
// row's metadata, per 5f and 5g, and `registered_on` on a staff passkey, per
// 5f's "show which site each was registered from".
//
// **One constant, in one file, because two of them is how the two answers drift
// apart.** It was a local `const SITE = 'portal'` in audit.js from phase 13 part
// 1, and part 2 needed the same fact in webauthn.js. Copying it would have left
// the generator with two rules saying the same thing and a rename that fixes
// one of them.
//
// A value rather than an argument at the call sites, for the reason audit.js
// gave first: the one thing a call site cannot be trusted to remember is the
// fact that is the same on every call it will ever make.
//
// **This is the one line gen-docs-lib.js changes in this file**, and the whole
// of what makes the docs site's generated copies say `docs`. Nothing else here
// reads an environment variable or a request, on purpose: which application is
// running is a property of the build, not of the deployment or the caller, and
// a variable somebody can set wrongly is a mislabelled audit row nobody can
// spot afterwards.

/** @type {'portal'|'docs'} */
export const SITE = 'docs';
