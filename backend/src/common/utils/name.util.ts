/** Trims and collapses internal whitespace: "  Ali   Hassan " -> "Ali Hassan". */
export function normalizeFullName(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ');
}

/**
 * Comparison key for names. Student login matches Full Name case-insensitively and
 * ignoring extra spaces, so "ali  HASSAN" and "Ali Hassan" are the same person.
 */
export function nameKey(value: string): string {
  return normalizeFullName(value).toLocaleLowerCase('en');
}

/** Student IDs are stored trimmed, without whitespace, and upper-cased: " st-001 " -> "ST-001". */
export function normalizeStudentId(value: string): string {
  return value.normalize('NFC').replace(/\s+/g, '').toUpperCase();
}
