# SednaFinder — Design Spec

- **Date:** 2026-06-12
- **Status:** Approved (ready for implementation planning)
- **Author:** paine + Claude

## 1. Overview

SednaFinder is a mobile **augmented-reality sky finder** for the dwarf planet **90377 Sedna** and the other distant worlds of the outer Solar System. You hold your phone up; the camera fills the screen; an overlay draws a marker wherever each target world actually is in the sky right now. Centering the on-screen reticle on a marker ("hovering") slides up a clean panel with everything worth knowing about that world.

Because these worlds are far too faint to ever see by eye, the appeal is "pointing at an invisible thing": the app lets you aim at a patch of empty-looking sky — or at the ground, through the Earth, in daytime — and *know* a frozen world is out there in that exact direction, and exactly how far.

It ships as a **web app (PWA)**, not a native app: opened in iPhone Safari and added to the Home Screen.

## 2. Goals & Non-Goals

### Goals
- Point-and-find: live, sensor-driven aiming at real sky positions.
- A clean, information-rich stats panel as the centerpiece payoff.
- Run on the user's **iPhone** with **no Mac, no Xcode, no App Store, and no sideloading** — developed entirely from a Windows PC.
- Work fully offline once loaded (dark-sky / no-signal friendly).
- Be honest about its own accuracy and limits.

### Non-Goals (v1)
- No native iOS/Android build, no app store distribution.
- No accounts, login, or backend server (static hosting only).
- No full star/constellation catalog rendering (we only *name* the constellation a body sits in).
- No 3D orbit visualization (candidate for v2).
- No push notifications.

## 3. Target Devices & Constraints

- **Primary device:** the user's **iPhone** (has magnetometer + gyroscope — required for sky pointing).
- **Dev machine:** Windows 11 PC (no Mac available).
- **Secondary/optional:** an Amazon Fire tablet. It likely **lacks a compass/gyroscope**; if so, live aiming is physically impossible there and the app degrades gracefully (stats + target list, no live marker). Same single URL runs on both via the browser.
- **Hard requirement:** the app must be served over **HTTPS**, or browsers will not unlock the motion, camera, or location sensors. The chosen free host provides HTTPS automatically.

## 4. Feature Scope — The Worlds

Seven targets, Sedna as the headliner plus the far-frontier worlds:

1. **Sedna** (90377) — the hero
2. **Pluto** (134340)
3. **Eris** (136199)
4. **Makemake** (136472)
5. **Haumea** (136108)
6. **Gonggong** (225088)
7. **Quaoar** (50000)

All seven have well-determined orbits and rich, well-documented physical stats.

## 5. Core Interaction

1. Open app → grant motion + camera + location permissions (one-time taps; iOS requires an explicit user gesture to enable orientation).
2. Camera fills the screen. A fixed **reticle** sits at screen center.
3. Each world is drawn as a **labeled marker** at its true position; worlds off-screen or below the horizon show a **directional chevron** at the screen edge ("turn left," "look down," "below horizon").
4. **Hover** = bring the reticle within a small angular threshold (~3°) of a marker, or tap a marker → the **stats panel** animates up for that world.
5. A **target list** lets you pick a world and be guided to it ("Sedna is 40° up and to your right").

## 6. The Stats Panel (Payoff)

Two groups per world.

### Live (computed for the current moment + observer location)
- Current distance from Earth — in AU, km, and light-time (e.g. "11.6 light-hours").
- Direction — altitude and azimuth.
- Equatorial coordinates — RA / Dec.
- Constellation the body currently sits in front of.
- Above or below your horizon (and, if below, how far).
- Apparent magnitude, with an honest visibility note (e.g. "~mag 20.5 — roughly 25,000× too faint to ever see by eye; naked-eye limit is ~6").

### Facts (static)
- Diameter (and shape note for Haumea).
- Orbital period (Sedna ≈ 11,400 years).
- Perihelion / aphelion distance.
- Orbital eccentricity and inclination.
- Surface temperature (Sedna ≈ 12 K).
- Discovery date + discoverer(s).
- Date of next perihelion.
- A one-line "wonder" blurb.

## 7. The Pointing Engine

The pipeline that turns sensors + time + math into an on-screen marker:

1. **Where the phone points** — the `DeviceOrientation` API exposes the iPhone's compass heading (`webkitCompassHeading`) and tilt (beta/gamma). A low-pass smoothing filter steadies jitter. Output: the azimuth + altitude the back camera is aimed at.
2. **Where the world is** — on-device astronomy:
   - Each body's orbit is stored as **Keplerian orbital elements** (J2000).
   - Solve Kepler's equation for the current time → heliocentric position.
   - Subtract Earth's heliocentric position (Earth's own elements) → **geocentric** position → **RA / Dec**.
   - Convert RA/Dec → **altitude / azimuth** using the observer's GPS latitude/longitude and the local sidereal time.
3. **Place on screen** — compare each world's az/alt to the phone's az/alt; render the marker at the angular offset, or a directional chevron if off-screen / below horizon. Detect "hover" when a marker is within the reticle threshold.

**Accuracy note (honest):** Keplerian propagation is good to sub-arcminute for these slow, distant worlds — far finer than needed. The real limiting factor is the **iPhone's compass (~1–5°)**, so a marker may sit a couple of degrees off true. The app shows a compass-accuracy indicator and a "wave the phone in a figure-8 to calibrate" hint.

## 8. Architecture

All static files — no backend.

- `index.html` — shell: full-screen `<video>` camera background, overlay layer, center reticle, panels.
- **camera** module — `getUserMedia`, stream to the background video.
- **orientation** module — `DeviceOrientation` listener, iOS permission-request gesture, smoothing filter; outputs current az/alt.
- **location** module — `Geolocation` (fetched once, cached); manual lat/long entry fallback if denied.
- **astronomy** module — orbital-elements table, Kepler solver, coordinate transforms. **Pure functions** (no DOM, no sensors) so they are unit-testable on the Windows PC under Node.
- **targeting/render** module — projects each world's az/alt against the device az/alt onto screen coordinates; draws markers, labels, and off-screen chevrons; detects hover.
- **ui** module — stats panel, target list, permission and calibration prompts.
- `bodies.js` — data file: the seven worlds' orbital elements + static facts.
- `manifest.json` + **service worker** — app icon, full-screen `standalone` display, and offline caching of all assets so it works with no signal.

## 9. Data Model (`bodies.js`)

Each world is one record containing:
- Identity: name, designation, short blurb.
- Orbital elements (J2000): semi-major axis, eccentricity, inclination, longitude of ascending node, argument of perihelion, mean anomaly at epoch, epoch.
- Physical facts: diameter, surface temp, discovery date + discoverer, next perihelion, perihelion/aphelion (derivable from a + e but stored for display), absolute magnitude H (for apparent-magnitude estimation).

Earth's orbital elements are stored alongside (needed to compute geocentric positions).

## 10. Errors & Edge Cases

- **Permission denied** (motion / camera / location) — each gets a plain-English explainer and a fallback. Location denial → manual lat/long or city entry. Camera denial → overlay still works on a plain background. Motion denial → falls back to target-list mode.
- **No compass on the device** (e.g. the Fire tablet) — detect the absence and say so clearly; offer stats + target list without live aiming rather than silently failing.
- **Below-horizon / daytime targets** — show a directional chevron and an explanation ("Sedna is 34° below your horizon — it's on the far side of the Earth right now") instead of nothing.
- **Compass inaccuracy / not calibrated** — show an accuracy indicator and a figure-8 calibration hint.
- **No HTTPS** — sensors stay locked; deployment must use an HTTPS host.

## 11. Testing Strategy

- **Astronomy module:** unit-tested on the Windows PC with Node. Validate computed RA/Dec (and distance) for Sedna and Pluto against known ephemeris values (e.g. JPL Horizons) for specific dates, within a tight tolerance.
- **Sensors / camera / rendering:** manual testing on the actual iPhone — verify a known bright reference (e.g. the Moon or a planet, by aiming at it on a clear night) lands near its marker, accounting for compass error.

## 12. Deployment

- Static files hosted on a free **HTTPS** host (e.g. GitHub Pages, Netlify, or Vercel).
- Install on iPhone: open the URL in Safari → "Add to Home Screen" → launches full-screen with an icon. No re-install/expiry cycle.

## 13. Future (v2 candidates)

- 3D orbit view showing where each world sits in its orbit around the Sun.
- More objects (comets, spacecraft like the Voyagers, nearby stars).
- A "time travel" slider to see where Sedna was/will be over its 11,400-year orbit.
