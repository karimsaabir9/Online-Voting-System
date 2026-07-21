/**
 * Postgres SQLSTATE codes this app checks for. Drizzle wraps every driver
 * error in a DrizzleQueryError and puts the real error on `.cause` — never
 * spreads `.code` onto the wrapper — so callers must use
 * getPostgresErrorCode() rather than reading `error.code` directly.
 */
export const POSTGRES_ERROR_CODES = {
  RESTRICT_VIOLATION: "23001",
  UNIQUE_VIOLATION: "23505",
} as const;

export function getPostgresErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  if ("code" in error && typeof error.code === "string") {
    return error.code;
  }

  if ("cause" in error) {
    return getPostgresErrorCode(error.cause);
  }

  return undefined;
}
