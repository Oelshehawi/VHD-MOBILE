export type FetchLike = typeof fetch;
export type TokenProvider = () => Promise<string | null>;
