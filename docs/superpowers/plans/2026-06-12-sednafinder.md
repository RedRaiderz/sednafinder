# SednaFinder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile web app (PWA) that points the user's iPhone at the sky and shows where Sedna and six other far-frontier worlds actually are, with a hover-to-reveal stats panel.

**Architecture:** Static HTML/CSS/JS, no backend. A pure, unit-tested astronomy core (Keplerian ephemeris + coordinate transforms) computes each world's sky position; thin DOM modules read the phone's orientation/camera/GPS and draw markers over the live camera feed. Deployed to free HTTPS hosting (GitHub Pages) and installed via "Add to Home Screen."

**Tech Stack:** Vanilla JavaScript (ES modules), HTML, CSS. Node's built-in test runner (`node --test`) for the pure logic. Browser APIs: `getUserMedia`, `DeviceOrientation`, `Geolocation`, Service Worker. No third-party runtime dependencies.

---

## File Structure

```
sednafinder/
├── index.html                  # App shell: camera video, overlay, reticle, panels
├── styles.css                  # Clean UI styling
├── manifest.json               # PWA metadata (icon, standalone)
├── sw.js                       # Service worker (offline caching)
├── package.json                # type:module + test script
├── icons/                      # App icons (192, 512)
├── src/
│   ├── astronomy/
│   │   ├── angles.js           # deg/rad, normalization, angle difference
│   │   ├── time.js             # Julian Date, sidereal time
│   │   ├── kepler.js           # Kepler equation solver
│   │   ├── orbit.js            # Keplerian elements -> heliocentric position
│   │   ├── coords.js           # heliocentric -> RA/Dec -> Alt/Az
│   │   └── photometry.js       # light-time, apparent magnitude
│   ├── data/
│   │   └── bodies.js           # 7 worlds + Earth: elements + facts
│   ├── render/
│   │   └── projection.js       # world az/alt -> screen x/y, hover detection
│   ├── sensors/
│   │   ├── camera.js           # start camera stream
│   │   ├── orientation.js      # device orientation -> aim direction
│   │   └── location.js         # GPS / manual location
│   ├── ui/
│   │   └── panel.js            # format live stats, build panel DOM
│   └── main.js                 # wires everything; render loop
└── tests/
    ├── angles.test.js
    ├── time.test.js
    ├── kepler.test.js
    ├── orbit.test.js
    ├── coords.test.js
    ├── photometry.test.js
    ├── bodies.test.js
    └── projection.test.js
```

**Module boundaries:** Everything in `src/astronomy/`, `src/render/projection.js`, and the formatting half of `src/ui/panel.js` is **pure** (no DOM, no sensors) and unit-tested under Node on Windows. Everything in `src/sensors/` and the loop in `src/main.js` is thin DOM/sensor glue, verified manually on the iPhone after deploy.

---

## Task 1: Project scaffold + test harness

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `tests/smoke.test.js`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "sednafinder",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
.DS_Store
*.log
```

- [ ] **Step 3: Write a smoke test to prove the harness runs**

`tests/smoke.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

test('test harness works', () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 4: Run the test**

Run: `npm test`
Expected: PASS — `tests 1`, `pass 1`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore tests/smoke.test.js
git commit -m "chore: scaffold project and test harness"
```

---

## Task 2: Angle utilities

**Files:**
- Create: `src/astronomy/angles.js`
- Test: `tests/angles.test.js`

- [ ] **Step 1: Write the failing test**

`tests/angles.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { deg2rad, rad2deg, norm360, angleDiff } from '../src/astronomy/angles.js';

test('deg2rad and rad2deg round-trip', () => {
  assert.ok(Math.abs(deg2rad(180) - Math.PI) < 1e-12);
  assert.ok(Math.abs(rad2deg(Math.PI) - 180) < 1e-12);
});

test('norm360 wraps into [0,360)', () => {
  assert.equal(norm360(370), 10);
  assert.equal(norm360(-10), 350);
  assert.equal(norm360(0), 0);
});

test('angleDiff returns shortest signed difference', () => {
  assert.equal(angleDiff(10, 350), 20);    // 10 is 20deg "ahead" of 350
  assert.equal(angleDiff(350, 10), -20);
  assert.equal(angleDiff(180, 0), 180);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/angles.test.js`
Expected: FAIL — cannot find module `../src/astronomy/angles.js`.

- [ ] **Step 3: Write the implementation**

`src/astronomy/angles.js`:

```js
export const deg2rad = (d) => (d * Math.PI) / 180;
export const rad2deg = (r) => (r * 180) / Math.PI;

export function norm360(deg) {
  return ((deg % 360) + 360) % 360;
}

// Shortest signed difference a - b, in (-180, 180].
export function angleDiff(a, b) {
  return ((a - b + 540) % 360) - 180;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/angles.test.js`
Expected: PASS — all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/astronomy/angles.js tests/angles.test.js
git commit -m "feat: angle utilities"
```

---

## Task 3: Julian Date + Kepler solver

**Files:**
- Create: `src/astronomy/time.js`
- Create: `src/astronomy/kepler.js`
- Test: `tests/time.test.js`, `tests/kepler.test.js`

- [ ] **Step 1: Write the failing tests**

`tests/time.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { julianDate } from '../src/astronomy/time.js';

test('J2000 epoch is JD 2451545.0', () => {
  const d = new Date(Date.UTC(2000, 0, 1, 12, 0, 0)); // 2000-01-01 12:00 UTC
  assert.ok(Math.abs(julianDate(d) - 2451545.0) < 1e-6);
});

test('one day later is +1 JD', () => {
  const d = new Date(Date.UTC(2000, 0, 2, 12, 0, 0));
  assert.ok(Math.abs(julianDate(d) - 2451546.0) < 1e-6);
});
```

`tests/kepler.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { solveKepler } from '../src/astronomy/kepler.js';
import { deg2rad } from '../src/astronomy/angles.js';

test('solution satisfies Kepler equation E - e*sinE = M', () => {
  const Mdeg = 30, e = 0.8;
  const Edeg = solveKepler(Mdeg, e);
  const E = deg2rad(Edeg), M = deg2rad(Mdeg);
  const residual = E - e * Math.sin(E) - M;
  assert.ok(Math.abs(residual) < 1e-8, `residual ${residual}`);
});

test('M=0 gives E=0; M=180 gives E=180', () => {
  assert.ok(Math.abs(solveKepler(0, 0.5)) < 1e-6);
  assert.ok(Math.abs(solveKepler(180, 0.5) - 180) < 1e-6);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/time.test.js tests/kepler.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementations**

`src/astronomy/time.js`:

```js
// Julian Date from a JS Date (uses its UTC millisecond value).
export function julianDate(date) {
  return date.getTime() / 86400000 + 2440587.5;
}
```

`src/astronomy/kepler.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/time.test.js tests/kepler.test.js`
Expected: PASS — all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/astronomy/time.js src/astronomy/kepler.js tests/time.test.js tests/kepler.test.js
git commit -m "feat: julian date and kepler solver"
```

---

## Task 4: Heliocentric position from orbital elements

**Files:**
- Create: `src/astronomy/orbit.js`
- Test: `tests/orbit.test.js`

Element object shape used everywhere: `{ a, e, i, Om, w, M0, epoch }` where `a` = semi-major axis (AU), `e` = eccentricity, `i` = inclination (deg), `Om` = longitude of ascending node Ω (deg), `w` = argument of perihelion ω (deg), `M0` = mean anomaly at `epoch` (deg), `epoch` = Julian Date.

- [ ] **Step 1: Write the failing test**

`tests/orbit.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { heliocentricEcliptic, meanAnomalyAtJD } from '../src/astronomy/orbit.js';

// Earth (EM barycenter) J2000 heliocentric ecliptic elements.
const EARTH = { a: 1.00000261, e: 0.01671123, i: -0.00001531,
                Om: 0.0, w: 102.93768193, M0: -2.47311027, epoch: 2451545.0 };

test('mean anomaly advances with time', () => {
  const m0 = meanAnomalyAtJD(EARTH, 2451545.0);
  const m1 = meanAnomalyAtJD(EARTH, 2451545.0 + 1);
  assert.ok(Math.abs(((m1 - m0 + 540) % 360) - 180 - 0.9856) < 0.01); // ~0.9856 deg/day
});

test('Earth-Sun distance at J2000 is ~0.983 AU', () => {
  const p = heliocentricEcliptic(EARTH, 2451545.0);
  const r = Math.hypot(p.x, p.y, p.z);
  assert.ok(r > 0.982 && r < 0.985, `r=${r}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/orbit.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/astronomy/orbit.js`:

```js
import { deg2rad, norm360 } from './angles.js';
import { solveKepler } from './kepler.js';

// Gaussian mean motion in deg/day from semi-major axis (AU).
function meanMotion(a) {
  return 0.9856076686 / (a * Math.sqrt(a));
}

export function meanAnomalyAtJD(el, jd) {
  return norm360(el.M0 + meanMotion(el.a) * (jd - el.epoch));
}

// Heliocentric ecliptic (J2000) rectangular coordinates in AU.
export function heliocentricEcliptic(el, jd) {
  const M = meanAnomalyAtJD(el, jd);
  const E = deg2rad(solveKepler(M, el.e));

  // Position in orbital plane.
  const xv = el.a * (Math.cos(E) - el.e);
  const yv = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  const v = Math.atan2(yv, xv);        // true anomaly
  const r = Math.hypot(xv, yv);        // distance from Sun

  const N = deg2rad(el.Om), w = deg2rad(el.w), i = deg2rad(el.i);
  const vw = v + w;

  const x = r * (Math.cos(N) * Math.cos(vw) - Math.sin(N) * Math.sin(vw) * Math.cos(i));
  const y = r * (Math.sin(N) * Math.cos(vw) + Math.cos(N) * Math.sin(vw) * Math.cos(i));
  const z = r * (Math.sin(vw) * Math.sin(i));
  return { x, y, z };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/orbit.test.js`
Expected: PASS — both tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/astronomy/orbit.js tests/orbit.test.js
git commit -m "feat: heliocentric position from keplerian elements"
```

---

## Task 5: Geocentric RA/Dec and Earth-distance

**Files:**
- Create: `src/astronomy/coords.js`
- Test: `tests/coords.test.js`

- [ ] **Step 1: Write the failing test**

`tests/coords.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { equatorialFromBody } from '../src/astronomy/coords.js';

const EARTH = { a: 1.00000261, e: 0.01671123, i: -0.00001531,
                Om: 0.0, w: 102.93768193, M0: -2.47311027, epoch: 2451545.0 };
// Sedna J2000 osculating elements (approximate; refined from JPL in Task 8).
const SEDNA = { a: 506.0, e: 0.8496, i: 11.93,
                Om: 144.40, w: 311.46, M0: 358.20, epoch: 2451545.0 };

test('Sedna geocentric distance is plausible (~80-90 AU) in 2026', () => {
  const jd = 2461203.5; // 2026-06-12 00:00 UTC (see time.js: matches julianDate)
  const { distAU } = equatorialFromBody(SEDNA, EARTH, jd);
  assert.ok(distAU > 80 && distAU < 90, `distAU=${distAU}`);
});

test('RA in [0,360), Dec in [-90,90]', () => {
  const jd = 2461203.5;
  const { ra, dec } = equatorialFromBody(SEDNA, EARTH, jd);
  assert.ok(ra >= 0 && ra < 360);
  assert.ok(dec >= -90 && dec <= 90);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/coords.test.js`
Expected: FAIL — `equatorialFromBody` not found.

- [ ] **Step 3: Write the implementation**

`src/astronomy/coords.js`:

```js
import { deg2rad, rad2deg, norm360 } from './angles.js';
import { heliocentricEcliptic } from './orbit.js';

const OBLIQUITY = deg2rad(23.43928); // mean obliquity of the ecliptic, J2000

// Geocentric equatorial RA/Dec (deg) and Earth-distance (AU) for a body.
export function equatorialFromBody(bodyEl, earthEl, jd) {
  const b = heliocentricEcliptic(bodyEl, jd);
  const e = heliocentricEcliptic(earthEl, jd);

  // Geocentric ecliptic = body - earth.
  const xe = b.x - e.x, ye = b.y - e.y, ze = b.z - e.z;

  // Rotate ecliptic -> equatorial about the X axis.
  const xq = xe;
  const yq = ye * Math.cos(OBLIQUITY) - ze * Math.sin(OBLIQUITY);
  const zq = ye * Math.sin(OBLIQUITY) + ze * Math.cos(OBLIQUITY);

  const distAU = Math.hypot(xq, yq, zq);
  const ra = norm360(rad2deg(Math.atan2(yq, xq)));
  const dec = rad2deg(Math.asin(zq / distAU));
  return { ra, dec, distAU };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/coords.test.js`
Expected: PASS — both tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/astronomy/coords.js tests/coords.test.js
git commit -m "feat: geocentric RA/Dec and earth-distance"
```

---

## Task 6: Local sidereal time + Alt/Az

**Files:**
- Modify: `src/astronomy/coords.js` (add two functions)
- Test: `tests/coords.test.js` (add cases)

- [ ] **Step 1: Add failing tests**

Append to `tests/coords.test.js`:

```js
import { localSiderealTime, raDecToAltAz } from '../src/astronomy/coords.js';

test('object at the celestial pole sits at altitude = latitude, due north', () => {
  const lat = 45;
  const { alt, az } = raDecToAltAz(123, 90, 200, lat); // dec=+90 -> RA/LST irrelevant
  assert.ok(Math.abs(alt - lat) < 1e-6, `alt=${alt}`);
  assert.ok(Math.abs(az - 0) < 1e-6 || Math.abs(az - 360) < 1e-6, `az=${az}`);
});

test('local sidereal time stays in [0,360)', () => {
  const lst = localSiderealTime(2461203.5, -122.3);
  assert.ok(lst >= 0 && lst < 360);
});
```

- [ ] **Step 2: Run test to verify the new cases fail**

Run: `node --test tests/coords.test.js`
Expected: FAIL — `localSiderealTime` / `raDecToAltAz` not exported.

- [ ] **Step 3: Add the implementation**

Append to `src/astronomy/coords.js`:

```js
// Local sidereal time (deg) for a Julian Date and east-positive longitude (deg).
export function localSiderealTime(jd, lonEastDeg) {
  const gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0);
  return norm360(gmst + lonEastDeg);
}

// Convert RA/Dec (deg) to altitude/azimuth (deg). Azimuth measured from North,
// increasing eastward (clockwise). Latitude north-positive.
export function raDecToAltAz(raDeg, decDeg, lstDeg, latDeg) {
  const ha = deg2rad(((lstDeg - raDeg + 540) % 360) - 180); // hour angle
  const dec = deg2rad(decDeg), lat = deg2rad(latDeg);

  const sinAlt = Math.sin(dec) * Math.sin(lat) +
                 Math.cos(dec) * Math.cos(lat) * Math.cos(ha);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

  const cosAz = (Math.sin(dec) - Math.sin(alt) * Math.sin(lat)) /
                (Math.cos(alt) * Math.cos(lat));
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if (Math.sin(ha) > 0) az = 2 * Math.PI - az;
  return { alt: rad2deg(alt), az: rad2deg(az) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/coords.test.js`
Expected: PASS — all 4 coords tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/astronomy/coords.js tests/coords.test.js
git commit -m "feat: sidereal time and alt/az conversion"
```

---

## Task 7: Light-time and apparent magnitude

**Files:**
- Create: `src/astronomy/photometry.js`
- Test: `tests/photometry.test.js`

- [ ] **Step 1: Write the failing test**

`tests/photometry.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { lightTimeSeconds, apparentMagnitude } from '../src/astronomy/photometry.js';

test('light crosses 1 AU in ~499 seconds', () => {
  assert.ok(Math.abs(lightTimeSeconds(1) - 499.0) < 1, lightTimeSeconds(1));
});

test('Sedna apparent magnitude is ~20-21', () => {
  // H~1.5, heliocentric ~84 AU, geocentric ~84 AU
  const m = apparentMagnitude(1.5, 84, 84);
  assert.ok(m > 20 && m < 21.5, `m=${m}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/photometry.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/astronomy/photometry.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/photometry.test.js`
Expected: PASS — both tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/astronomy/photometry.js tests/photometry.test.js
git commit -m "feat: light-time and apparent magnitude"
```

---

## Task 8: The seven worlds (+ Earth) data

**Files:**
- Create: `src/data/bodies.js`
- Test: `tests/bodies.test.js`

This task records real orbital elements + facts. Earth and Sedna are provided in full. The other six are fetched from the **JPL Small-Body Database API** in Step 3 so the numbers are authoritative.

- [ ] **Step 1: Write the failing test**

`tests/bodies.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { BODIES, EARTH } from '../src/data/bodies.js';

test('Earth has J2000 epoch', () => {
  assert.equal(EARTH.epoch, 2451545.0);
});

test('there are exactly 7 target worlds', () => {
  assert.equal(BODIES.length, 7);
});

test('every body has elements + facts', () => {
  for (const b of BODIES) {
    for (const k of ['a', 'e', 'i', 'Om', 'w', 'M0', 'epoch', 'H']) {
      assert.equal(typeof b[k], 'number', `${b.name} missing ${k}`);
    }
    assert.equal(typeof b.name, 'string');
    assert.ok(b.facts && typeof b.facts.blurb === 'string');
  }
});

test('Sedna semi-major axis is ~500 AU', () => {
  const sedna = BODIES.find((b) => b.name === 'Sedna');
  assert.ok(sedna.a > 490 && sedna.a < 520, `a=${sedna.a}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bodies.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Fetch the six other worlds' elements from JPL**

For each of Pluto, Eris, Makemake, Haumea, Gonggong, Quaoar, query the JPL Small-Body Database API (one at a time) and read the orbital elements:

```
https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=Eris&full-prec=true
```

In the JSON response, `orbit.elements` is an array of `{name, value}`; map them to our shape:
- `e` -> `e`
- `a` (AU) -> `a`
- `i` (deg) -> `i`
- `om` (deg) -> `Om`
- `w` (deg) -> `w`
- `ma` (deg) -> `M0`
- `orbit.epoch` (JD) -> `epoch`
- `phys_par` entry with `name: "H"` -> `H`

Record the fetched numbers directly into the file in Step 4 (replace the example values shown for the six bodies with the fetched ones). Diameter / discovery / temperature facts can be taken from each body's Wikipedia infobox.

- [ ] **Step 4: Write the data module**

`src/data/bodies.js` (Earth + Sedna are final; the other six show the structure — overwrite their numeric fields with the values fetched in Step 3):

```js
// Earth (Earth-Moon barycenter), heliocentric ecliptic J2000.
export const EARTH = {
  a: 1.00000261, e: 0.01671123, i: -0.00001531,
  Om: 0.0, w: 102.93768193, M0: -2.47311027, epoch: 2451545.0,
};

export const BODIES = [
  {
    name: 'Sedna', designation: '90377 Sedna', H: 1.5,
    a: 506.0, e: 0.8496, i: 11.93, Om: 144.40, w: 311.46, M0: 358.20, epoch: 2451545.0,
    facts: {
      diameterKm: 1000, surfaceTempK: 12,
      discovery: '2003-11-14 by Brown, Trujillo & Rabinowitz',
      perihelionAU: 76, aphelionAU: 936, periodYears: 11400, nextPerihelion: '~2076',
      blurb: 'One full orbit takes ~11,400 years; last time it was this close, mammoths walked the Earth.',
    },
  },
  // --- Replace the numeric fields below with values fetched in Step 3 ---
  { name: 'Pluto', designation: '134340 Pluto', H: -0.45,
    a: 39.48, e: 0.2488, i: 17.16, Om: 110.30, w: 113.76, M0: 14.53, epoch: 2451545.0,
    facts: { diameterKm: 2377, surfaceTempK: 44, discovery: '1930-02-18 by Clyde Tombaugh',
      perihelionAU: 29.7, aphelionAU: 49.3, periodYears: 248, nextPerihelion: '2114',
      blurb: 'Demoted to dwarf planet in 2006; visited by New Horizons in 2015.' } },
  { name: 'Eris', designation: '136199 Eris', H: -1.1,
    a: 67.86, e: 0.4407, i: 44.04, Om: 35.95, w: 151.64, M0: 205.99, epoch: 2451545.0,
    facts: { diameterKm: 2326, surfaceTempK: 30, discovery: '2005-01-05 by Brown, Trujillo & Rabinowitz',
      perihelionAU: 38.3, aphelionAU: 97.5, periodYears: 559, nextPerihelion: '2257',
      blurb: 'The discovery that got Pluto reclassified; slightly more massive than Pluto.' } },
  { name: 'Makemake', designation: '136472 Makemake', H: -0.2,
    a: 45.43, e: 0.1559, i: 28.98, Om: 79.36, w: 296.06, M0: 153.0, epoch: 2451545.0,
    facts: { diameterKm: 1430, surfaceTempK: 30, discovery: '2005-03-31 by M. Brown et al.',
      perihelionAU: 38.3, aphelionAU: 52.8, periodYears: 306, nextPerihelion: '2185',
      blurb: 'Named after the creator god of the Rapa Nui people of Easter Island.' } },
  { name: 'Haumea', designation: '136108 Haumea', H: 0.2,
    a: 43.13, e: 0.1921, i: 28.21, Om: 122.0, w: 239.0, M0: 218.0, epoch: 2451545.0,
    facts: { diameterKm: 1560, surfaceTempK: 32, discovery: '2004 by Brown / Ortiz teams',
      perihelionAU: 34.9, aphelionAU: 51.5, periodYears: 285, nextPerihelion: '2133',
      blurb: 'Spins every 4 hours, stretching it into an egg shape; has a ring and two moons.' } },
  { name: 'Gonggong', designation: '225088 Gonggong', H: 1.6,
    a: 67.38, e: 0.5024, i: 30.74, Om: 336.84, w: 207.0, M0: 100.0, epoch: 2451545.0,
    facts: { diameterKm: 1230, surfaceTempK: 30, discovery: '2007-07-17 by Schwamb, Brown & Rabinowitz',
      perihelionAU: 33.5, aphelionAU: 101.2, periodYears: 552, nextPerihelion: '2089',
      blurb: 'Named after a Chinese water god with a serpent tail; one of the reddest large TNOs.' } },
  { name: 'Quaoar', designation: '50000 Quaoar', H: 2.4,
    a: 43.69, e: 0.0392, i: 7.99, Om: 188.8, w: 147.0, M0: 301.0, epoch: 2451545.0,
    facts: { diameterKm: 1110, surfaceTempK: 44, discovery: '2002-06-04 by Brown & Trujillo',
      perihelionAU: 42.0, aphelionAU: 45.5, periodYears: 289, nextPerihelion: '2075',
      blurb: 'Has a ring far outside the limit where rings were thought possible.' } },
];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/bodies.test.js`
Expected: PASS — all 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/data/bodies.js tests/bodies.test.js
git commit -m "feat: orbital elements and facts for the seven worlds"
```

---

## Task 9: Screen projection + hover detection

**Files:**
- Create: `src/render/projection.js`
- Test: `tests/projection.test.js`

- [ ] **Step 1: Write the failing test**

`tests/projection.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { projectToScreen, isHovering } from '../src/render/projection.js';

const W = 400, H = 800, FOV = 60; // horizontal field of view degrees

test('target dead ahead maps to screen center, on-screen', () => {
  const p = projectToScreen({ az: 180, alt: 30 }, { az: 180, alt: 30 }, FOV, W, H);
  assert.ok(p.onScreen);
  assert.ok(Math.abs(p.x - W / 2) < 1e-6);
  assert.ok(Math.abs(p.y - H / 2) < 1e-6);
});

test('target at +half-FOV in azimuth maps to right edge', () => {
  const p = projectToScreen({ az: 180, alt: 30 }, { az: 210, alt: 30 }, FOV, W, H);
  assert.ok(Math.abs(p.x - W) < 1e-6, `x=${p.x}`);
});

test('higher target maps above center (smaller y)', () => {
  const p = projectToScreen({ az: 180, alt: 30 }, { az: 180, alt: 40 }, FOV, W, H);
  assert.ok(p.y < H / 2);
});

test('target behind you is off-screen', () => {
  const p = projectToScreen({ az: 180, alt: 30 }, { az: 0, alt: 30 }, FOV, W, H);
  assert.ok(!p.onScreen);
});

test('isHovering true only within threshold of center', () => {
  assert.ok(isHovering({ x: 205, y: 405 }, W / 2, H / 2, 30));
  assert.ok(!isHovering({ x: 50, y: 50 }, W / 2, H / 2, 30));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/projection.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/render/projection.js`:

```js
import { angleDiff } from '../astronomy/angles.js';

// Project a target (az/alt) onto the screen given where the device points.
// Returns {x, y, onScreen}. Pinhole-style linear mapping across the FOV.
export function projectToScreen(device, target, fovDeg, width, height) {
  const vfov = (fovDeg * height) / width; // vertical FOV from aspect ratio
  const dAz = angleDiff(target.az, device.az); // +right
  const dAlt = target.alt - device.alt;        // +up

  const x = width / 2 + (dAz / (fovDeg / 2)) * (width / 2);
  const y = height / 2 - (dAlt / (vfov / 2)) * (height / 2);

  const onScreen =
    Math.abs(dAz) <= fovDeg / 2 && Math.abs(dAlt) <= vfov / 2;
  return { x, y, onScreen, dAz, dAlt };
}

export function isHovering(point, centerX, centerY, thresholdPx) {
  return Math.hypot(point.x - centerX, point.y - centerY) <= thresholdPx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/projection.test.js`
Expected: PASS — all 5 tests pass.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — all test files green.

- [ ] **Step 6: Commit**

```bash
git add src/render/projection.js tests/projection.test.js
git commit -m "feat: screen projection and hover detection"
```

---

## Task 10: Deployment pipeline (GitHub Pages, HTTPS)

We deploy early so every later (sensor/camera) task can be verified on the actual iPhone, which requires HTTPS.

**Files:**
- Create: `index.html` (minimal placeholder page)

- [ ] **Step 1: Create a minimal `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>SednaFinder</title>
  </head>
  <body>
    <h1>SednaFinder</h1>
    <p>Coming online…</p>
  </body>
</html>
```

- [ ] **Step 2: Create a GitHub repo and push**

Run (replace `<USER>` with the GitHub username; create the account first at github.com if needed):

```bash
git branch -M main
gh repo create sednafinder --public --source=. --remote=origin --push
```

If `gh` is not installed: create the repo on github.com, then:

```bash
git remote add origin https://github.com/<USER>/sednafinder.git
git push -u origin main
```

- [ ] **Step 3: Enable GitHub Pages**

On github.com: repo **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `/ (root)` → Save**. After ~1 minute the site is live at `https://<USER>.github.io/sednafinder/`.

- [ ] **Step 4: Verify on the iPhone**

Open `https://<USER>.github.io/sednafinder/` in iPhone Safari.
Expected: the "SednaFinder — Coming online…" page loads over HTTPS.

- [ ] **Step 5: Commit (already pushed)**

```bash
git add index.html
git commit -m "chore: minimal page + github pages deploy"
git push
```

**From here on, "deploy" means `git push` — Pages updates in ~1 minute; reload on the iPhone to test.**

---

## Task 11: HTML shell + camera feed

**Files:**
- Modify: `index.html`
- Create: `styles.css`
- Create: `src/sensors/camera.js`

This is DOM/sensor glue — verified manually (desktop browser with a webcam works for a first check; final check on the iPhone).

- [ ] **Step 1: Build the app shell**

Replace `index.html` body and head additions:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#05060a" />
    <title>SednaFinder</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <video id="cam" autoplay playsinline muted></video>
    <canvas id="overlay"></canvas>
    <div id="reticle"></div>
    <button id="start" class="start-btn">Tap to start</button>
    <section id="panel" class="panel hidden"></section>
    <script type="module" src="src/main.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `styles.css`**

```css
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: #05060a; color: #e8ecff;
  font-family: -apple-system, system-ui, sans-serif; overflow: hidden; }
#cam, #overlay { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: cover; }
#overlay { pointer-events: none; }
#reticle { position: fixed; left: 50%; top: 50%; width: 44px; height: 44px;
  margin: -22px 0 0 -22px; border: 2px solid rgba(255,255,255,0.85);
  border-radius: 50%; pointer-events: none; }
.start-btn { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
  padding: 16px 28px; font-size: 18px; border: 0; border-radius: 999px;
  background: #4663ff; color: #fff; }
.panel { position: fixed; left: 0; right: 0; bottom: 0; max-height: 60%; overflow-y: auto;
  padding: 20px; background: rgba(8,10,20,0.92); backdrop-filter: blur(12px);
  border-radius: 20px 20px 0 0; transition: transform 0.25s ease; }
.panel.hidden { transform: translateY(110%); }
.panel h2 { margin: 0 0 4px; }
.panel .row { display: flex; justify-content: space-between; padding: 6px 0;
  border-bottom: 1px solid rgba(255,255,255,0.08); font-size: 15px; }
.panel .label { opacity: 0.7; }
```

- [ ] **Step 3: Create the camera module**

`src/sensors/camera.js`:

```js
// Start the rear camera and stream it into a <video> element.
export async function startCamera(videoEl) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false,
  });
  videoEl.srcObject = stream;
  await videoEl.play();
  return stream;
}
```

- [ ] **Step 4: Wire a minimal `src/main.js`**

```js
import { startCamera } from './sensors/camera.js';

const startBtn = document.getElementById('start');
const video = document.getElementById('cam');

startBtn.addEventListener('click', async () => {
  try {
    await startCamera(video);
    startBtn.classList.add('hidden');
    startBtn.style.display = 'none';
  } catch (err) {
    startBtn.textContent = 'Camera blocked — check Settings';
    console.error(err);
  }
});
```

- [ ] **Step 5: Deploy and verify on the iPhone**

```bash
git add index.html styles.css src/sensors/camera.js src/main.js
git commit -m "feat: app shell and camera feed"
git push
```

Reload the Pages URL on the iPhone, tap "Tap to start," allow camera.
Expected: live rear-camera video fills the screen with the reticle centered.

---

## Task 12: Device orientation → aim direction

**Files:**
- Create: `src/sensors/orientation.js`
- Test: `tests/orientation.test.js`

The pure geometry (`cameraDirection`) is unit-tested; the iOS permission flow and true-north heading are verified on-device.

- [ ] **Step 1: Write the failing test for the pure direction math**

`tests/orientation.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraDirection } from '../src/sensors/orientation.js';

test('phone flat on table (screen up) -> camera points straight down', () => {
  const { alt } = cameraDirection(0, 0, 0);
  assert.ok(Math.abs(alt - (-90)) < 1e-6, `alt=${alt}`);
});

test('phone upright in portrait (beta=90) -> camera at horizon, due north', () => {
  const { az, alt } = cameraDirection(0, 90, 0);
  assert.ok(Math.abs(alt) < 1e-6, `alt=${alt}`);
  assert.ok(Math.abs(az) < 1e-6 || Math.abs(az - 360) < 1e-6, `az=${az}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/orientation.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/sensors/orientation.js`:

```js
import { deg2rad, rad2deg, norm360 } from '../astronomy/angles.js';

// Direction the rear camera points, from DeviceOrientation angles (deg).
// Returns {az, alt} in degrees. World frame: X=East, Y=North, Z=Up.
// Uses the W3C Z-X'-Y'' rotation matrix; camera axis is -Z of the device.
export function cameraDirection(alphaDeg, betaDeg, gammaDeg) {
  const a = deg2rad(alphaDeg), b = deg2rad(betaDeg), g = deg2rad(gammaDeg);
  const cA = Math.cos(a), sA = Math.sin(a);
  const cB = Math.cos(b), sB = Math.sin(b);
  const cG = Math.cos(g), sG = Math.sin(g);

  // Third column of the device->world rotation matrix (device +Z in world).
  const zx = cA * sG + cG * sA * sB;
  const zy = sA * sG - cA * cG * sB;
  const zz = cB * cG;

  // Camera points along device -Z.
  const east = -zx, north = -zy, up = -zz;
  const az = norm360(rad2deg(Math.atan2(east, north)));
  const alt = rad2deg(Math.asin(Math.max(-1, Math.min(1, up))));
  return { az, alt };
}

// --- DOM glue below (not unit-tested) ---

let _heading = 0;     // smoothed azimuth (deg)
let _altitude = 0;    // smoothed altitude (deg)
let _haveCompass = false;

const SMOOTH = 0.15; // low-pass factor
function lp(prev, next) { return prev + SMOOTH * (((next - prev + 540) % 360) - 180); }

function onOrientation(e) {
  const base = cameraDirection(e.alpha || 0, e.beta || 0, e.gamma || 0);
  // iOS: webkitCompassHeading is true-north heading of the device top.
  // Correct azimuth by the difference from alpha.
  let az = base.az;
  if (typeof e.webkitCompassHeading === 'number') {
    _haveCompass = true;
    az = norm360(base.az - (e.alpha || 0) + (360 - e.webkitCompassHeading));
  } else if (e.absolute === true) {
    _haveCompass = true;
  }
  _heading = norm360(lp(_heading, az));
  _altitude = _altitude + SMOOTH * (base.alt - _altitude);
}

// Request permission (iOS 13+) and start listening. Returns true on success.
export async function startOrientation() {
  const Evt = window.DeviceOrientationEvent;
  if (Evt && typeof Evt.requestPermission === 'function') {
    const res = await Evt.requestPermission();
    if (res !== 'granted') return false;
  }
  window.addEventListener('deviceorientation', onOrientation, true);
  return true;
}

export function getAim() { return { az: _heading, alt: _altitude, haveCompass: _haveCompass }; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/orientation.test.js`
Expected: PASS — both tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/sensors/orientation.js tests/orientation.test.js
git commit -m "feat: device orientation to aim direction"
git push
```

---

## Task 13: Location (GPS + manual fallback)

**Files:**
- Create: `src/sensors/location.js`

Mostly browser glue; verified on-device.

- [ ] **Step 1: Write the module**

`src/sensors/location.js`:

```js
// Resolve the observer's location. Tries GPS; falls back to a manual prompt.
// Returns { lat, lon } in degrees (lon east-positive).
export async function getLocation() {
  if (navigator.geolocation) {
    try {
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false, timeout: 8000, maximumAge: 600000,
        })
      );
      return { lat: pos.coords.latitude, lon: pos.coords.longitude };
    } catch {
      /* fall through to manual */
    }
  }
  return manualLocation();
}

function manualLocation() {
  const raw = window.prompt(
    'Location unavailable. Enter "latitude, longitude" (e.g. 47.6, -122.3):',
    '0, 0'
  );
  const [lat, lon] = (raw || '0,0').split(',').map((s) => parseFloat(s.trim()));
  return { lat: Number.isFinite(lat) ? lat : 0, lon: Number.isFinite(lon) ? lon : 0 };
}
```

- [ ] **Step 2: Deploy and verify on the iPhone**

```bash
git add src/sensors/location.js
git commit -m "feat: geolocation with manual fallback"
git push
```

Reload on the iPhone — location is exercised end-to-end in Task 14. For now confirm no console errors when importing.

---

## Task 14: Live-stats formatting, panel, and render loop

**Files:**
- Create: `src/ui/panel.js`
- Test: `tests/panel.test.js`
- Modify: `src/main.js`

- [ ] **Step 1: Write the failing test for pure formatting**

`tests/panel.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatLiveStats } from '../src/ui/panel.js';

test('formats distance, light-time, and visibility note', () => {
  const rows = formatLiveStats(
    { name: 'Sedna', facts: { blurb: 'x' }, H: 1.5 },
    { distAU: 84, ra: 40, dec: 7, alt: -30, az: 120, rHelio: 84 }
  );
  const map = Object.fromEntries(rows.map((r) => [r.label, r.value]));
  assert.ok(map['Distance from Earth'].includes('84.0 AU'));
  assert.ok(map['Light-time'].toLowerCase().includes('hour'));
  assert.ok(map['Above horizon?'].toLowerCase().includes('below'));
  assert.ok(map['Apparent magnitude'].includes('too faint'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/panel.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/ui/panel.js`**

```js
import { lightTimeSeconds, apparentMagnitude } from '../astronomy/photometry.js';

const AU_KM = 149597870.7;

function lightTimeText(distAU) {
  const s = lightTimeSeconds(distAU);
  const h = s / 3600;
  if (h >= 1) return `${h.toFixed(1)} light-hours`;
  return `${(s / 60).toFixed(1)} light-minutes`;
}

// Build the list of {label, value} rows for the stats panel (pure).
export function formatLiveStats(body, live) {
  const mag = apparentMagnitude(body.H, live.rHelio, live.distAU);
  const f = body.facts;
  return [
    { label: 'Distance from Earth', value:
      `${live.distAU.toFixed(1)} AU  (${(live.distAU * AU_KM).toExponential(2)} km)` },
    { label: 'Light-time', value: lightTimeText(live.distAU) },
    { label: 'Direction', value: `az ${live.az.toFixed(0)}deg, alt ${live.alt.toFixed(0)}deg` },
    { label: 'RA / Dec', value: `${live.ra.toFixed(1)}deg / ${live.dec.toFixed(1)}deg` },
    { label: 'Above horizon?', value:
      live.alt >= 0 ? `Yes (${live.alt.toFixed(0)}deg up)` : `No (${(-live.alt).toFixed(0)}deg below)` },
    { label: 'Apparent magnitude', value: `~${mag.toFixed(1)} (far too faint to see)` },
    { label: 'Diameter', value: `${f.diameterKm} km` },
    { label: 'Orbital period', value: `${f.periodYears} years` },
    { label: 'Perihelion / aphelion', value: `${f.perihelionAU} / ${f.aphelionAU} AU` },
    { label: 'Surface temp', value: `${f.surfaceTempK} K` },
    { label: 'Discovered', value: f.discovery },
    { label: 'Next perihelion', value: f.nextPerihelion },
  ];
}

// Render rows into the panel element and reveal it (DOM glue).
export function showPanel(panelEl, body, live) {
  const rows = formatLiveStats(body, live);
  panelEl.innerHTML =
    `<h2>${body.name}</h2><p class="blurb">${body.facts.blurb}</p>` +
    rows.map((r) =>
      `<div class="row"><span class="label">${r.label}</span><span>${r.value}</span></div>`
    ).join('');
  panelEl.classList.remove('hidden');
}

export function hidePanel(panelEl) { panelEl.classList.add('hidden'); }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/panel.test.js`
Expected: PASS.

- [ ] **Step 5: Write the full render loop in `src/main.js`**

```js
import { startCamera } from './sensors/camera.js';
import { startOrientation, getAim } from './sensors/orientation.js';
import { getLocation } from './sensors/location.js';
import { julianDate } from './astronomy/time.js';
import { equatorialFromBody, localSiderealTime, raDecToAltAz } from './astronomy/coords.js';
import { heliocentricEcliptic } from './astronomy/orbit.js';
import { projectToScreen, isHovering } from './render/projection.js';
import { BODIES, EARTH } from './data/bodies.js';
import { showPanel, hidePanel } from './ui/panel.js';

const FOV = 60;            // approximate camera horizontal FOV (deg)
const HOVER_PX = 40;

const video = document.getElementById('cam');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');
const panel = document.getElementById('panel');
const startBtn = document.getElementById('start');

let location = { lat: 0, lon: 0 };
let hoveredName = null;

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resize);

startBtn.addEventListener('click', async () => {
  try {
    await startCamera(video);
    await startOrientation();
    location = await getLocation();
    resize();
    startBtn.style.display = 'none';
    requestAnimationFrame(loop);
  } catch (err) { startBtn.textContent = 'Setup failed — see console'; console.error(err); }
});

// Compute every body's current alt/az + live stats.
function computeBodies() {
  const jd = julianDate(new Date());
  const lst = localSiderealTime(jd, location.lon);
  return BODIES.map((body) => {
    const { ra, dec, distAU } = equatorialFromBody(body, EARTH, jd);
    const { alt, az } = raDecToAltAz(ra, dec, lst, location.lat);
    const h = heliocentricEcliptic(body, jd);
    const rHelio = Math.hypot(h.x, h.y, h.z);
    return { body, live: { ra, dec, distAU, alt, az, rHelio } };
  });
}

function loop() {
  const aim = getAim();
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  let newHover = null;
  for (const { body, live } of computeBodies()) {
    const p = projectToScreen({ az: aim.az, alt: aim.alt }, { az: live.az, alt: live.alt }, FOV, W, H);
    if (p.onScreen) {
      drawMarker(p.x, p.y, body.name);
      if (isHovering({ x: p.x, y: p.y }, W / 2, H / 2, HOVER_PX)) {
        newHover = { body, live };
      }
    } else {
      drawChevron(p.dAz, p.dAlt, body.name, W, H);
    }
  }

  if (newHover && newHover.body.name !== hoveredName) {
    hoveredName = newHover.body.name;
    showPanel(panel, newHover.body, newHover.live);
  } else if (!newHover && hoveredName) {
    hoveredName = null;
    hidePanel(panel);
  }
  requestAnimationFrame(loop);
}

function drawMarker(x, y, name) {
  ctx.beginPath(); ctx.arc(x, y, 10, 0, 2 * Math.PI);
  ctx.strokeStyle = '#ffd75e'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#ffd75e'; ctx.font = '14px system-ui';
  ctx.fillText(name, x + 14, y + 4);
}

function drawChevron(dAz, dAlt, name, W, H) {
  // Point an arrow from center toward the off-screen target.
  const ang = Math.atan2(-dAlt, dAz); // screen: +x right, +y down
  const r = Math.min(W, H) * 0.4;
  const x = W / 2 + Math.cos(ang) * r, y = H / 2 + Math.sin(ang) * r;
  ctx.fillStyle = 'rgba(255,215,94,0.8)'; ctx.font = '12px system-ui';
  ctx.fillText('› ' + name, x - 20, y);
}
```

- [ ] **Step 6: Deploy and verify on the iPhone**

```bash
git add src/ui/panel.js src/main.js tests/panel.test.js
git commit -m "feat: render loop, markers, and stats panel"
git push
```

On the iPhone: tap start, allow motion + camera + location. Slowly sweep the sky.
Expected: yellow markers appear for any above-horizon worlds; off-screen ones show "› name" arrows; centering a marker in the reticle slides up its stats panel. (Markers may sit a few degrees off true position — compass error; calibrated in Task 15.)

---

## Task 15: PWA install + service worker + on-device calibration

**Files:**
- Create: `manifest.json`
- Create: `sw.js`
- Create: `icons/icon-192.png`, `icons/icon-512.png`
- Modify: `index.html`

- [ ] **Step 1: Create `manifest.json`**

```json
{
  "name": "SednaFinder",
  "short_name": "SednaFinder",
  "start_url": ".",
  "display": "standalone",
  "background_color": "#05060a",
  "theme_color": "#05060a",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: Add icons**

Create two solid dark-blue PNGs with a small white dot (Sedna) — any image editor, sizes 192×192 and 512×512 — saved to `icons/`. Placeholder solid-color PNGs are fine for v1.

- [ ] **Step 3: Create `sw.js` (offline cache of the app shell)**

```js
const CACHE = 'sednafinder-v1';
const ASSETS = [
  './', './index.html', './styles.css', './manifest.json',
  './src/main.js',
  './src/sensors/camera.js', './src/sensors/orientation.js', './src/sensors/location.js',
  './src/astronomy/angles.js', './src/astronomy/time.js', './src/astronomy/kepler.js',
  './src/astronomy/orbit.js', './src/astronomy/coords.js', './src/astronomy/photometry.js',
  './src/render/projection.js', './src/data/bodies.js', './src/ui/panel.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
```

- [ ] **Step 4: Link manifest + register the service worker in `index.html`**

Add inside `<head>`:

```html
<link rel="manifest" href="manifest.json" />
<link rel="apple-touch-icon" href="icons/icon-192.png" />
```

Add before `</body>`:

```html
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
  }
</script>
```

- [ ] **Step 5: Deploy**

```bash
git add manifest.json sw.js icons/ index.html
git commit -m "feat: PWA manifest, service worker, icons"
git push
```

- [ ] **Step 6: Install on the iPhone**

In Safari: open the URL → Share → **Add to Home Screen**. Launch from the new icon.
Expected: opens full-screen (no Safari chrome), with its own icon.

- [ ] **Step 7: Compass calibration check**

On a clear night, point the phone at the **Moon** (or a known bright planet). Compare its real position to where the app would place a marker at the same alt/az.
- If markers are consistently rotated by a fixed amount, adjust the heading correction in `src/sensors/orientation.js` `onOrientation` (the `webkitCompassHeading` term) and re-deploy.
- Wave the phone in a figure-8 first to let iOS calibrate its magnetometer.
Expected: markers land within a few degrees of the true direction.

- [ ] **Step 8: Final offline check + commit**

Put the phone in Airplane Mode and relaunch the installed app.
Expected: the app shell loads from cache (camera needs no network; positions are computed on-device).

```bash
git commit --allow-empty -m "test: on-device calibration and offline verified"
git push
```

---

## Self-Review Notes (planner)

- **Spec coverage:** AR pointing (Tasks 9, 12, 14), 7 worlds (Task 8), stats panel live+facts (Task 14), on-device ephemeris (Tasks 3–8), no-compass/permission fallbacks (Tasks 12–13, `getAim().haveCompass`), below-horizon handling (panel + chevrons, Task 14), offline PWA (Task 15), HTTPS deploy from Windows (Task 10), Node unit tests on Windows (Tasks 2–9, 12, 14). All spec sections map to tasks.
- **Accuracy caveat** from the spec is reflected in Task 15's calibration step.
- **Out-of-scope** items (accounts, backend, 3D, native build, notifications) are absent by construction.
