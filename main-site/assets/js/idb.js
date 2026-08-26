// The applicant's own data, offline. Specification section 14.
//
// **Why this file exists at all, rather than a few more entries in a cache.**
// Section 14 is explicit that authenticated responses never go in the Cache
// API: it is per origin, and this origin is shared with the other GFTV apps.
// So the applicant's own data goes here instead, "in a store keyed by their
// user id", cleared completely on logout, and wiped before anything is written
// on a login whose user id differs from the one stored.
//
// Three rules follow from that, and they are the whole of the design:
//
//   1. **The user id is part of the key, not a field beside it.** The `mine`
//      store's keyPath is ['userId', 'kind'], so a read for one applicant
//      cannot return another's row even if the wipe below were to fail. The
//      wipe is the policy; the compound key is the thing that makes the policy
//      hard to get wrong.
//   2. **A null session never wipes anything.** Logging out wipes, and a login
//      as somebody else wipes. A session request that simply failed does not,
//      and the difference matters more offline than anywhere else: that request
//      fails every single time there is no connection, and treating it as a
//      logout would throw away the offline copy at exactly the moment it is the
//      only copy there is.
//   3. **Every function here fails quietly.** IndexedDB is unavailable in some
//      private browsing modes and throws on access in others. Nothing offline
//      is important enough to break a page that would otherwise work, so a read
//      returns null and a write does nothing.
//
// This module imports nothing. It is the bottom of the stack, and api.js and
// the account pages both reach down into it.

const DB_NAME = 'careers-gftv';
const DB_VERSION = 1;

const MINE = 'mine';
const QUEUE = 'queue';
const META = 'meta';
const PUBLIC = 'public';

/** The one meta key: whose data this database currently holds. */
const USER_KEY = 'userId';

/* -------------------------------------------------------------------------
 * Opening
 * ---------------------------------------------------------------------- */

let dbPromise = null;

/**
 * The database, or null if this browser will not give us one.
 *
 * Cached as a promise rather than a value so concurrent callers share one open
 * request. A rejected open is not cached: a browser that refused once because
 * storage was full may not refuse the next time.
 */
function open() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (cause) {
      // Access itself throws in some private browsing modes, before any
      // callback exists to catch it.
      console.warn('[careers-gftv] IndexedDB is unavailable:', cause);
      return resolve(null);
    }

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(MINE)) {
        // Keyed by user id first, so every row is structurally owned by
        // somebody. kind is 'applications', 'saved', 'tasks', 'profile', or
        // 'avatar'.
        db.createObjectStore(MINE, { keyPath: ['userId', 'kind'] });
      }

      if (!db.objectStoreNames.contains(QUEUE)) {
        // Section 14's queued actions. **Written by part 8**, and created here
        // so that part does not need a schema version bump: an upgrade is a
        // real migration on a database somebody already has, and one avoided is
        // one that cannot go wrong.
        const queue = db.createObjectStore(QUEUE, { keyPath: 'id', autoIncrement: true });
        queue.createIndex('byCreated', 'createdAt');
      }

      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META, { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains(PUBLIC)) {
        // Public data that belongs to nobody, and is therefore **not** keyed by
        // user id and **not** cleared on sign out. Today it holds one row: the
        // last successful board, per section 14's "the last successful /search
        // result set, including its filters and tags". Wiping it on sign out
        // would take a signed out reader's board away because somebody else had
        // signed out on the same phone, and there is nothing in it that anybody
        // is not already entitled to see.
        db.createObjectStore(PUBLIC, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.warn('[careers-gftv] could not open IndexedDB:', request.error);
      dbPromise = null;
      resolve(null);
    };
    request.onblocked = () => resolve(null);
  });

  return dbPromise;
}

/** Whether this browser gave us a database at all. */
export async function available() {
  return (await open()) !== null;
}

/**
 * One transaction, as a promise.
 *
 * `run` is handed the store and may return a request; the promise settles on
 * the transaction rather than on the request, so a write is resolved when it is
 * actually durable and not merely accepted.
 */
function withStore(name, mode, run) {
  return open().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) return resolve(null);

        let transaction;
        try {
          transaction = db.transaction(name, mode);
        } catch (cause) {
          console.warn('[careers-gftv] IndexedDB transaction failed:', cause);
          return resolve(null);
        }

        let result = null;
        const request = run(transaction.objectStore(name), transaction);
        if (request) request.onsuccess = () => (result = request.result ?? null);

        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => resolve(null);
        transaction.onabort = () => resolve(null);
      })
  );
}

/* -------------------------------------------------------------------------
 * Whose data this is
 * ---------------------------------------------------------------------- */

/**
 * Held open while syncUser is deciding whether to wipe.
 *
 * Every read and write below waits on it. Section 14 says the wipe happens
 * "before anything is written", and without this that would be a statement
 * about the order two callers happen to run in: shell.js starts syncUser
 * without awaiting it, and a page module could reach a write first. This makes
 * the ordering a property of the file instead of a habit of its callers.
 */
let gate = Promise.resolve();

/** The user id this database currently holds data for, or null. */
export async function storedUserId() {
  const row = await withStore(META, 'readonly', (store) => store.get(USER_KEY));
  return row?.value ?? null;
}

/**
 * Reconcile the database with who is signed in.
 *
 * Call it with the id from the session on every page. Section 14: "on login, if
 * the stored user id differs from the one signing in, wipe the database before
 * writing anything." Before, not after, and this is the only function that
 * writes the stored id, so there is one place that ordering has to be right.
 *
 * **A null id does nothing at all.** See rule 2 in the header: a failed session
 * request is not a logout, and offline it fails every time.
 *
 * @param {string|null} userId
 * @returns {Promise<{ wiped: boolean }>}
 */
export function syncUser(userId) {
  if (!userId) return Promise.resolve({ wiped: false });

  // Chained onto the gate rather than replacing it, so two calls on one page —
  // the shell's and a page module refreshing the session — cannot interleave a
  // wipe with a write.
  gate = gate.then(async () => {
    const stored = await storedUserId();
    if (stored === userId) return { wiped: false };

    if (stored) await wipeAll();

    await withStore(META, 'readwrite', (store) => store.put({ key: USER_KEY, value: userId }));
    return { wiped: Boolean(stored) };
  });

  return gate;
}

/**
 * Everything, gone.
 *
 * Called on sign out and on deleting an account, and by syncUser when somebody
 * else signs in on the same browser. The queue goes with it: an action queued
 * by one applicant must never be flushed under another's session, which is not
 * a caching concern but an integrity one.
 */
export async function wipeAll() {
  const db = await open();
  if (!db) return;

  await new Promise((resolve) => {
    let transaction;
    try {
      transaction = db.transaction([MINE, QUEUE, META], 'readwrite');
    } catch {
      return resolve();
    }
    transaction.objectStore(MINE).clear();
    transaction.objectStore(QUEUE).clear();
    transaction.objectStore(META).clear();
    transaction.oncomplete = resolve;
    transaction.onerror = resolve;
    transaction.onabort = resolve;
  });
}

/* -------------------------------------------------------------------------
 * The applicant's own data
 * ---------------------------------------------------------------------- */

/**
 * Keep a copy of something the applicant is entitled to see.
 *
 * @param {string} userId from the session. Not optional, and not defaulted:
 *        writing a row with no owner would be the one way to build the leak
 *        this whole file exists to prevent.
 * @param {'applications'|'saved'|'tasks'|'profile'|'avatar'} kind
 * @param {*} data anything structured cloneable, which includes a Blob
 * @returns {Promise<number|null>} the timestamp stored, or null
 */
export async function putMine(userId, kind, data) {
  if (!userId || !kind) return null;
  await gate;

  const cachedAt = Date.now();
  await withStore(MINE, 'readwrite', (store) =>
    store.put({ userId, kind, data, cachedAt })
  );
  return cachedAt;
}

/**
 * Read the copy back.
 *
 * The timestamp comes with it, always. Section 14: "any cached view carries a
 * quiet last updated timestamp so nobody mistakes an old board for the current
 * one" — so a caller that wanted only the data would have to go out of its way
 * to drop the thing that keeps it honest.
 *
 * @returns {Promise<{ data: *, cachedAt: number }|null>}
 */
export async function readMine(userId, kind) {
  if (!userId || !kind) return null;
  await gate;

  const row = await withStore(MINE, 'readonly', (store) => store.get([userId, kind]));
  if (!row) return null;
  return { data: row.data, cachedAt: row.cachedAt };
}

/** Drop one kind, leaving the rest. */
export async function forgetMine(userId, kind) {
  if (!userId || !kind) return;
  await withStore(MINE, 'readwrite', (store) => store.delete([userId, kind]));
}

/* -------------------------------------------------------------------------
 * Public data, belonging to nobody
 * ---------------------------------------------------------------------- */

/**
 * Keep a copy of something every reader is entitled to see.
 *
 * Separate from `mine` for two reasons that both matter. It takes no user id,
 * so there is no chance of storing public data under somebody's name; and
 * **`wipeAll` does not touch it**, so signing out does not take the board away
 * from the signed out reader who is still holding the phone.
 *
 * @param {string} key
 * @param {*} data
 * @returns {Promise<number|null>} the timestamp stored
 */
export async function putPublic(key, data) {
  if (!key) return null;
  const cachedAt = Date.now();
  await withStore(PUBLIC, 'readwrite', (store) => store.put({ key, data, cachedAt }));
  return cachedAt;
}

/** @returns {Promise<{ data: *, cachedAt: number }|null>} */
export async function readPublic(key) {
  if (!key) return null;
  const row = await withStore(PUBLIC, 'readonly', (store) => store.get(key));
  if (!row) return null;
  return { data: row.data, cachedAt: row.cachedAt };
}

/* -------------------------------------------------------------------------
 * The avatar
 * ---------------------------------------------------------------------- */

/**
 * The applicant's own picture, as bytes.
 *
 * Settled for phase 10: an avatar is a network image inside an installed app,
 * and AVATARS.md section 4 left the decision here. It is kept as a blob in this
 * database rather than in a cache, for a reason that is not about the applicant
 * at all: **the dashboard renders other people's faces**, and a cache-on-use
 * rule in the service worker could not tell those from the reader's own. So
 * sw.js never caches a Supabase Storage URL, and the only avatar stored
 * anywhere is this one, keyed by its owner and wiped with the rest of their
 * data.
 *
 * The URL is stored beside the bytes because it carries a random component per
 * upload: if it differs from the one on the session, the picture has changed
 * and this copy is stale.
 */
export async function putAvatar(userId, url, blob) {
  if (!userId || !url || !blob) return null;
  return putMine(userId, 'avatar', { url, blob });
}

/**
 * @returns {Promise<{ url: string, blob: Blob, cachedAt: number }|null>}
 */
export async function readAvatar(userId) {
  const row = await readMine(userId, 'avatar');
  if (!row?.data?.blob) return null;
  return { url: row.data.url, blob: row.data.blob, cachedAt: row.cachedAt };
}

/* -------------------------------------------------------------------------
 * Diagnostics
 * ---------------------------------------------------------------------- */

/**
 * What is in here, for a console and for the verification run.
 *
 * Deliberately reports counts and kinds and never the data itself. Something
 * that printed an applicant's saved roles into a log would be doing the exact
 * thing this file is built to stop.
 */
export async function describe() {
  const db = await open();
  if (!db) return { available: false };

  const [userId, kinds, queued] = await Promise.all([
    storedUserId(),
    withStore(MINE, 'readonly', (store) => store.getAllKeys()),
    withStore(QUEUE, 'readonly', (store) => store.count()),
  ]);

  return {
    available: true,
    userId,
    kinds: (kinds ?? []).map(([, kind]) => kind),
    queued: queued ?? 0,
  };
}
