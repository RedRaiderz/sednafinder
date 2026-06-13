const AU_KM = 149597870.7;
const C_KMS = 299792.458;

export function lightTimeSeconds(distAU) {
  return (distAU * AU_KM) / C_KMS;
}

// Apparent magnitude from absolute magnitude H, heliocentric distance r (AU),
// and geocentric distance delta (AU). Phase term omitted (negligible for TNOs).
export function apparentMagnitude(H, r, delta) {
  return H + 5 * Math.log10(r * delta);
}
