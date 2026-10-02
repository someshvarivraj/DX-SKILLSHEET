/**
 * Group names are compared loosely, so "Myanmar ", "myanmar" and "ＭＹＡＮＭＡＲ"
 * are one group and a second upload never creates a duplicate.
 */
export function groupNameKey(name: string): string {
  return name.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}
