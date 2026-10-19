// Month index 0 = January 2027. Quarter months (March, June, September, December) carry the SNB
// decision and the BWO reference rate publication. The career ends after CAREER_MONTHS.

export const START_YEAR = 2027;
export const CAREER_MONTHS = 180;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function yearOf(m) {
  return START_YEAR + Math.floor(m / 12);
}

export function monthInYear(m) {
  return ((m % 12) + 12) % 12;
}

export function monthLabel(m) {
  return `${MONTHS[monthInYear(m)]} ${yearOf(m)}`;
}

export function isQuarterMonth(m) {
  return [2, 5, 8, 11].includes(monthInYear(m));
}

export function isYearEnd(m) {
  return monthInYear(m) === 11;
}

export function monthsBetween(a, b) {
  return b - a;
}

// Whole years between two month indexes (floor), used for the gains tax holding period.
export function fullYearsBetween(a, b) {
  return Math.floor(Math.max(0, b - a) / 12);
}

export function careerYear(m) {
  return Math.floor(m / 12) + 1;
}
