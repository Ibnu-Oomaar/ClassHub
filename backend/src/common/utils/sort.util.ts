/**
 * Maps a client-supplied sort key onto a whitelisted column expression.
 * Never interpolate `sortBy` into SQL directly - unknown keys fall back to the default.
 */
export function resolveSort(
  sortBy: string | undefined,
  allowed: Record<string, string>,
  fallbackKey: string,
): string {
  if (sortBy && Object.prototype.hasOwnProperty.call(allowed, sortBy)) {
    return allowed[sortBy];
  }
  return allowed[fallbackKey];
}

/** Escapes LIKE/ILIKE wildcards so user input is matched literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
