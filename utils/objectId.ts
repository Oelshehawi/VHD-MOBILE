/**
 * Generate a MongoDB-compatible ObjectId (24 hex characters).
 * Format: 8 chars timestamp + 16 chars random.
 */
export function generateObjectId(): string {
  const timestamp = Math.floor(Date.now() / 1000)
    .toString(16)
    .padStart(8, '0');
  const random = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join(
    ''
  );
  return `${timestamp}${random}`;
}

/**
 * Maps a string key to a STABLE, ObjectId-shaped 24-hex string. The same key
 * always produces the same id — across cache-clears and across devices — so a
 * singleton row (e.g. course progress, unique per `{clerkUserId, courseSlug}`)
 * gets a fixed `_id` every creation site agrees on. This avoids the duplicate-
 * key wedge a random id causes when a second creation site inserts under a new
 * `_id` for a row the server already has.
 *
 * Pure JS, dependency-free: cyrb128 produces four 32-bit words (32 hex); we
 * slice the first 24 to ObjectId width. Not cryptographic — collision-
 * resistance for distinct app keys is all that's needed.
 */
export function objectIdFromKey(key: string): string {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < key.length; i++) {
    const k = key.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const toHex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return `${toHex(h1)}${toHex(h2)}${toHex(h3)}${toHex(h4)}`.slice(0, 24);
}
