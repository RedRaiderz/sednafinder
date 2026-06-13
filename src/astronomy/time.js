// Julian Date from a JS Date (uses its UTC millisecond value).
export function julianDate(date) {
  return date.getTime() / 86400000 + 2440587.5;
}
