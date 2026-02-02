// Korea has no DST. Fixed offset is safe.
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;

export function getSeoulDayRangeUtc(now = new Date()) {
  // "Seoul wall time" by shifting +9h
  const seoulWall = new Date(now.getTime() + SEOUL_OFFSET_MS);

  const y = seoulWall.getUTCFullYear();
  const m = seoulWall.getUTCMonth();
  const d = seoulWall.getUTCDate();

  // Start of Seoul day (wall) expressed in UTC ms, then shift back -9h to real UTC
  const startWallUtcMs = Date.UTC(y, m, d, 0, 0, 0, 0);
  const startUtc = new Date(startWallUtcMs - SEOUL_OFFSET_MS);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);

  return { startUtc, endUtc };
}

export function getNextSeoulMidnightUtc(now = new Date()) {
  const { endUtc } = getSeoulDayRangeUtc(now);
  return endUtc; // endUtc is next midnight (Seoul) in UTC
}
