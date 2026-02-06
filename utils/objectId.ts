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
