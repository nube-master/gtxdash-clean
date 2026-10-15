const now = new Date("2026-08-16T05:11:00Z"); // Simular 02:11 BRT
const brtOffsetHours = -3;
const brtNow = new Date(now.getTime() + brtOffsetHours * 3600 * 1000);
const brtMidnight = new Date(Date.UTC(
  brtNow.getUTCFullYear(),
  brtNow.getUTCMonth(),
  brtNow.getUTCDate(),
  0, 0, 0
));
const midnightUtc = new Date(brtMidnight.getTime() - brtOffsetHours * 3600 * 1000);

console.log("Simulated Now (UTC):", now.toISOString());
console.log("BRT Midnight (UTC):", midnightUtc.toISOString());
console.log("Since (Timestamp):", Math.floor(midnightUtc.getTime() / 1000));
console.log("Until (Timestamp):", Math.floor(now.getTime() / 1000));
