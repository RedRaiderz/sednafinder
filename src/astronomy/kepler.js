import { deg2rad, rad2deg, norm360 } from './angles.js';

// Solve M = E - e*sinE for E (Newton-Raphson). Inputs/outputs in degrees.
export function solveKepler(Mdeg, e) {
  const M = deg2rad(norm360(Mdeg));
  let E = M + e * Math.sin(M); // initial guess
  for (let i = 0; i < 100; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return rad2deg(E);
}
