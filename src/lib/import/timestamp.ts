/**
 * Google Forms' timestamp, as exported in Japanese: "2026/09/29 2:49:36 午後
 * GMT+9" (午前 = a.m., 午後 = p.m.; Japan time when no zone is given). Other
 * formats are left to the Date parser.
 */
export function parseFormTimestamp(value: string): Date | null {
  const m = value
    .trim()
    .match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(午前|午後|AM|PM)?\s*(?:GMT([+-]\d{1,2}))?$/i);
  if (!m) {
    const d = value.trim() ? new Date(value) : null;
    return d && !Number.isNaN(d.getTime()) ? d : null;
  }
  const [, y, mo, d, h, mi, sec, half, zone] = m;
  let hour = Number(h);
  if (half && /午後|PM/i.test(half) && hour < 12) hour += 12;
  if (half && /午前|AM/i.test(half) && hour === 12) hour = 0;
  const offset = zone ? Number(zone) : 9;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), hour - offset, Number(mi), Number(sec ?? 0)));
}
