import * as THREE from 'three';

/**
 * Ultra-Realistic 3D Aerodynamic Windtunnel & CFD Flow Simulation
 * for the Argon 18 Nitrogen Pro (SRAM RED AXS / Scope Artech 6.A+).
 *
 * Physics & Rendering Architecture:
 * 1. True 3D spatial advection (RK2 streamline integration) around oriented 3D frame
 *    airfoil capsules and toroidal rotating wheels (open spoke disk + rotational swirl).
 * 2. Strict surface non-penetration (closest-point normal repulsion) so streamlines
 *    part cleanly around the Speed Sniffer headtube, fork crown slot, Kamm-tail downtube,
 *    ATTEN cockpit, and 65mm Scope Aeroscale rims.
 * 3. Custom GLSL volumetric filament & smoke-plume shader with Gaussian cylindrical
 *    cross-sections, procedural FBM turbulence wisps, and wake diffusion (filaments
 *    expand in width and drop in optical density in turbulent wake zones).
 * 4. Physical 3D Windtunnel Smoke Rake Mast with motorized elevation carriage.
 */

// Toroidal wheel obstacles (air parts around the 30c tire + 65mm rim torus, while passing through the open spoke disk with swirl)
const WHEEL_TOROIDS = [
  {
    name: 'FrontWheel',
    center: new THREE.Vector3(0.5877, 0.342, 0.0),
    majorR: 0.296, // Mid-chord of 65mm rim + 30c tire
    radialHalf: 0.052, // Covers from r=0.244 to r=0.348
    lateralHalf: 0.022, // 32mm rim belly + boundary layer
    hubR: 0.042,
    hubZ: 0.052,
  },
  {
    name: 'RearWheel',
    center: new THREE.Vector3(-0.4023, 0.342, 0.0),
    majorR: 0.296,
    radialHalf: 0.052,
    lateralHalf: 0.024,
    hubR: 0.068, // Includes 10-33T cassette & disc rotor
    hubZ: 0.066,
  },
];

// Oriented 3D Capsule / Kamm-Tail Airfoil Segments representing the exact Nitrogen Pro geometry
const CAPSULE_SEGMENTS = [
  // 1. Speed Sniffer Hourglass Head Tube
  {
    a: new THREE.Vector3(0.433, 0.686, 0.0),
    b: new THREE.Vector3(0.392, 0.822, 0.0),
    rx: 0.048,
    rz: 0.028,
    strength: 1.25,
    type: 'airfoil',
  },
  // 2. ATTEN CHB-01 Integrated Aero Stem & Spacer Stack
  {
    a: new THREE.Vector3(0.388, 0.820, 0.0),
    b: new THREE.Vector3(0.492, 0.864, 0.0),
    rx: 0.036,
    rz: 0.028,
    strength: 1.05,
    type: 'airfoil',
  },
  // 3. ATTEN CHB-01 Aero Cockpit Wing Bar
  {
    a: new THREE.Vector3(0.492, 0.862, -0.195),
    b: new THREE.Vector3(0.492, 0.862, 0.195),
    rx: 0.032,
    rz: 0.024,
    strength: 1.15,
    type: 'wing',
  },
  // 4. Left & Right SRAM RED AXS Hoods & Drop Bars (shed tip vortices)
  {
    a: new THREE.Vector3(0.576, 0.920, 0.196),
    b: new THREE.Vector3(0.555, 0.742, 0.208),
    rx: 0.032,
    rz: 0.026,
    strength: 1.10,
    type: 'hood',
  },
  {
    a: new THREE.Vector3(0.576, 0.920, -0.196),
    b: new THREE.Vector3(0.555, 0.742, -0.208),
    rx: 0.032,
    rz: 0.026,
    strength: 1.10,
    type: 'hood',
  },
  // 5. Left & Right Wide Aero Fork Blades
  {
    a: new THREE.Vector3(0.442, 0.672, 0.028),
    b: new THREE.Vector3(0.588, 0.342, 0.052),
    rx: 0.036,
    rz: 0.018,
    strength: 1.08,
    type: 'fork',
  },
  {
    a: new THREE.Vector3(0.442, 0.672, -0.028),
    b: new THREE.Vector3(0.588, 0.342, -0.052),
    rx: 0.036,
    rz: 0.018,
    strength: 1.08,
    type: 'fork',
  },
  // 6. Kamm-Tail Down Tube (Headtube throat to T47 BB)
  {
    a: new THREE.Vector3(0.418, 0.725, 0.0),
    b: new THREE.Vector3(0.0, 0.263, 0.0),
    rx: 0.048,
    rz: 0.033,
    strength: 1.32,
    type: 'airfoil',
  },
  // 7. Sloping Aero Top Tube
  {
    a: new THREE.Vector3(0.404, 0.784, 0.0),
    b: new THREE.Vector3(-0.144, 0.741, 0.0),
    rx: 0.026,
    rz: 0.024,
    strength: 0.95,
    type: 'airfoil',
  },
  // 8. Wheel-Hugging Seat Tube & Aero Seatpost
  {
    a: new THREE.Vector3(0.0, 0.263, 0.0),
    b: new THREE.Vector3(-0.222, 0.962, 0.0),
    rx: 0.034,
    rz: 0.025,
    strength: 1.15,
    type: 'airfoil',
  },
  // 9. ATTEN Integrated Aero Bottle Cages & Bidon Shielding Zone
  {
    a: new THREE.Vector3(0.185, 0.495, 0.0),
    b: new THREE.Vector3(-0.045, 0.455, 0.0),
    rx: 0.052,
    rz: 0.038,
    strength: 1.05,
    type: 'bottle',
  },
  // 10. Oversized T47 Bottom Bracket & SRAM RED 48/35T Powermeter Crankset
  {
    a: new THREE.Vector3(0.015, 0.263, -0.056),
    b: new THREE.Vector3(0.015, 0.263, 0.068),
    rx: 0.098,
    rz: 0.064,
    strength: 1.28,
    type: 'bb',
  },
  // 11. Horizontal Dropped Seatstays (Left & Right)
  {
    a: new THREE.Vector3(-0.095, 0.566, 0.025),
    b: new THREE.Vector3(-0.402, 0.344, 0.070),
    rx: 0.022,
    rz: 0.015,
    strength: 0.85,
    type: 'airfoil',
  },
  {
    a: new THREE.Vector3(-0.095, 0.566, -0.025),
    b: new THREE.Vector3(-0.402, 0.344, -0.070),
    rx: 0.022,
    rz: 0.015,
    strength: 0.85,
    type: 'airfoil',
  },
  // 12. Repente Quasar CR 2.0 Saddle
  {
    a: new THREE.Vector3(-0.305, 0.988, 0.0),
    b: new THREE.Vector3(-0.085, 0.980, 0.0),
    rx: 0.022,
    rz: 0.068,
    strength: 1.05,
    type: 'wing',
  },
];

/**
 * Evaluates the 3D aerodynamic velocity perturbation, surface repulsion, pressure coefficient Cp,
 * and wake turbulence at world coordinate (x, y, z).
 */
function sampleAeroVelocityAndPressure(x, y, z, yawRad, hydrationMode = 'cages') {
  let vy = 0.0;
  let vz = -Math.tan(yawRad) * 0.46; // Freestream crosswind yaw component
  let enforceY = y;
  let enforceZ = z;
  let cp = 0.0; // Pressure coefficient: +1 = stagnation, -1 = high-speed Venturi suction
  let turb = 0.0; // Wake turbulence / eddy viscosity [0..1]
  let swirl = 0.0; // Rotational vorticity for helical wake filaments

  // 0. Macroscopic 3D Potential-Flow Silhouette Arching (Non-Canceling Streamline Pitch)
  // Real windtunnel streamlines curve macroscopically in Y around the bike's pressure field:
  // A) Front Tire Crown & Fork Crown Arch: lifts streamlines up and over the front wheel (x in [0.50, 1.02], y in [0.46, 0.74])
  const frontWheelArchEnv =
    Math.exp(-Math.pow((x - 0.74) / 0.25, 2)) *
    Math.exp(-Math.pow((y - 0.58) / 0.14, 2)) *
    Math.exp(-Math.pow(z / 0.15, 2));
  vy += 0.52 * frontWheelArchEnv;

  // B) Speed Sniffer Headtube & ATTEN CHB-01 Cockpit Upwash -> Sloping Top Tube Downwash
  // Streamlines in y in [0.64, 0.98] pitch strongly UPWARD (+Y) from x=0.88 to x=0.40 to clear the
  // integrated stem & wing bar, then sweep gently downward along the sloping top tube (x in [-0.02, 0.34]).
  const cockpitYEnv = Math.exp(-Math.pow((y - 0.80) / 0.16, 2)) * Math.exp(-Math.pow(z / 0.22, 2));
  const cockpitUpwash = Math.exp(-Math.pow((x - 0.56) / 0.23, 2));
  const topTubeDownwash = Math.exp(-Math.pow((x - 0.14) / 0.20, 2));
  vy += cockpitYEnv * (0.62 * cockpitUpwash - 0.28 * topTubeDownwash);

  // C) Repente Quasar CR 2.0 Saddle & Seatpost Crown Arch (x around -0.20, y in [0.80, 1.06])
  const saddleYEnv = Math.exp(-Math.pow((y - 0.93) / 0.12, 2)) * Math.exp(-Math.pow(z / 0.15, 2));
  const saddleUpwash = Math.exp(-Math.pow((x - -0.05) / 0.18, 2));
  const saddleDownwash = Math.exp(-Math.pow((x - -0.38) / 0.20, 2));
  vy += saddleYEnv * (0.46 * saddleUpwash - 0.34 * saddleDownwash);

  // D) Swept Kamm-Tail Downtube & T47 Bottom Bracket Flow Divider (x in [-0.05, 0.45], y in [0.18, 0.65])
  // Compare y against the actual downtube centerline height yTube(x) so the vertical deflection
  // never flips sign or cancels out when crossing the angled downtube!
  if (x > -0.12 && x < 0.50 && y > 0.15 && y < 0.68) {
    const tDt = THREE.MathUtils.clamp(x / 0.418, 0.0, 1.0);
    const yDtCenter = 0.263 + tDt * (0.725 - 0.263);
    const dyFromDt = y - yDtCenter;
    const dtEnv =
      Math.exp(-Math.pow(dyFromDt / 0.14, 2)) *
      Math.exp(-Math.pow((x - 0.20) / 0.26, 2)) *
      Math.exp(-Math.pow(z / 0.14, 2));
    // Streamlines above the downtube lift over the bottle cages; streamlines below sweep down under the T47 BB
    const dtVerticalDir = dyFromDt >= -0.015 ? 1.0 : -1.0;
    vy += dtVerticalDir * 0.42 * dtEnv;
  }

  // 1. Evaluate Toroidal Rotating Wheels (Rim/Tire Torus + Open Spoke Disk Swirl)
  for (let w = 0; w < WHEEL_TOROIDS.length; w++) {
    const wh = WHEEL_TOROIDS[w];
    const dx = x - wh.center.x;
    const dy = y - wh.center.y;
    const dz = z - wh.center.z;
    const rXY = Math.hypot(dx, dy) + 1e-6;

    // A. Toroidal Rim & 30c Tire Ring (majorR = 0.296m)
    const dRadial = rXY - wh.majorR;
    const normRad = dRadial / wh.radialHalf;
    const normLat = dz / wh.lateralHalf;
    const torusDistSq = normRad * normRad + normLat * normLat;

    if (torusDistSq < 6.0) {
      const falloff = Math.exp(-torusDistSq * 0.62);
      const ux = dx / rXY;
      const uy = dy / rXY;

      // Leading edge stagnation on the front tire tread (dx > 0 && dRadial > -0.02)
      if (ux > 0.30 && Math.abs(normLat) < 1.45) {
        cp += falloff * 1.32 * ux * Math.exp(-normRad * normRad * 1.25);
      } else if (Math.abs(normLat) > 0.28 && Math.abs(normLat) < 1.95) {
        // Accelerated Venturi flow over the 65mm Scope Aeroscale toroidal rim flanks!
        cp -= falloff * 0.96;
      }

      // Deflect laterally around the 30.4mm/32mm rim flanks and arch over/under the tire crown
      const zDir = Math.abs(dz) < 0.0025 ? (y > wh.center.y ? 1 : -1) : Math.sign(dz);
      vz += zDir * 0.62 * falloff * (1.25 - Math.min(1.0, Math.abs(normLat) * 0.42));
      const crownPitch = dx > -0.08 ? 0.54 : -0.18;
      vy += uy * crownPitch * falloff;

      // Hard boundary layer non-penetration around the tire/rim torus cross-section
      if (torusDistSq < 1.15) {
        const pen = 1.15 - Math.sqrt(torusDistSq);
        enforceZ += zDir * pen * wh.lateralHalf * 0.95;
        if (Math.abs(uy) > 0.52) {
          enforceY += Math.sign(uy) * pen * wh.radialHalf * 0.55;
        }
      }

      // Trailing wake behind the rear of the tire/rim (ux < -0.25)
      if (ux < -0.25) {
        turb += falloff * 0.60 * Math.abs(ux);
        swirl += falloff * zDir * 0.78;
      }
    }

    // B. Open Spoke Disk & Hub / Rotor / Cassette Core (rXY < 0.245m)
    if (rXY < 0.245 && Math.abs(dz) < 0.065) {
      const spokeFalloff = Math.exp(-(dz * dz) / (0.042 * 0.042));
      // Rotating bladed spokes impart a downward/helical Magnus swirl
      vy += (dx > 0 ? 0.16 : -0.18) * (dy / 0.245) * spokeFalloff;
      vz += (dy / 0.245) * 0.11 * spokeFalloff;
      cp -= 0.24 * spokeFalloff;
      turb += 0.18 * spokeFalloff;
    }

    // C. Hub Shell, Disc Rotor & Cassette Center Obstacle
    const hubDistSq = (dx * dx + dy * dy) / (wh.hubR * wh.hubR) + (dz * dz) / (wh.hubZ * wh.hubZ);
    if (hubDistSq < 4.5) {
      const hFall = Math.exp(-hubDistSq * 0.70);
      const zSign = dz >= 0 ? 1 : -1;
      vz += zSign * 0.48 * hFall;
      vy += (dy >= 0 ? 1 : -1) * 0.42 * hFall;
      turb += 0.52 * hFall;
    }
  }

  // 2. Evaluate Oriented 3D Frame / Cockpit / Drivetrain Capsule Segments
  for (let i = 0; i < CAPSULE_SEGMENTS.length; i++) {
    const seg = CAPSULE_SEGMENTS[i];
    if (seg.type === 'bottle' && hydrationMode === 'stripped') continue;
    const bottleScale = seg.type === 'bottle' && hydrationMode === 'bottles' ? 1.35 : 1.0;

    // Closest point on 3D line segment [a, b] to p = (x, y, z)
    const abx = seg.b.x - seg.a.x;
    const aby = seg.b.y - seg.a.y;
    const abz = seg.b.z - seg.a.z;
    const apx = x - seg.a.x;
    const apy = y - seg.a.y;
    const apz = z - seg.a.z;
    const abLenSq = abx * abx + aby * aby + abz * abz + 1e-8;
    const t = Math.max(0.0, Math.min(1.0, (apx * abx + apy * aby + apz * abz) / abLenSq));

    const cx = seg.a.x + abx * t;
    const cy = seg.a.y + aby * t;
    const cz = seg.a.z + abz * t;

    const dx = x - cx;
    const dy = y - cy;
    const dz = z - cz;

    const rx = seg.rx * bottleScale;
    const rz = seg.rz * bottleScale;

    const nx = dx / rx;
    const ny = dy / rx;
    const nz = dz / rz;
    const distSq = nx * nx + ny * ny + nz * nz;

    if (distSq < 7.5) {
      const falloff = Math.exp(-distSq * 0.60) * seg.strength;

      // Leading-edge high-pressure stagnation right in front of the airfoil nose (nx > 0.15)
      if (nx > 0.12 && nx < 1.70 && ny * ny + nz * nz < 1.50) {
        cp += falloff * 1.30 * Math.exp(-Math.pow(nx - 0.68, 2) * 2.0);
      }

      // High-velocity Venturi suction along the Kamm-tail flanks & fork-crown throat (-0.95 < nx < 0.45)
      if (nx > -0.95 && nx < 0.45 && Math.abs(nz) > 0.20) {
        cp -= falloff * 0.94;
      }

      // Streamline parting around the 3D tube cross-section:
      // Use world height `cy` (rather than segment `t` which is inverted on top-down tubes!)
      // so upper frame tubes consistently arch streamlines UPWARD (+Y) and lower tubes sweep around/under.
      const zSign = Math.abs(dz) < 0.003 ? (i % 2 === 0 ? 1 : -1) : Math.sign(dz);
      const spanYDir =
        seg.type === 'wing'
          ? dy >= -0.022
            ? 1.0
            : -0.65
          : cy >= 0.48
          ? 1.0
          : -0.65;

      if (seg.type === 'wing') {
        vy += spanYDir * 0.78 * falloff * (dx > -0.05 ? 1.0 : -0.40);
        vz += zSign * 0.26 * falloff;
      } else {
        vz += zSign * 0.65 * falloff * (1.25 - Math.min(1.0, Math.abs(nz) * 0.35));
        vy += spanYDir * 0.46 * falloff * (dx > -0.06 ? 1.0 : -0.32);
      }

      // Hard surface boundary-layer repulsion so zero ribbons ever clip through carbon tubes!
      if (distSq < 1.25) {
        const dist = Math.sqrt(distSq) + 1e-5;
        const pen = 1.25 - dist;
        if (seg.type === 'wing') {
          enforceY += (dy >= -0.022 ? 1 : -1) * pen * rx * 0.95;
        } else {
          enforceZ += zSign * pen * rz * 0.98;
          enforceY += spanYDir * pen * rx * 0.48;
        }
      }

      // Kamm-tail & bluff-body trailing wake turbulence (nx < -0.38)
      if (nx < -0.38) {
        const wakeDecay = Math.exp(-Math.abs(nx + 0.38) * 0.45) * Math.exp(-(ny * ny + nz * nz) * 0.68);
        const wakeMult = seg.type === 'bb' ? 0.98 : seg.type === 'hood' ? 0.86 : 0.48;
        turb += wakeDecay * wakeMult;
        swirl += wakeDecay * zSign * (seg.type === 'hood' ? 1.40 : 0.82);
      }
    }
  }

  // 3. Special Wheel-Fork Crown & Seattube Cutout Venturi Acceleration Zones
  const forkSlotDistSq = Math.pow((x - 0.48) / 0.09, 2) + Math.pow((y - 0.64) / 0.08, 2) + Math.pow(z / 0.06, 2);
  if (forkSlotDistSq < 3.0) {
    cp -= 0.88 * Math.exp(-forkSlotDistSq);
    vy += 0.32 * Math.exp(-forkSlotDistSq);
  }

  // Downstream wake expansion behind the rear wheel & derailleur (x < -0.46)
  if (x < -0.46) {
    const wakeDist = Math.hypot((y - 0.46) * 1.05, z * 2.1);
    if (wakeDist < 0.55) {
      const downstreamFactor = Math.min(1.0, (-0.46 - x) * 1.45);
      const wFall = Math.exp(-wakeDist * 3.0) * downstreamFactor;
      turb += wFall * 0.90;
      swirl += wFall * (z >= 0 ? 1 : -1) * 1.05;
    }
  }

  // Keep streamlines above the museum plinth floor (Y >= 0.022m)
  if (enforceY < 0.022) {
    enforceY = 0.022;
    vy = Math.max(0, vy);
  }

  return {
    vy,
    vz,
    enforceY,
    enforceZ,
    cp: THREE.MathUtils.clamp(cp, -1.0, 1.0),
    turb: THREE.MathUtils.clamp(turb, 0.0, 1.0),
    swirl: THREE.MathUtils.clamp(swirl, -1.5, 1.5),
  };
}

/**
 * Maps local pressure coefficient Cp [-1..+1], turbulence [0..1], and flowMode
 * to an authentic aerodynamic RGB color. (Strictly NaN-safe for HalfFloat bloom).
 */
function computeFlowColor(cp, turb, flowMode, targetColor) {
  const safeCp = Number.isFinite(cp) ? cp : 0.0;
  const safeTurb = Number.isFinite(turb) ? turb : 0.0;

  if (flowMode === 'smoke') {
    // Silky Volumetric Windtunnel Smoke: dense titanium-white in accelerated boundary layers,
    // cooling to soft silver-mist in expanded turbulent wakes
    const lum = 0.84 - safeTurb * 0.24 + Math.max(0.0, -safeCp) * 0.16;
    targetColor.setRGB(lum * 0.94, lum * 0.97, lum * 1.02);
    return;
  }

  if (flowMode === 'vortex') {
    // Vorticity / Q-Criterion Heatmap:
    // Laminar freestream = Deep Sapphire/Cyan; Shear & Wake Vortices = Electric Amber -> Magenta/Violet
    if (safeTurb > 0.10) {
      const t = Math.min(1.0, Math.max(0.0, (safeTurb - 0.10) * 1.55));
      const hue =
        t < 0.65
          ? THREE.MathUtils.lerp(0.54, 0.88, t / 0.65)
          : THREE.MathUtils.lerp(0.88, 1.05, (t - 0.65) / 0.35) % 1.0;
      targetColor.setHSL(hue, 0.96, 0.56 + t * 0.08);
    } else {
      const speedNorm = THREE.MathUtils.clamp(-safeCp * 0.78, 0.0, 1.0);
      targetColor.setHSL(0.56 - speedNorm * 0.07, 0.90, 0.45 + speedNorm * 0.18);
    }
    return;
  }

  // Default: 'cfd' (ANSYS Fluent / Star-CCM+ Pressure & Velocity Heatmap)
  // Stagnation (cp > 0): Cyan -> Yellow -> Warm Crimson/Orange (#ff3b1f)
  // Venturi Suction (cp <= 0): Argon Cyan (#00c8ff) -> Emerald Mint (#10f596)
  if (safeCp >= 0.0) {
    const posCp = Math.max(0.0, safeCp);
    const t = Math.min(1.0, Math.pow(posCp * 1.55, 0.78));
    targetColor.setHSL(THREE.MathUtils.lerp(0.52, 0.02, t), 0.96, 0.52 + t * 0.10);
  } else {
    const negCp = Math.max(0.0, -safeCp);
    const v = Math.min(1.0, Math.pow(negCp * 1.48, 0.85));
    targetColor.setHSL(THREE.MathUtils.lerp(0.53, 0.38, v), 0.95, 0.50 + v * 0.12);
  }
}

/**
 * Builds the complete interactive 3D Windtunnel System
 */
export function createWindTunnelSystem() {
  const windGroup = new THREE.Group();
  windGroup.name = 'WindTunnelGroup';
  windGroup.visible = false;

  const state = {
    active: false,
    windSpeedKmh: 45,
    yawDeg: 0,
    smokeFocus: 0, // 0 = Full Tunnel Field, 1..100 = Focused Smoke Rake Wand Elevation
    flowMode: 'cfd', // 'cfd' | 'smoke' | 'vortex'
    hydrationMode: 'cages',
  };

  // ============================================================================
  // 1. PHYSICAL 3D WINDTUNNEL SMOKE RAKE MAST & MICRO-NOZZLE INJECTOR ARRAY
  // ============================================================================
  const rakeGroup = new THREE.Group();
  rakeGroup.name = 'SmokeRakeHardware';
  // Positioned ahead of the front tire leading edge (x = 0.935m) so the mast frames the right edge cleanly
  const xStart = 1.18;
  const xEnd = -1.10;
  rakeGroup.position.set(xStart, 0, 0);
  windGroup.add(rakeGroup);

  const rakeMetalMat = new THREE.MeshStandardMaterial({
    color: '#1b2028',
    metalness: 0.88,
    roughness: 0.24,
  });
  const rakeChromeMat = new THREE.MeshStandardMaterial({
    color: '#bcc6d4',
    metalness: 0.94,
    roughness: 0.16,
  });
  const rakeGlowMat = new THREE.MeshBasicMaterial({
    color: '#7ce7f7',
    transparent: true,
    opacity: 0.85,
  });

  // Twin vertical NACA airfoil support struts at z = ±0.26m so they frame the front wheel cleanly
  [-0.26, 0.26].forEach((zPos) => {
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.008, 1.04, 16).scale(2.2, 1.0, 0.65),
      rakeMetalMat
    );
    mast.position.set(0.015, 0.52, zPos);
    rakeGroup.add(mast);

    const baseFoot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.032, 0.012, 24),
      rakeMetalMat
    );
    baseFoot.position.set(0.015, 0.006, zPos);
    rakeGroup.add(baseFoot);
  });

  // Top & Bottom cross-bars connecting the twin windtunnel rake struts
  [0.012, 1.04].forEach((yPos) => {
    const crossbar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0045, 0.0045, 0.52, 12).rotateX(Math.PI / 2),
      rakeMetalMat
    );
    crossbar.position.set(0.015, yPos, 0);
    rakeGroup.add(crossbar);
  });

  // Center slim vertical smoke manifold Spine + 15 Brass/Chrome Injector Micro-Nozzles
  const centerSpine = new THREE.Mesh(
    new THREE.BoxGeometry(0.014, 1.00, 0.0035),
    rakeMetalMat
  );
  centerSpine.position.set(0.008, 0.52, 0);
  rakeGroup.add(centerSpine);

  // 15 precision nozzle elevations clustered specifically on the Nitrogen Pro's aerodynamic stations
  const nozzleElevations = [
    0.18, 0.24, 0.30, // Lower wheel / hub / T47 BB / crankset
    0.38, 0.44, 0.50, // Mid wheel / bottle cages / seattube cutout
    0.57, 0.63, 0.68, // Front tire crown / fork crown slot / downtube throat
    0.73, 0.78, 0.83, // Speed Sniffer hourglass headtube & sloping top tube
    0.87, 0.91, 0.95, // ATTEN CHB-01 aero wing bar, SRAM RED hoods & Repente saddle
  ];

  for (let n = 0; n < nozzleElevations.length; n++) {
    const ny = nozzleElevations[n];
    const nozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0016, 0.0024, 0.022, 10).rotateZ(Math.PI / 2),
      rakeChromeMat
    );
    nozzle.position.set(-0.002, ny, 0);
    rakeGroup.add(nozzle);
  }

  // Movable Laser/Smoke Focus Wand Carriage (slides vertically when Smoke Rake Focus > 0)
  const focusCarriage = new THREE.Group();
  focusCarriage.position.set(0.0, 0.54, 0);
  rakeGroup.add(focusCarriage);

  const wandBar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0032, 0.0032, 0.52, 12).rotateX(Math.PI / 2),
    rakeChromeMat
  );
  focusCarriage.add(wandBar);

  const wandEmitterRing = new THREE.Mesh(
    new THREE.BoxGeometry(0.008, 0.016, 0.24),
    rakeGlowMat
  );
  wandEmitterRing.position.set(-0.004, 0, 0);
  focusCarriage.add(wandEmitterRing);

  // ============================================================================
  // 2. 3D VOLUMETRIC STREAMLINE FILAMENTS (Custom GLSL Shader + RK2 Advection)
  // ============================================================================
  // 29 sculpted streamlines: 15 directly anchored to the physical micro-nozzles on the
  // symmetry-plane smoke rake, plus 14 flank/cockpit/drivetrain streamlines that wrap
  // around the fork blades, 65mm Scope rims, bottle cages, T47 BB, and SRAM RED hoods.
  const numRibbons = 29;
  const numSegs = 108;

  const ribbonSeeds = [];
  for (let i = 0; i < numRibbons; i++) {
    let yBase;
    let zSpread;
    let width;

    if (i < 15) {
      // Tier 1: 15 Centerline Smoke Rake Nozzles (exact match to physical nozzles on the mast)
      yBase = nozzleElevations[i];
      zSpread = (i % 2 === 0 ? 1 : -1) * (0.0035 + (i % 3) * 0.0025);
      width = 0.0076;
    } else if (i < 23) {
      // Tier 2: 8 Near-Flank Boundary-Layer Streamlines (fork crown, Kamm-tail downtube, 65mm rims, seatstays)
      const idx = i - 15;
      const side = idx % 2 === 0 ? 1 : -1;
      const row = Math.floor(idx / 2); // 0..3
      const stationsY = [0.27, 0.45, 0.62, 0.78];
      yBase = stationsY[row];
      zSpread = side * (0.022 + (row % 2) * 0.010);
      width = 0.0068;
    } else {
      // Tier 3: 6 Outer Cockpit / SRAM Hood / Crankset Streamlines (shed tip vortices)
      const idx = i - 23;
      const side = idx % 2 === 0 ? 1 : -1;
      const stations = [
        { y: 0.25, z: 0.048 }, // Crankset & chainrings
        { y: 0.85, z: 0.145 }, // ATTEN wing outer shoulder
        { y: 0.90, z: 0.192 }, // SRAM RED AXS hood tips
      ];
      const st = stations[Math.min(stations.length - 1, Math.floor(idx / 2))];
      yBase = st.y;
      zSpread = side * st.z;
      width = 0.0060;
    }

    ribbonSeeds.push({
      y0: yBase,
      z0: zSpread,
      phase: (i * 0.16180339887) % 1.0,
      width,
    });
  }

  const vertsPerRibbon = (numSegs + 1) * 2;
  const ribbonPositions = new Float32Array(numRibbons * vertsPerRibbon * 3);
  const ribbonColors = new Float32Array(numRibbons * vertsPerRibbon * 3);
  const ribbonUvs = new Float32Array(numRibbons * vertsPerRibbon * 2);
  const ribbonTurbAttr = new Float32Array(numRibbons * vertsPerRibbon);
  const ribbonIndices = [];

  const cachedPaths = Array.from({ length: numRibbons }, () =>
    Array.from({ length: numSegs + 1 }, () => ({
      x: 0,
      y: 0,
      z: 0,
      cp: 0,
      turb: 0,
      swirl: 0,
      alpha: 1,
    }))
  );

  for (let r = 0; r < numRibbons; r++) {
    const baseVert = r * vertsPerRibbon;
    for (let s = 0; s <= numSegs; s++) {
      const u = s / numSegs;
      const vIdx = (baseVert + s * 2) * 2;
      ribbonUvs[vIdx] = u;
      ribbonUvs[vIdx + 1] = 0.0;
      ribbonUvs[vIdx + 2] = u;
      ribbonUvs[vIdx + 3] = 1.0;

      if (s < numSegs) {
        const a = baseVert + s * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        ribbonIndices.push(a, b, c, b, d, c);
      }
    }
  }

  const ribbonGeom = new THREE.BufferGeometry();
  ribbonGeom.setAttribute('position', new THREE.BufferAttribute(ribbonPositions, 3));
  ribbonGeom.setAttribute('color', new THREE.BufferAttribute(ribbonColors, 3));
  ribbonGeom.setAttribute('uv', new THREE.BufferAttribute(ribbonUvs, 2));
  ribbonGeom.setAttribute('aTurbulence', new THREE.BufferAttribute(ribbonTurbAttr, 1));
  ribbonGeom.setIndex(ribbonIndices);

  const ribbonShaderMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0.76 },
      uIsSmoke: { value: 0.0 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      attribute float aTurbulence;
      varying vec3 vColor;
      varying vec2 vUv;
      varying float vTurb;

      void main() {
        vColor = color;
        vUv = uv;
        vTurb = aTurbulence;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOpacity;
      uniform float uIsSmoke;
      varying vec3 vColor;
      varying vec2 vUv;
      varying float vTurb;

      // Fast procedural 2D hash & value noise for volumetric smoke wisps
      float hash21(vec2 p) {
        p = fract(p * vec2(234.34, 435.345));
        p += dot(p, p + 34.23);
        return fract(p.x * p.y);
      }

      float noise2D(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      void main() {
        // Transverse cylindrical distance from filament centerline (0 at center, 1 at edges)
        float distFromCenter = abs(vUv.y * 2.0 - 1.0);

        // Smooth Gaussian-like cylindrical core profile (completely eliminates hard polygon edges!)
        float softProfile = pow(max(0.0, 1.0 - distFromCenter * distFromCenter), mix(1.95, 1.45, uIsSmoke));
        float hotCore = exp(-distFromCenter * distFromCenter * mix(10.0, 3.8, uIsSmoke));

        // Scrolling multi-scale FBM smoke texture & animated streamwise flow streaks
        vec2 flowCoord = vec2(vUv.x * 14.0 - uTime * 2.6, vUv.y * 3.0 + uTime * 0.35);
        float n1 = noise2D(flowCoord);
        float n2 = noise2D(flowCoord * 2.5 + vec2(uTime * 1.3, -uTime * 0.7));
        float smokeWisp = mix(0.48, 1.35, 0.6 * n1 + 0.4 * n2);

        // Animated streamwise flow packets so streamlines read as dynamic flowing air streaks
        float streakWave = 0.5 + 0.5 * sin(vUv.x * 22.0 - uTime * 5.2 + n1 * 2.2);
        float flowStreak = mix(0.38, 1.15, pow(streakWave, mix(1.8, 0.9, uIsSmoke)));

        // In laminar zones, smoke is a silky continuous thread; in turbulent wake, eddy wisps break it up
        float wispMod = mix(1.0, smokeWisp, clamp(vTurb * 1.55 + uIsSmoke * 0.58, 0.0, 1.0)) * flowStreak;

        // Bright incandescent core in CFD mode; soft volumetric scatter in Smoke mode
        vec3 finalColor = vColor * (1.0 + hotCore * (1.0 - uIsSmoke) * 0.55);
        float alpha = softProfile * wispMod * uOpacity;

        // Conservation of smoke density: as wake plumes billow wider, their peak opacity softens naturally
        alpha *= 1.0 / (1.0 + vTurb * mix(0.85, 1.85, uIsSmoke));

        if (alpha < 0.004) discard;
        gl_FragColor = vec4(finalColor, clamp(alpha, 0.0, 1.0));
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  const ribbonMesh = new THREE.Mesh(ribbonGeom, ribbonShaderMat);
  ribbonMesh.frustumCulled = false;
  windGroup.add(ribbonMesh);

  // ============================================================================
  // 3. ADVECTIVE RK2 STREAMLINE INTEGRATOR
  // ============================================================================
  const rebuildStreamlinePaths = () => {
    const yawRad = THREE.MathUtils.degToRad(state.yawDeg);
    const focusNorm = state.smokeFocus / 100;
    const targetY = 0.14 + focusNorm * 0.80;

    focusCarriage.visible = state.smokeFocus > 0;
    if (state.smokeFocus > 0) {
      focusCarriage.position.y = targetY;
    }

    const totalLen = xStart - xEnd;
    const dxStep = totalLen / numSegs;

    for (let r = 0; r < numRibbons; r++) {
      const seed = ribbonSeeds[r];

      // When Smoke Rake Focus > 0, compress the active streamlines into a focused horizontal/vertical wand sheet
      const yStart =
        state.smokeFocus > 0
          ? THREE.MathUtils.lerp(seed.y0, targetY + (seed.y0 - 0.52) * 0.14, 0.88)
          : seed.y0;
      const zStart =
        state.smokeFocus > 0
          ? seed.z0 * 0.62
          : seed.z0;

      let curY = yStart;
      let curZ = zStart;
      let accumTurb = 0.0;

      for (let s = 0; s <= numSegs; s++) {
        const u = s / numSegs;
        const x = THREE.MathUtils.lerp(xStart, xEnd, u);

        // RK2 Midpoint Advection Step along the 3D velocity field
        const sample1 = sampleAeroVelocityAndPressure(x, curY, curZ, yawRad, state.hydrationMode);
        const midX = x - dxStep * 0.5;
        const midY = sample1.enforceY + sample1.vy * dxStep * 0.5;
        const midZ = sample1.enforceZ + sample1.vz * dxStep * 0.5;

        const sample2 = sampleAeroVelocityAndPressure(midX, midY, midZ, yawRad, state.hydrationMode);

        // Gentle restoring pressure only in the far downstream wake (x < -0.45)
        const wakeRestoreY = x < -0.45 ? (yStart - curY) * 0.06 : 0.0;

        if (s > 0) {
          curY = sample1.enforceY + (sample2.vy + wakeRestoreY) * dxStep;
          curZ = sample1.enforceZ + sample2.vz * dxStep;
          // Final boundary-layer non-penetration clamp at new position
          const clamped = sampleAeroVelocityAndPressure(x, curY, curZ, yawRad, state.hydrationMode);
          curY = clamped.enforceY;
          curZ = clamped.enforceZ;
        }

        // Accumulate wake turbulence downstream with gradual eddy decay
        accumTurb = Math.min(1.0, accumTurb * 0.968 + sample2.turb * 0.22);

        const node = cachedPaths[r][s];
        node.x = x;
        node.y = curY;
        node.z = curZ;
        node.cp = sample2.cp;
        node.turb = Math.max(sample2.turb, accumTurb);
        node.swirl = sample2.swirl;

        // Spatial luminance envelope:
        // - Smooth laminar emergence from the smoke rake nozzle (u = 0..0.14)
        // - High-contrast illumination where air actively deflects & accelerates around the bike
        // - Smooth volumetric dissipation in the downstream wake (u -> 1)
        const nozzleRamp = Math.pow(Math.min(1.0, u * 7.5), 1.4);
        const localActivity = Math.min(
          1.0,
          Math.abs(sample2.cp) * 0.85 + Math.hypot(sample2.vy, sample2.vz) * 0.65 + node.turb * 0.55
        );
        const bikeZoneBell = Math.exp(-Math.pow((x - 0.10) / 0.68, 2));
        const activityBoost = 0.34 + 0.66 * Math.max(bikeZoneBell * 0.72, localActivity);
        const exitFade = Math.pow(Math.max(0.0, 1.0 - Math.pow(u, 1.85)), 1.05);
        node.alpha = Math.min(1.0, nozzleRamp * activityBoost * exitFade);
      }
    }
  };

  // ============================================================================
  // 4. HIGH-SPEED ADVECTED MICRO-TRACER PARTICLES
  // ============================================================================
  const particleCount = 850;
  const pPositions = new Float32Array(particleCount * 3);
  const pColors = new Float32Array(particleCount * 3);
  const pMeta = [];

  for (let i = 0; i < particleCount; i++) {
    const u = Math.random();
    const rIdx = i % numRibbons;
    pMeta.push({
      u,
      rIdx,
      speedMult: 0.82 + Math.random() * 0.42,
      radialOffset: (Math.random() - 0.5) * 0.010,
      phaseOffset: Math.random() * Math.PI * 2,
    });
  }

  const particleGeom = new THREE.BufferGeometry();
  particleGeom.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
  particleGeom.setAttribute('color', new THREE.BufferAttribute(pColors, 3));

  const spriteCanvas = document.createElement('canvas');
  spriteCanvas.width = 64;
  spriteCanvas.height = 64;
  const sCtx = spriteCanvas.getContext('2d');
  const radGrad = sCtx.createRadialGradient(32, 32, 1, 32, 32, 30);
  radGrad.addColorStop(0.0, 'rgba(255,255,255,1.0)');
  radGrad.addColorStop(0.3, 'rgba(210,248,255,0.75)');
  radGrad.addColorStop(1.0, 'rgba(210,248,255,0.0)');
  sCtx.fillStyle = radGrad;
  sCtx.fillRect(0, 0, 64, 64);
  const particleSprite = new THREE.CanvasTexture(spriteCanvas);

  const particleMat = new THREE.PointsMaterial({
    size: 0.011,
    map: particleSprite,
    vertexColors: true,
    transparent: true,
    opacity: 0.58,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const particleSystem = new THREE.Points(particleGeom, particleMat);
  windGroup.add(particleSystem);

  // ============================================================================
  // 5. WINDTUNNEL LASER CALIBRATION FLOOR GRID & YAW TURNTABLE DIAL
  // ============================================================================
  const floorGridCanvas = document.createElement('canvas');
  floorGridCanvas.width = 1024;
  floorGridCanvas.height = 512;
  const fgCtx = floorGridCanvas.getContext('2d');

  fgCtx.clearRect(0, 0, 1024, 512);

  // Radial vignette mask so grid lines fade smoothly into the plinth edges
  fgCtx.strokeStyle = 'rgba(124, 231, 247, 0.13)';
  fgCtx.lineWidth = 1.1;

  for (let x = 64; x <= 960; x += 64) {
    fgCtx.beginPath();
    fgCtx.moveTo(x, 24);
    fgCtx.lineTo(x, 488);
    fgCtx.stroke();
  }
  for (let y = 64; y <= 448; y += 64) {
    fgCtx.beginPath();
    fgCtx.moveTo(48, y);
    fgCtx.lineTo(976, y);
    fgCtx.stroke();
  }

  // Precision aerodynamic yaw protractor arc on the floor
  fgCtx.strokeStyle = 'rgba(124, 231, 247, 0.28)';
  fgCtx.lineWidth = 1.5;
  fgCtx.beginPath();
  fgCtx.arc(512, 256, 210, 0, Math.PI * 2);
  fgCtx.stroke();

  // Centerline & Wheelbase datum ticks
  fgCtx.strokeStyle = 'rgba(229, 0, 25, 0.45)';
  fgCtx.lineWidth = 2;
  fgCtx.beginPath();
  fgCtx.moveTo(60, 256);
  fgCtx.lineTo(964, 256);
  fgCtx.stroke();

  fgCtx.fillStyle = 'rgba(124, 231, 247, 0.62)';
  fgCtx.font = '600 15px "JetBrains Mono", monospace';
  fgCtx.fillText('AERO DATUM // 990MM WHEELBASE // BOUNDARY LAYER ACTIVE', 270, 488);

  const floorGridTex = new THREE.CanvasTexture(floorGridCanvas);
  const floorGridPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(2.72, 1.34).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: floorGridTex,
      transparent: true,
      opacity: 0.56,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  floorGridPlane.position.set(0.08, 0.0025, 0);
  windGroup.add(floorGridPlane);

  rebuildStreamlinePaths();

  // ============================================================================
  // 6. REAL-TIME ANIMATION LOOP (Wave Propagation, Helical Swirl & Wake Diffusion)
  // ============================================================================
  let simTime = 0;
  const tmpColor = new THREE.Color();

  const update = (dt) => {
    if (!state.active) return;

    const speedMs = state.windSpeedKmh / 3.6;
    simTime += dt * (speedMs * 0.24);
    ribbonShaderMat.uniforms.uTime.value = simTime;

    const isSmoke = state.flowMode === 'smoke';
    const isVortex = state.flowMode === 'vortex';

    for (let r = 0; r < numRibbons; r++) {
      const seed = ribbonSeeds[r];
      const baseVert = r * vertsPerRibbon;
      const path = cachedPaths[r];

      for (let s = 0; s <= numSegs; s++) {
        const u = s / numSegs;
        const node = path[s];

        // Multi-harmonic 3D Kármán vortex street & wake curl downstream of bluff/airfoil bodies
        const freq = isVortex ? 22.0 : 16.0;
        const phaseArg = u * freq - simTime * 4.2 + seed.phase * Math.PI * 2;
        const wakeAmp = node.turb * (isVortex ? 0.046 : isSmoke ? 0.038 : 0.028);
        const swirlDir = node.swirl >= 0 ? 1.0 : -1.0;

        const vortexY =
          (Math.cos(phaseArg * swirlDir) * 0.72 + Math.sin(phaseArg * 1.7 + r) * 0.28) * wakeAmp;
        const vortexZ =
          (Math.sin(phaseArg * swirlDir) * 0.75 + Math.cos(phaseArg * 1.5 - r) * 0.25) * wakeAmp;

        const px = node.x;
        const py = Math.max(0.018, node.y + vortexY);
        const pz = node.z + vortexZ;

        // Travelling high-speed velocity pulse along each streamline
        const pulseWave = isSmoke
          ? 0.76 + 0.24 * Math.sin((u * 3.8 - simTime * 1.1 + seed.phase) * Math.PI * 2)
          : 0.48 + 0.52 * Math.pow(0.5 + 0.5 * Math.sin((u * 3.4 - simTime * 0.95 + seed.phase) * Math.PI * 2), 2.0);
        const fade = node.alpha * pulseWave;

        computeFlowColor(node.cp, node.turb, state.flowMode, tmpColor);
        tmpColor.multiplyScalar(fade);

        // Turbulent wake expansion: smoke plumes start fine at the nozzle and billow wider in the wake!
        const wakeExpansion = 1.0 + node.turb * (isSmoke ? 5.2 : isVortex ? 3.2 : 2.1);
        const halfW = seed.width * (isSmoke ? 1.85 : 1.0) * wakeExpansion;

        // 3D helical ribbon orientation so every filament has volumetric presence from BOTH side profile and 3/4 views
        const twistAngle = 0.52 + r * 0.35 + node.turb * (u * 6.5 - simTime * 2.8) * swirlDir;
        const dyW = Math.cos(twistAngle) * halfW;
        const dzW = Math.sin(twistAngle) * halfW;

        const v0Idx = baseVert + s * 2;
        const v1Idx = v0Idx + 1;
        const v0 = v0Idx * 3;
        const v1 = v1Idx * 3;

        ribbonPositions[v0] = px;
        ribbonPositions[v0 + 1] = py - dyW;
        ribbonPositions[v0 + 2] = pz - dzW;

        ribbonPositions[v1] = px;
        ribbonPositions[v1 + 1] = py + dyW;
        ribbonPositions[v1 + 2] = pz + dzW;

        ribbonColors[v0] = tmpColor.r;
        ribbonColors[v0 + 1] = tmpColor.g;
        ribbonColors[v0 + 2] = tmpColor.b;

        ribbonColors[v1] = tmpColor.r;
        ribbonColors[v1 + 1] = tmpColor.g;
        ribbonColors[v1 + 2] = tmpColor.b;

        ribbonTurbAttr[v0Idx] = node.turb;
        ribbonTurbAttr[v1Idx] = node.turb;
      }
    }

    ribbonGeom.attributes.position.needsUpdate = true;
    ribbonGeom.attributes.color.needsUpdate = true;
    ribbonGeom.attributes.aTurbulence.needsUpdate = true;

    // Update Advected Micro-Tracer Particles (accelerate in low-pressure Venturi zones!)
    const baseUStep = dt * (speedMs / (xStart - xEnd)) * 0.58;
    for (let i = 0; i < particleCount; i++) {
      const meta = pMeta[i];
      const path = cachedPaths[meta.rIdx];
      const curS = Math.min(numSegs, Math.floor(meta.u * numSegs));
      const localNode = path[curS];

      // Bernoulli acceleration: particles move faster where pressure coefficient Cp < 0
      const bernoulliBoost = 1.0 + Math.max(-0.35, -localNode.cp * 0.45);
      meta.u = (meta.u + baseUStep * meta.speedMult * bernoulliBoost) % 1.0;

      const fIdx = meta.u * numSegs;
      const s0 = Math.min(numSegs - 1, Math.floor(fIdx));
      const frac = fIdx - s0;
      const n0 = path[s0];
      const n1 = path[s0 + 1];

      // Helical corkscrew orbit around the streamline in turbulent wake
      const orbitAngle = meta.u * 24.0 - simTime * 5.2 + meta.phaseOffset;
      const orbitRadius = meta.radialOffset * (1.0 + n0.turb * 3.2);

      const x = THREE.MathUtils.lerp(n0.x, n1.x, frac);
      const y = Math.max(0.018, THREE.MathUtils.lerp(n0.y, n1.y, frac) + Math.cos(orbitAngle) * orbitRadius);
      const z = THREE.MathUtils.lerp(n0.z, n1.z, frac) + Math.sin(orbitAngle) * orbitRadius;

      const pIdx = i * 3;
      pPositions[pIdx] = x;
      pPositions[pIdx + 1] = y;
      pPositions[pIdx + 2] = z;

      computeFlowColor(n0.cp, n0.turb, state.flowMode, tmpColor);
      const edgeFade = n0.alpha * Math.sin(meta.u * Math.PI);
      pColors[pIdx] = tmpColor.r * edgeFade;
      pColors[pIdx + 1] = tmpColor.g * edgeFade;
      pColors[pIdx + 2] = tmpColor.b * edgeFade;
    }

    particleGeom.attributes.position.needsUpdate = true;
    particleGeom.attributes.color.needsUpdate = true;
  };

  const setActive = (isActive) => {
    state.active = isActive;
    windGroup.visible = isActive;
    if (isActive) {
      rebuildStreamlinePaths();
    }
  };

  const setParameters = ({ windSpeedKmh, yawDeg, smokeFocus, flowMode, hydrationMode }) => {
    let needsRebuild = false;
    if (windSpeedKmh !== undefined) state.windSpeedKmh = windSpeedKmh;
    if (yawDeg !== undefined && yawDeg !== state.yawDeg) {
      state.yawDeg = yawDeg;
      floorGridPlane.rotation.y = THREE.MathUtils.degToRad(-yawDeg * 0.5);
      rakeGroup.rotation.y = THREE.MathUtils.degToRad(-yawDeg * 0.35);
      needsRebuild = true;
    }
    if (smokeFocus !== undefined && smokeFocus !== state.smokeFocus) {
      state.smokeFocus = smokeFocus;
      needsRebuild = true;
    }
    if (hydrationMode !== undefined && hydrationMode !== state.hydrationMode) {
      state.hydrationMode = hydrationMode;
      needsRebuild = true;
    }
    if (flowMode !== undefined && flowMode !== state.flowMode) {
      state.flowMode = flowMode;
      const isSmoke = flowMode === 'smoke';
      ribbonShaderMat.uniforms.uIsSmoke.value = isSmoke ? 1.0 : 0.0;
      ribbonShaderMat.uniforms.uOpacity.value = isSmoke ? 0.46 : 0.76;
      particleMat.opacity = isSmoke ? 0.12 : 0.58;
      particleMat.size = isSmoke ? 0.016 : 0.011;
    }
    if (needsRebuild) {
      rebuildStreamlinePaths();
    }
  };

  // Compute live aerodynamic telemetry metrics (CdA & Watt savings) from speed, yaw & hydration config
  const getTelemetry = () => {
    const vKmh = state.windSpeedKmh;
    const yawAbs = Math.abs(state.yawDeg);
    // Scope Artech 6.A+ + Nitrogen Pro exhibits a "sailing effect" where CdA drops between 5-10 deg yaw
    const sailingReduction = Math.sin(THREE.MathUtils.degToRad(Math.min(15, yawAbs) * 10)) * 0.0045;
    const hydrationDelta =
      state.hydrationMode === 'cages' ? 0.0 : state.hydrationMode === 'bottles' ? -0.001 : 0.002;
    const cda = (0.196 + hydrationDelta - sailingReduction + Math.max(0, yawAbs - 11) * 0.0012).toFixed(3);
    const wattSavings = (-14.8 * Math.pow(vKmh / 45.0, 3) * (1 + yawAbs * 0.015)).toFixed(1);
    return {
      speedKmh: vKmh.toFixed(1),
      yawDeg: `${state.yawDeg >= 0 ? '+' : ''}${state.yawDeg.toFixed(1)}°`,
      cda,
      wattSavings: `${wattSavings}`,
    };
  };

  return {
    windGroup,
    state,
    update,
    setActive,
    setParameters,
    getTelemetry,
  };
}
