import * as THREE from 'three';
import {
  createMetallicFlakeMaps,
  createCarbonWeaveMaps,
  createScopeWheelMaps,
  createVittoriaTireMaps,
  createFrameDecalTextures,
  createBarTapeMaps,
  createSramHoodMaps,
} from './textures.js';

/**
 * Exact Argon 18 Nitrogen Pro (Size M: 54-56) Coordinate Landmarks in meters
 * Origin: X = 0 at Bottom Bracket (BB), Y = 0 at Ground Plane, Z = 0 at Centerline
 * +X = Forward (toward front wheel), +Y = Upward, +Z = Right (Drive Side)
 */
export const BIKE_COORDS = {
  wheelRadius: 0.342,          // 700x30c outer radius (684mm diameter)
  rimOuterRadius: 0.313,       // 622mm BSD + tire bead lip
  rimInnerRadius: 0.248,       // 65mm deep Scope Artech 6.A+ carbon rim
  bb: new THREE.Vector3(0.0, 0.263, 0.0),               // 79mm BB drop from 342mm axle
  rearAxle: new THREE.Vector3(-0.4023, 0.342, 0.0),     // 410mm chainstay
  frontAxle: new THREE.Vector3(0.5877, 0.342, 0.0),     // 990mm wheelbase
  headTop: new THREE.Vector3(0.392, 0.818, 0.0),        // Stack 555mm, Reach 392mm
  headBot: new THREE.Vector3(0.433, 0.686, 0.0),        // 138mm headtube at 72.7 deg
  seatCluster: new THREE.Vector3(-0.1434, 0.7472, 0.0), // 505mm seattube at 73.5 deg
  droppedStayJunc: new THREE.Vector3(-0.091, 0.568, 0.0),
  droppedStayKnee: new THREE.Vector3(-0.202, 0.568, 0.0),
  saddleCenter: new THREE.Vector3(-0.214, 0.985, 0.0),
  stemTop: new THREE.Vector3(0.386, 0.836, 0.0),
  barCenter: new THREE.Vector3(0.492, 0.850, 0.0),
};

/**
 * Generates a watertight, smooth-shaded 3D Lofted Kamm-Tail Airfoil / Superellipse Tube
 * from an array of cross-section stations.
 *
 * Each station: {
 *   pos: Vector3 (center of cross section),
 *   chordDir?: Vector3 (direction of airfoil nose, default +X in XY plane),
 *   widthDir?: Vector3 (lateral direction, default +Z),
 *   chord: number (fore-aft depth in meters),
 *   width: number (lateral width in meters),
 *   kamm?: number (0 = full teardrop, 0.35 = Kamm-tail truncated trailing edge),
 *   power?: number (superellipse exponent: 2.0 = ellipse, 2.6 = flat-sided aero box)
 * }
 */
function createLoftedAeroMesh(stations, radialSegments = 44, material, capEnds = true) {
  const numStations = stations.length;
  const positions = [];
  const uvs = [];
  const indices = [];

  // Precompute local orthonormal frames at each station
  const frames = stations.map((st, idx) => {
    let tangent;
    if (idx === 0) {
      tangent = new THREE.Vector3().subVectors(stations[1].pos, st.pos).normalize();
    } else if (idx === numStations - 1) {
      tangent = new THREE.Vector3().subVectors(st.pos, stations[idx - 1].pos).normalize();
    } else {
      tangent = new THREE.Vector3().subVectors(stations[idx + 1].pos, stations[idx - 1].pos).normalize();
    }

    const widthDir = (st.widthDir ? st.widthDir.clone() : new THREE.Vector3(0, 0, 1)).normalize();
    let chordDir;
    if (st.chordDir) {
      chordDir = st.chordDir.clone().normalize();
    } else {
      // Orthogonal to tangent and widthDir, pointing generally forward/up
      chordDir = new THREE.Vector3().crossVectors(widthDir, tangent).normalize();
      if (chordDir.lengthSq() < 0.001) {
        chordDir.set(1, 0, 0);
      }
    }
    return { tangent, chordDir, widthDir };
  });

  // Generate ring vertices for each station
  for (let i = 0; i < numStations; i++) {
    const st = stations[i];
    const { chordDir, widthDir } = frames[i];
    const vCoord = i / (numStations - 1);
    const kamm = st.kamm !== undefined ? st.kamm : 0.25;
    const exp = st.power !== undefined ? st.power : 2.15;

    for (let j = 0; j <= radialSegments; j++) {
      const uCoord = j / radialSegments;
      const theta = uCoord * Math.PI * 2; // 0 = leading edge (+chordDir), PI = trailing edge (-chordDir)

      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      // Superellipse shaping
      const sCos = Math.sign(cosT) * Math.pow(Math.abs(cosT), 2 / exp);
      const sSin = Math.sign(sinT) * Math.pow(Math.abs(sinT), 2 / exp);

      // Kamm-tail airfoil profile:
      // Leading edge (sCos > 0) is full sleek nose; trailing edge (sCos < 0) is truncated/flattened
      let localChord = sCos * 0.5 * st.chord;
      let widthTaper = 1.0;

      if (sCos < 0 && kamm > 0) {
        const flattenLimit = -0.5 * st.chord * (1.0 - kamm * 0.35);
        localChord = Math.max(flattenLimit, localChord);
        // Slight aero taper toward the trailing edge
        widthTaper = 1.0 - Math.abs(sCos) * kamm * 0.24;
      }

      const localWidth = sSin * 0.5 * st.width * widthTaper;

      const vx = st.pos.x + chordDir.x * localChord + widthDir.x * localWidth;
      const vy = st.pos.y + chordDir.y * localChord + widthDir.y * localWidth;
      const vz = st.pos.z + chordDir.z * localChord + widthDir.z * localWidth;

      positions.push(vx, vy, vz);
      uvs.push(uCoord, vCoord);
    }
  }

  // Exact analytical outward normal check for the lofted parameterization:
  // Surface tangent along v (station i -> i+1) is +T = frames[0].tangent.
  // Surface tangent along u (theta increasing around ring at theta -> 0+) is +W = frames[0].widthDir.
  // Outward radial normal at theta = 0 is +C = frames[0].chordDir.
  // For triangle (a, b, d) = (v, v+dv, u+du), e1 = b - a ~ +T, e2 = d - a ~ +W, so triNormal = T x W.
  // We need (T x W) . C > 0, i.e., (C x W) . T < 0; otherwise flip winding!
  const ringStride = radialSegments + 1;
  const cwCross = new THREE.Vector3().crossVectors(frames[0].chordDir, frames[0].widthDir);
  const flipWinding = cwCross.dot(frames[0].tangent) > 0;

  for (let i = 0; i < numStations - 1; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * ringStride + j;
      const b = (i + 1) * ringStride + j;
      const c = (i + 1) * ringStride + (j + 1);
      const d = i * ringStride + (j + 1);

      if (flipWinding) {
        indices.push(a, d, b);
        indices.push(b, d, c);
      } else {
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }
  }

  // Optional end caps with dedicated vertices so flat cap normals never distort smooth tube walls
  if (capEnds) {
    // Start cap (outward normal = -frames[0].tangent)
    const startCenterIdx = positions.length / 3;
    positions.push(stations[0].pos.x, stations[0].pos.y, stations[0].pos.z);
    uvs.push(0.5, 0.5);
    const startRingBase = positions.length / 3;
    for (let j = 0; j <= radialSegments; j++) {
      positions.push(positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]);
      uvs.push(0.5, 0.5);
    }
    const sc0 = stations[0].pos;
    const sv0 = new THREE.Vector3(positions[startRingBase * 3], positions[startRingBase * 3 + 1], positions[startRingBase * 3 + 2]);
    const sv1 = new THREE.Vector3(positions[(startRingBase + 1) * 3], positions[(startRingBase + 1) * 3 + 1], positions[(startRingBase + 1) * 3 + 2]);
    const startCapNormal = new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(sv0, sc0),
      new THREE.Vector3().subVectors(sv1, sc0)
    );
    const startFlip = startCapNormal.dot(frames[0].tangent) > 0; // we want dot(-tangent) > 0, i.e. dot(tangent) < 0
    for (let j = 0; j < radialSegments; j++) {
      if (startFlip) {
        indices.push(startCenterIdx, startRingBase + j + 1, startRingBase + j);
      } else {
        indices.push(startCenterIdx, startRingBase + j, startRingBase + j + 1);
      }
    }

    // End cap (outward normal = +frames[numStations - 1].tangent)
    const lastSt = stations[numStations - 1];
    const endCenterIdx = positions.length / 3;
    positions.push(lastSt.pos.x, lastSt.pos.y, lastSt.pos.z);
    uvs.push(0.5, 0.5);
    const endRingBase = positions.length / 3;
    const srcBaseRing = (numStations - 1) * ringStride;
    for (let j = 0; j <= radialSegments; j++) {
      const idx3 = (srcBaseRing + j) * 3;
      positions.push(positions[idx3], positions[idx3 + 1], positions[idx3 + 2]);
      uvs.push(0.5, 0.5);
    }
    const ec0 = lastSt.pos;
    const ev0 = new THREE.Vector3(positions[endRingBase * 3], positions[endRingBase * 3 + 1], positions[endRingBase * 3 + 2]);
    const ev1 = new THREE.Vector3(positions[(endRingBase + 1) * 3], positions[(endRingBase + 1) * 3 + 1], positions[(endRingBase + 1) * 3 + 2]);
    const endCapNormal = new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(ev0, ec0),
      new THREE.Vector3().subVectors(ev1, ec0)
    );
    const endFlip = endCapNormal.dot(frames[numStations - 1].tangent) < 0; // we want dot(+tangent) > 0
    for (let j = 0; j < radialSegments; j++) {
      if (endFlip) {
        indices.push(endCenterIdx, endRingBase + j + 1, endRingBase + j);
      } else {
        indices.push(endCenterIdx, endRingBase + j, endRingBase + j + 1);
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();

  const mesh = new THREE.Mesh(geom, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Helper to create a Lofted Aero Tube along a CatmullRomCurve3 with interpolated chord/width
 */
function createCurvedAeroTube(controlPoints, samples = 28, radialSegments = 36, material, capEnds = true) {
  const pts = controlPoints.map((cp) => cp.pos);
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.45);
  const stations = [];

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const pos = curve.getPoint(t);

    // Interpolate chord, width, kamm, power across control points
    const scaledT = t * (controlPoints.length - 1);
    const idx0 = Math.min(controlPoints.length - 2, Math.floor(scaledT));
    const idx1 = idx0 + 1;
    const frac = scaledT - idx0;
    const smoothF = frac * frac * (3 - 2 * frac);

    const cp0 = controlPoints[idx0];
    const cp1 = controlPoints[idx1];

    const chord = THREE.MathUtils.lerp(cp0.chord, cp1.chord, smoothF);
    const width = THREE.MathUtils.lerp(cp0.width, cp1.width, smoothF);
    const kamm = THREE.MathUtils.lerp(cp0.kamm ?? 0.22, cp1.kamm ?? 0.22, smoothF);
    const power = THREE.MathUtils.lerp(cp0.power ?? 2.2, cp1.power ?? 2.2, smoothF);

    let chordDir = undefined;
    if (cp0.chordDir && cp1.chordDir) {
      chordDir = cp0.chordDir.clone().lerp(cp1.chordDir, smoothF).normalize();
    } else if (cp0.chordDir) {
      chordDir = cp0.chordDir.clone();
    }

    stations.push({ pos, chord, width, kamm, power, chordDir });
  }

  return createLoftedAeroMesh(stations, radialSegments, material, capEnds);
}

/**
 * Builds the complete Argon 18 Nitrogen Pro (SRAM RED AXS / ATTEN x Scope Artech 6.A+)
 */
export function buildArgon18NitrogenPro() {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'Argon18_Nitrogen_Pro';

  // Generate procedural PBR textures & normal maps
  const flakeMaps = createMetallicFlakeMaps();
  const carbonMaps = createCarbonWeaveMaps();
  const scopeWheelMaps = createScopeWheelMaps();
  const vittoriaMaps = createVittoriaTireMaps();
  const frameDecals = createFrameDecalTextures();
  const barTapeMaps = createBarTapeMaps();
  const sramHoodMaps = createSramHoodMaps();

  // ============================================================================
  // 1. CURATED PBR MATERIALS
  // ============================================================================

  // A. "Aurora Charcoal" Metallic Sparkle Paint (Front/Upper Frame & Fork Crown)
  const auroraCharcoalMat = new THREE.MeshPhysicalMaterial({
    name: 'AuroraCharcoalPaint',
    color: new THREE.Color('#191b20'),
    metalness: 0.76,
    roughness: 0.22,
    roughnessMap: flakeMaps.roughnessMap,
    normalMap: flakeMaps.normalMap,
    normalScale: new THREE.Vector2(0.42, 0.42),
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    iridescence: 0.48,
    iridescenceIOR: 1.38,
    iridescenceThicknessRange: [140, 460],
    reflectivity: 1.0,
    envMapIntensity: 1.35,
  });

  // B. Deep Gloss Piano Black Carbon (Rear/Lower Frame, Seatpost, Lower Fork)
  const glossCarbonMat = new THREE.MeshPhysicalMaterial({
    name: 'GlossPianoCarbon',
    color: new THREE.Color('#0c0d10'),
    map: carbonMaps.map,
    normalMap: carbonMaps.normalMap,
    normalScale: new THREE.Vector2(0.08, 0.08),
    metalness: 0.18,
    roughness: 0.12,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    reflectivity: 1.0,
    envMapIntensity: 1.25,
  });

  // C. Satin Raw Unidirectional Carbon (ATTEN Cockpit, Aero Cages, Saddle Shell)
  const satinCarbonMat = new THREE.MeshPhysicalMaterial({
    name: 'SatinUDCarbon',
    color: new THREE.Color('#14161b'),
    normalMap: carbonMaps.normalMap,
    normalScale: new THREE.Vector2(0.14, 0.14),
    metalness: 0.22,
    roughness: 0.34,
    clearcoat: 0.35,
    clearcoatRoughness: 0.25,
    envMapIntensity: 1.15,
  });

  // D. Iridescent Holographic Foil Decal Material (ARGON 18 Downtube & Top Tube Prism)
  // Uses FrontSide + alphaTest so decals never shine through from the opposite side of a tube!
  const makeHoloDecalMat = (texture) =>
    new THREE.MeshPhysicalMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.12,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      metalness: 0.85,
      roughness: 0.16,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      iridescence: 1.0,
      iridescenceIOR: 1.42,
      iridescenceThicknessRange: [180, 620],
      envMapIntensity: 1.8,
      side: THREE.FrontSide,
    });

  // E. SRAM RED CNC Machined Silver / Nickel Chrome
  const sramChromeMat = new THREE.MeshStandardMaterial({
    name: 'SRAMChrome',
    color: new THREE.Color('#e6ebf2'),
    metalness: 0.94,
    roughness: 0.14,
    envMapIntensity: 1.6,
  });

  // F. SRAM Black Anodized Aluminum
  const sramAnodizedBlackMat = new THREE.MeshStandardMaterial({
    name: 'SRAMAnodizedBlack',
    color: new THREE.Color('#131519'),
    metalness: 0.78,
    roughness: 0.26,
    envMapIntensity: 1.2,
  });

  // G. Ciclovation Leather Touch Tornado Gloss Bar Tape (with spiral wrap normal ribs!)
  const barTapeMat = new THREE.MeshPhysicalMaterial({
    name: 'CiclovationBarTape',
    color: new THREE.Color('#14161a'),
    normalMap: barTapeMaps.normalMap,
    normalScale: new THREE.Vector2(0.42, 0.42),
    roughness: 0.34,
    metalness: 0.08,
    clearcoat: 0.58,
    clearcoatRoughness: 0.20,
  });

  // H. Repente Quasar CR 2.0 Microfiber Saddle Upper
  const saddleMat = new THREE.MeshPhysicalMaterial({
    name: 'RepenteSaddle',
    color: new THREE.Color('#121317'),
    roughness: 0.52,
    metalness: 0.05,
    sheen: 0.35,
    sheenColor: new THREE.Color('#2a2d36'),
  });

  // I. SRAM RED AXS E1 Textured Silicone Ergonomic Hood Cover
  const sramHoodMat = new THREE.MeshPhysicalMaterial({
    name: 'SRAMRedE1HoodElastomer',
    color: new THREE.Color('#15171c'),
    normalMap: sramHoodMaps.normalMap,
    normalScale: new THREE.Vector2(0.52, 0.52),
    roughnessMap: sramHoodMaps.roughnessMap,
    roughness: 0.54,
    metalness: 0.04,
    clearcoat: 0.14,
    clearcoatRoughness: 0.42,
    sheen: 0.22,
    sheenColor: new THREE.Color('#252830'),
  });

  // J. SRAM RED AXS E1 Sculpted Carbon LFRT Brake Lever Blade (with vertical silver "Red" speed graphic)
  const sramLeverBladeMat = new THREE.MeshPhysicalMaterial({
    name: 'SRAMRedE1CarbonBlade',
    color: new THREE.Color('#ffffff'),
    map: frameDecals.sramLeverBladeMap,
    normalMap: carbonMaps.normalMap,
    normalScale: new THREE.Vector2(0.06, 0.06),
    metalness: 0.24,
    roughness: 0.14,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    reflectivity: 1.0,
    envMapIntensity: 1.45,
  });

  // ============================================================================
  // 2. MONOCOQUE CARBON FRAME (Exact Nitrogen Pro Aero Profiles)
  // ============================================================================
  const frameGroup = new THREE.Group();
  frameGroup.name = 'FrameGroup';
  rootGroup.add(frameGroup);

  // 2.1 Flow-Optimized Hourglass Head Tube ("Speed Sniffer" Extended Nose)
  // Notice how the middle waist narrows in Z (38mm) while top/bottom flare (48mm)
  // and the leading edge projects forward into the wind!
  const headTubeStations = [
    {
      pos: new THREE.Vector3(0.436, 0.678, 0),
      chord: 0.086,
      width: 0.050,
      kamm: 0.25,
      power: 2.1,
      chordDir: new THREE.Vector3(0.955, 0.297, 0),
    },
    {
      pos: new THREE.Vector3(0.425, 0.714, 0),
      chord: 0.090,
      width: 0.048,
      kamm: 0.28,
      power: 2.15,
      chordDir: new THREE.Vector3(0.955, 0.297, 0),
    },
    {
      // Hourglass aero waist
      pos: new THREE.Vector3(0.414, 0.750, 0),
      chord: 0.085,
      width: 0.038,
      kamm: 0.30,
      power: 2.0,
      chordDir: new THREE.Vector3(0.955, 0.297, 0),
    },
    {
      pos: new THREE.Vector3(0.401, 0.790, 0),
      chord: 0.090,
      width: 0.046,
      kamm: 0.28,
      power: 2.15,
      chordDir: new THREE.Vector3(0.955, 0.297, 0),
    },
    {
      // Extended "Speed Sniffer" top nose
      pos: new THREE.Vector3(0.393, 0.818, 0),
      chord: 0.078,
      width: 0.046,
      kamm: 0.28,
      power: 2.25,
      chordDir: new THREE.Vector3(0.955, 0.297, 0),
    },
  ];
  const headTubeMesh = createLoftedAeroMesh(headTubeStations, 48, auroraCharcoalMat, true);
  frameGroup.add(headTubeMesh);

  // Iridescent Molecular Emblem on the front nose of the Head Tube (matches front.jpg)
  const htBadgeGeom = new THREE.PlaneGeometry(0.024, 0.024);
  const htBadgeMesh = new THREE.Mesh(htBadgeGeom, makeHoloDecalMat(frameDecals.headtubeLogoMap));
  htBadgeMesh.position.set(0.459, 0.735, 0);
  htBadgeMesh.rotation.set(0, Math.PI / 2, 0);
  htBadgeMesh.rotateX(-0.30); // Match 72.7 deg headtube rake
  frameGroup.add(htBadgeMesh);

  // 2.2 Single Continuous Monocoque Sloping Aero Top Tube (Seamless weld from Headtube to Seat Cluster)
  // Includes deep sculpted aero gussets at both the Head Tube and Seat Cluster!
  const topTubeStations = [
    {
      // Deep front aero gusset nested cleanly inside the Head Tube (width 0.035m < headtube waist 0.038m so zero side seam!)
      pos: new THREE.Vector3(0.404, 0.784, 0),
      chord: 0.064,
      width: 0.035,
      kamm: 0.22,
      power: 2.25,
      chordDir: new THREE.Vector3(0.115, 0.993, 0),
    },
    {
      pos: new THREE.Vector3(0.352, 0.786, 0),
      chord: 0.050,
      width: 0.042,
      kamm: 0.20,
      power: 2.38,
      chordDir: new THREE.Vector3(0.115, 0.993, 0),
    },
    {
      pos: new THREE.Vector3(0.245, 0.780, 0),
      chord: 0.041,
      width: 0.0395,
      kamm: 0.20,
      power: 2.40,
      chordDir: new THREE.Vector3(0.115, 0.993, 0),
    },
    {
      pos: new THREE.Vector3(0.125, 0.768, 0),
      chord: 0.038,
      width: 0.0375,
      kamm: 0.20,
      power: 2.40,
      chordDir: new THREE.Vector3(0.115, 0.993, 0),
    },
    {
      pos: new THREE.Vector3(0.025, 0.758, 0),
      chord: 0.036,
      width: 0.0365,
      kamm: 0.20,
      power: 2.40,
      chordDir: new THREE.Vector3(0.115, 0.993, 0),
    },
    {
      pos: new THREE.Vector3(-0.088, 0.747, 0),
      chord: 0.036,
      width: 0.036,
      kamm: 0.20,
      power: 2.38,
      chordDir: new THREE.Vector3(0.115, 0.993, 0),
    },
    {
      // Flared aero gusset into seat tube
      pos: new THREE.Vector3(-0.118, 0.744, 0),
      chord: 0.048,
      width: 0.035,
      kamm: 0.25,
      power: 2.30,
      chordDir: new THREE.Vector3(0.115, 0.993, 0),
    },
    {
      pos: new THREE.Vector3(-0.144, 0.741, 0),
      chord: 0.054,
      width: 0.0335,
      kamm: 0.28,
      power: 2.20,
      chordDir: new THREE.Vector3(0.115, 0.993, 0),
    },
  ];
  frameGroup.add(createLoftedAeroMesh(topTubeStations, 44, auroraCharcoalMat, true));

  // Skin-Tight 3D Conformed Top Tube Wrap Decal ("NITROGEN PRO" on top ridge + Holographic Prism Band wrapping top & sides!)
  // Built using the EXACT superellipse cross-section equations of topTubeStations between x = -0.088 and x = +0.125 + 0.6mm offset!
  {
    const ttWrapStations = [
      { pos: new THREE.Vector3(-0.088, 0.747, 0), chord: 0.0372, width: 0.0372, kamm: 0.20, power: 2.38 },
      { pos: new THREE.Vector3(-0.030, 0.7527, 0), chord: 0.0372, width: 0.0375, kamm: 0.20, power: 2.40 },
      { pos: new THREE.Vector3(0.025, 0.758, 0), chord: 0.0372, width: 0.0377, kamm: 0.20, power: 2.40 },
      { pos: new THREE.Vector3(0.075, 0.763, 0), chord: 0.0382, width: 0.0382, kamm: 0.20, power: 2.40 },
      { pos: new THREE.Vector3(0.125, 0.768, 0), chord: 0.0392, width: 0.0387, kamm: 0.20, power: 2.40 },
    ];
    const ttChordDir = new THREE.Vector3(0.115, 0.993, 0).normalize();
    const ttWidthDir = new THREE.Vector3(0, 0, 1);
    const arcSteps = 36;
    const maxTheta = 0.66 * Math.PI; // wraps from +Z lower flank, across +Y top ridge (theta=0), to -Z lower flank
    const wrapPos = [];
    const wrapUvs = [];
    const wrapIdx = [];

    for (let i = 0; i < ttWrapStations.length; i++) {
      const st = ttWrapStations[i];
      const u = i / (ttWrapStations.length - 1); // u=0 at rear (-0.088), u=1 at front (+0.125)
      const exp = st.power;
      const kamm = st.kamm;

      for (let j = 0; j <= arcSteps; j++) {
        const v = j / arcSteps; // v=0 at +Z flank, v=0.5 at top ridge (theta=0), v=1 at -Z flank
        const theta = THREE.MathUtils.lerp(maxTheta, -maxTheta, v);
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        const sCos = Math.sign(cosT) * Math.pow(Math.abs(cosT), 2 / exp);
        const sSin = Math.sign(sinT) * Math.pow(Math.abs(sinT), 2 / exp);

        let localChord = sCos * 0.5 * st.chord;
        let widthTaper = 1.0;
        if (sCos < 0 && kamm > 0) {
          const flattenLimit = -0.5 * st.chord * (1.0 - kamm * 0.35);
          localChord = Math.max(flattenLimit, localChord);
          widthTaper = 1.0 - Math.abs(sCos) * kamm * 0.24;
        }
        const localWidth = sSin * 0.5 * st.width * widthTaper;

        wrapPos.push(
          st.pos.x + ttChordDir.x * localChord + ttWidthDir.x * localWidth,
          st.pos.y + ttChordDir.y * localChord + ttWidthDir.y * localWidth,
          st.pos.z + ttChordDir.z * localChord + ttWidthDir.z * localWidth
        );
        wrapUvs.push(u, v);
      }
    }

    const stride = arcSteps + 1;
    // Check outward normal at top ridge (j = arcSteps/2)
    const midJ = Math.floor(arcSteps / 2);
    const pA = new THREE.Vector3(wrapPos[midJ * 3], wrapPos[midJ * 3 + 1], wrapPos[midJ * 3 + 2]);
    const pB = new THREE.Vector3(wrapPos[(stride + midJ) * 3], wrapPos[(stride + midJ) * 3 + 1], wrapPos[(stride + midJ) * 3 + 2]);
    const pD = new THREE.Vector3(wrapPos[(midJ + 1) * 3], wrapPos[(midJ + 1) * 3 + 1], wrapPos[(midJ + 1) * 3 + 2]);
    const nTest = new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(pB, pA),
      new THREE.Vector3().subVectors(pD, pA)
    );
    const flipWrap = nTest.dot(ttChordDir) < 0;

    for (let i = 0; i < ttWrapStations.length - 1; i++) {
      for (let j = 0; j < arcSteps; j++) {
        const a = i * stride + j;
        const b = (i + 1) * stride + j;
        const c = (i + 1) * stride + (j + 1);
        const d = i * stride + (j + 1);
        if (flipWrap) {
          wrapIdx.push(a, d, b, b, d, c);
        } else {
          wrapIdx.push(a, b, d, b, c, d);
        }
      }
    }

    const ttWrapGeom = new THREE.BufferGeometry();
    ttWrapGeom.setAttribute('position', new THREE.Float32BufferAttribute(wrapPos, 3));
    ttWrapGeom.setAttribute('uv', new THREE.Float32BufferAttribute(wrapUvs, 2));
    ttWrapGeom.setIndex(wrapIdx);
    ttWrapGeom.computeVertexNormals();

    const ttWrapMesh = new THREE.Mesh(ttWrapGeom, makeHoloDecalMat(frameDecals.toptubeDecalMap));
    frameGroup.add(ttWrapMesh);
  }

  // Integrated Seatpost Wedge Clamp Cover ("6.5 Nm" rubberized flush cover in front of seatpost, matches logo.jpg)
  const clampCoverGeom = new THREE.BoxGeometry(0.026, 0.003, 0.020);
  const clampCover = new THREE.Mesh(clampCoverGeom, satinCarbonMat);
  clampCover.position.set(-0.120, 0.761, 0);
  clampCover.rotation.z = 0.11;
  frameGroup.add(clampCover);

  // 2.3 Deep Aero Kamm-Tail Down Tube + Wheel Cutout Throat + Oversized T47 BB Shell
  // Upper throat (Aurora Charcoal, tucked cleanly into lower headtube with width 0.035m < waist 0.038m so zero side overhang!)
  const downTubeUpperStations = [
    {
      pos: new THREE.Vector3(0.418, 0.725, 0),
      chord: 0.086,
      width: 0.035,
      kamm: 0.28,
      power: 2.2,
      chordDir: new THREE.Vector3(0.719, -0.695, 0),
    },
    {
      pos: new THREE.Vector3(0.376, 0.658, 0),
      chord: 0.085,
      width: 0.050,
      kamm: 0.34,
      power: 2.5,
      chordDir: new THREE.Vector3(0.719, -0.695, 0),
    },
    {
      pos: new THREE.Vector3(0.320, 0.592, 0),
      chord: 0.082,
      width: 0.054,
      kamm: 0.36,
      power: 2.65,
      chordDir: new THREE.Vector3(0.719, -0.695, 0),
    },
  ];
  frameGroup.add(createLoftedAeroMesh(downTubeUpperStations, 44, auroraCharcoalMat, true));

  // Main Aero Foil Down Tube (Gloss Piano Black Carbon)
  // Constant 54mm aero cross-section extends down to (0.068, 0.331) so the entire "ARGON 18" graphic
  // lies on the straight aero foil before the T47 BB flare!
  const downTubeMainStations = [
    {
      pos: new THREE.Vector3(0.320, 0.592, 0),
      chord: 0.082,
      width: 0.054,
      kamm: 0.36,
      power: 2.65,
      chordDir: new THREE.Vector3(0.719, -0.695, 0),
    },
    {
      pos: new THREE.Vector3(0.218, 0.486, 0),
      chord: 0.082,
      width: 0.054,
      kamm: 0.36,
      power: 2.65,
      chordDir: new THREE.Vector3(0.719, -0.695, 0),
    },
    {
      pos: new THREE.Vector3(0.068, 0.331, 0),
      chord: 0.082,
      width: 0.054,
      kamm: 0.36,
      power: 2.65,
      chordDir: new THREE.Vector3(0.719, -0.695, 0),
    },
    {
      // Flare into oversized T47 Bottom Bracket below the ARGON 18 logo
      pos: new THREE.Vector3(0.022, 0.284, 0),
      chord: 0.096,
      width: 0.072,
      kamm: 0.24,
      power: 2.4,
      chordDir: new THREE.Vector3(0.719, -0.695, 0),
    },
    {
      pos: new THREE.Vector3(-0.012, 0.254, 0),
      chord: 0.104,
      width: 0.082,
      kamm: 0.18,
      power: 2.2,
      chordDir: new THREE.Vector3(0.719, -0.695, 0),
    },
  ];
  frameGroup.add(createLoftedAeroMesh(downTubeMainStations, 44, glossCarbonMat, true));

  // Oversized T47 Bottom Bracket Shell + CeramicSpeed DUB Bearing Cups
  const bbShellGeom = new THREE.CylinderGeometry(0.048, 0.048, 0.086, 40);
  bbShellGeom.rotateX(Math.PI / 2);
  const bbShellMesh = new THREE.Mesh(bbShellGeom, glossCarbonMat);
  bbShellMesh.position.copy(BIKE_COORDS.bb);
  bbShellMesh.castShadow = true;
  bbShellMesh.receiveShadow = true;
  frameGroup.add(bbShellMesh);

  // CeramicSpeed Coated T47 Bearing Cups
  const bbCupGeom = new THREE.CylinderGeometry(0.031, 0.031, 0.092, 36);
  bbCupGeom.rotateX(Math.PI / 2);
  const bbCupMesh = new THREE.Mesh(bbCupGeom, sramAnodizedBlackMat);
  bbCupMesh.position.copy(BIKE_COORDS.bb);
  frameGroup.add(bbCupMesh);

  // Holographic Sliced "ARGON 18" Decal Conformed to Left & Right Down Tube Flanks
  // Uses the exact superellipse Kamm-tail identity |sCos|^2.65 + |sSin|^2.65 = 1 + 1.2mm surface offset!
  const dtAngle = Math.atan2(0.592 - 0.331, 0.320 - 0.068); // ~45.99 deg
  const dtLogoMat = makeHoloDecalMat(frameDecals.downtubeLogoMap);
  [-1, 1].forEach((side) => {
    const decalGeom = new THREE.PlaneGeometry(0.348, 0.060, 32, 16);
    const posAttr = decalGeom.attributes.position;
    const exp = 2.65;
    const kamm = 0.36;
    for (let i = 0; i < posAttr.count; i++) {
      const py = posAttr.getY(i);
      // In local decal space, +py points toward the top-left trailing edge (-chordDir), -py points toward leading edge (+chordDir)
      const sCos = THREE.MathUtils.clamp(-py / 0.041, -0.92, 0.92);
      const sSin = Math.pow(Math.max(0.05, 1.0 - Math.pow(Math.abs(sCos), exp)), 1 / exp);
      const widthTaper = sCos < 0 ? 1.0 - Math.abs(sCos) * kamm * 0.24 : 1.0;
      const exactSurfaceZ = 0.027 * sSin * widthTaper;
      posAttr.setZ(i, exactSurfaceZ + 0.0012);
    }
    decalGeom.computeVertexNormals();

    const logoPlane = new THREE.Mesh(decalGeom, dtLogoMat);
    // Centered at (0.224, 0.492) so the entire wordmark from 'A' to '8' sits inside the constant-width aero section
    logoPlane.position.set(0.224, 0.492, 0);
    if (side === 1) {
      logoPlane.rotation.z = dtAngle;
    } else {
      logoPlane.rotation.y = Math.PI;
      logoPlane.rotation.z = -dtAngle;
    }
    frameGroup.add(logoPlane);
  });

  // 2.4 Wheel-Hugging Aero Seat Tube
  // Lower section curves slightly to hug the 30c rear wheel arc up to the dropped seatstay junction (Y=0.568)
  const seatTubeStations = [];
  const numStSteps = 18;
  for (let i = 0; i <= numStSteps; i++) {
    const t = i / numStSteps;
    const y = THREE.MathUtils.lerp(0.263, 0.761, t);
    // Base 73.5 deg line from BB
    const baseLineX = -(y - 0.263) * Math.tan(THREE.MathUtils.degToRad(16.5));

    // Below Y=0.568, the trailing edge hugs the rear wheel arc (center -0.4023, 0.342, R_cutout = 0.352)
    let xCenter = baseLineX;
    let chord = 0.058;
    let width = 0.036;

    if (y < 0.575) {
      const dy = y - BIKE_COORDS.rearAxle.y;
      const rClearance = 0.351;
      const rearEdgeX = BIKE_COORDS.rearAxle.x + Math.sqrt(Math.max(0.01, rClearance * rClearance - dy * dy));
      const frontEdgeX = baseLineX + 0.029;
      chord = Math.max(0.046, frontEdgeX - rearEdgeX);
      xCenter = (frontEdgeX + rearEdgeX) * 0.5;
      width = THREE.MathUtils.lerp(0.056, 0.036, Math.min(1, (y - 0.263) / 0.16));
    } else {
      chord = THREE.MathUtils.lerp(0.058, 0.054, (y - 0.575) / 0.186);
      width = 0.0355;
    }

    seatTubeStations.push({
      pos: new THREE.Vector3(xCenter, y, 0),
      chord,
      width,
      kamm: 0.35,
      power: 2.3,
      chordDir: new THREE.Vector3(0.959, 0.284, 0),
    });
  }
  frameGroup.add(createLoftedAeroMesh(seatTubeStations, 40, glossCarbonMat, true));

  // 2.5 Signature Horizontal Dropped Seatstays (Single Continuous Monocoque Loft per Side!)
  // Exits the seat tube horizontally at Y=0.566m, sweeps seamlessly through the sculpted aero knee
  // around X=-0.200m with consistent upper-normal chordDir, and angles down to the rear dropouts!
  [-1, 1].forEach((side) => {
    const seatstayStations = [
      {
        // Embedded dead-center inside the seat tube at Y=0.566 (xCenter = -0.095) so it never pokes out the front
        pos: new THREE.Vector3(-0.095, 0.566, side * 0.006),
        chord: 0.030,
        width: 0.015,
        kamm: 0.22,
        power: 2.2,
        chordDir: new THREE.Vector3(0, 1, 0),
      },
      {
        pos: new THREE.Vector3(-0.138, 0.566, side * 0.032),
        chord: 0.028,
        width: 0.014,
        kamm: 0.20,
        power: 2.2,
        chordDir: new THREE.Vector3(0, 1, 0),
      },
      {
        // Approaching the horizontal knee
        pos: new THREE.Vector3(-0.180, 0.566, side * 0.045),
        chord: 0.028,
        width: 0.014,
        kamm: 0.20,
        power: 2.2,
        chordDir: new THREE.Vector3(-0.18, 0.98, 0),
      },
      {
        // Sculpted aero knee apex (smooth continuous bend, zero discontinuity!)
        pos: new THREE.Vector3(-0.198, 0.562, side * 0.048),
        chord: 0.029,
        width: 0.014,
        kamm: 0.20,
        power: 2.2,
        chordDir: new THREE.Vector3(-0.45, 0.89, 0),
      },
      {
        // Exiting knee into angled blade
        pos: new THREE.Vector3(-0.215, 0.547, side * 0.051),
        chord: 0.028,
        width: 0.014,
        kamm: 0.20,
        power: 2.2,
        chordDir: new THREE.Vector3(-0.68, 0.73, 0),
      },
      {
        pos: new THREE.Vector3(-0.260, 0.498, side * 0.056),
        chord: 0.026,
        width: 0.0135,
        kamm: 0.20,
        power: 2.2,
        chordDir: new THREE.Vector3(-0.72, 0.69, 0),
      },
      {
        pos: new THREE.Vector3(-0.330, 0.422, side * 0.063),
        chord: 0.023,
        width: 0.013,
        kamm: 0.18,
        power: 2.2,
        chordDir: new THREE.Vector3(-0.72, 0.69, 0),
      },
      {
        // Embedded into rear dropout
        pos: new THREE.Vector3(-0.402, 0.344, side * 0.070),
        chord: 0.020,
        width: 0.012,
        kamm: 0.15,
        power: 2.1,
        chordDir: new THREE.Vector3(-0.72, 0.69, 0),
      },
    ];
    frameGroup.add(createLoftedAeroMesh(seatstayStations, 32, glossCarbonMat, true));

    // 5-Bar Iridescent Speed Stripes conformed right below the dropped seatstay knee (matches profil.png & 34.png)
    const stayStripe = new THREE.Mesh(
      new THREE.PlaneGeometry(0.036, 0.018),
      makeHoloDecalMat(frameDecals.aeroStripesMap)
    );
    stayStripe.position.set(-0.236, 0.524, side * 0.0612);
    stayStripe.rotation.y = side === 1 ? -0.11 : Math.PI + 0.11;
    stayStripe.rotation.z = side * 0.82;
    frameGroup.add(stayStripe);
  });

  // 2.6 Tall Box-Section Chainstays + Rear Dropouts + UDH Hanger
  [-1, 1].forEach((side) => {
    const chainstayStations = [
      {
        pos: new THREE.Vector3(-0.015, 0.254, side * 0.032),
        chord: 0.048,
        width: 0.022,
        kamm: 0.15,
        power: 2.5,
        chordDir: new THREE.Vector3(0.19, 0.98, 0),
      },
      {
        pos: new THREE.Vector3(-0.145, 0.282, side * 0.050),
        chord: 0.042,
        width: 0.020,
        kamm: 0.15,
        power: 2.6,
        chordDir: new THREE.Vector3(0.19, 0.98, 0),
      },
      {
        pos: new THREE.Vector3(-0.285, 0.314, side * 0.062),
        chord: 0.033,
        width: 0.017,
        kamm: 0.15,
        power: 2.5,
        chordDir: new THREE.Vector3(0.19, 0.98, 0),
      },
      {
        pos: new THREE.Vector3(-0.402, 0.340, side * 0.070),
        chord: 0.026,
        width: 0.014,
        kamm: 0.10,
        power: 2.2,
        chordDir: new THREE.Vector3(0.19, 0.98, 0),
      },
    ];
    frameGroup.add(createLoftedAeroMesh(chainstayStations, 28, glossCarbonMat, true));

    // Sculpted Carbon Rear Dropout Plate
    const dropoutGeom = new THREE.CylinderGeometry(0.022, 0.022, 0.012, 24);
    dropoutGeom.rotateX(Math.PI / 2);
    const dropoutMesh = new THREE.Mesh(dropoutGeom, glossCarbonMat);
    dropoutMesh.position.set(BIKE_COORDS.rearAxle.x, BIKE_COORDS.rearAxle.y, side * 0.070);
    frameGroup.add(dropoutMesh);
  });

  // Rear Thru-Axle
  const rearAxleRod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.006, 0.006, 0.152, 20).rotateX(Math.PI / 2),
    sramAnodizedBlackMat
  );
  rearAxleRod.position.copy(BIKE_COORDS.rearAxle);
  frameGroup.add(rearAxleRod);

  // ============================================================================
  // 3. INTEGRATED ATTEN AERO BOTTLE CAGES & BIDONS (Matches cages.jpg & profil.png!)
  // ============================================================================
  const hydrationGroup = new THREE.Group();
  hydrationGroup.name = 'HydrationGroup';
  frameGroup.add(hydrationGroup);

  const cagesGroup = new THREE.Group();
  cagesGroup.name = 'AeroCages';
  const bottlesGroup = new THREE.Group();
  bottlesGroup.name = 'AeroBottles';
  bottlesGroup.visible = false; // Default matches official profile shot (Aero Cages visible)
  hydrationGroup.add(cagesGroup);
  hydrationGroup.add(bottlesGroup);

  // Build sculpted ATTEN aero bottle cage in a canonical local coordinate system:
  // - Local (0, y, 0) is the mounting spine flush against the frame tube
  // - Local +Y is from bottom retention foot (-0.068) to bottle top (+0.068)
  // - Local +X is outward from the frame tube into the bottle cavity (0 -> +0.076)
  const createAttenAeroCage = (isDowntube) => {
    const cg = new THREE.Group();

    // 1. Flush Tapered Carbon Backplate Spine (hugs the frame tube with zero gap)
    const spineStations = [
      { pos: new THREE.Vector3(0.005, -0.068, 0), chord: 0.012, width: 0.026, kamm: 0.2, power: 2.4, chordDir: new THREE.Vector3(1, 0, 0) },
      { pos: new THREE.Vector3(0.007, -0.015, 0), chord: 0.015, width: 0.030, kamm: 0.2, power: 2.4, chordDir: new THREE.Vector3(1, 0, 0) },
      { pos: new THREE.Vector3(0.008, 0.042, 0), chord: 0.016, width: 0.030, kamm: 0.2, power: 2.4, chordDir: new THREE.Vector3(1, 0, 0) },
      { pos: new THREE.Vector3(0.005, 0.068, 0), chord: 0.010, width: 0.022, kamm: 0.2, power: 2.2, chordDir: new THREE.Vector3(1, 0, 0) },
    ];
    cg.add(createLoftedAeroMesh(spineStations, 24, satinCarbonMat, true));

    // 2. Bottom L-Shaped Bottle Retention Foot & Upward Lip (at y = -0.066, protruding in +X)
    const footBase = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.0055, 0.022), satinCarbonMat);
    footBase.position.set(0.015, -0.066, 0);
    footBase.rotation.z = 0.08;
    cg.add(footBase);

    const footHook = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.009, 0.018), satinCarbonMat);
    footHook.position.set(0.027, -0.062, 0);
    footHook.rotation.z = -0.25;
    cg.add(footHook);

    // 3. Sculpted Carbon Wrap-Around Wing Hoop (Matches cages.jpg!)
    // On the Downtube cage, the top wing leaves the upper spine (y=+0.042) and angles at -44 deg
    // so it sits 100% HORIZONTAL in world space! On the Seattube cage, it wraps at -16.5 deg (also horizontal!).
    const wingDropY = isDowntube ? -0.022 : 0.004;
    const upperStartY = isDowntube ? 0.040 : 0.024;
    const lowerStartY = isDowntube ? -0.018 : -0.024;

    // Upper wrap-around wing hoop
    const upperWingPts = [
      new THREE.Vector3(0.008, upperStartY, -0.014),
      new THREE.Vector3(0.042, (upperStartY + wingDropY) * 0.5, -0.036),
      new THREE.Vector3(0.074, wingDropY, -0.026),
      new THREE.Vector3(0.078, wingDropY - 0.002, 0.0),
      new THREE.Vector3(0.074, wingDropY, 0.026),
      new THREE.Vector3(0.042, (upperStartY + wingDropY) * 0.5, 0.036),
      new THREE.Vector3(0.008, upperStartY, 0.014),
    ];
    const upperWingCurve = new THREE.CatmullRomCurve3(upperWingPts);
    const upperWingGeom = new THREE.TubeGeometry(upperWingCurve, 36, 0.0042, 12, false);
    upperWingGeom.scale(1.0, 2.1, 1.0);
    const upperWingMesh = new THREE.Mesh(upperWingGeom, satinCarbonMat);
    upperWingMesh.castShadow = true;
    cg.add(upperWingMesh);

    // Lower diagonal structural struts forming the signature triangular side window
    [-1, 1].forEach((side) => {
      const lowerStrutPts = [
        new THREE.Vector3(0.008, lowerStartY, side * 0.014),
        new THREE.Vector3(0.040, (lowerStartY + wingDropY) * 0.5, side * 0.035),
        new THREE.Vector3(0.070, wingDropY - 0.002, side * 0.028),
      ];
      const strutCurve = new THREE.CatmullRomCurve3(lowerStrutPts);
      const strutGeom = new THREE.TubeGeometry(strutCurve, 18, 0.0036, 10, false);
      strutGeom.scale(1.0, 1.8, 1.0);
      const strutMesh = new THREE.Mesh(strutGeom, satinCarbonMat);
      strutMesh.castShadow = true;
      cg.add(strutMesh);
    });

    return cg;
  };

  // Orient Downtube Cage using an exact right-handed orthonormal basis:
  // - dtYAxis points UP-RIGHT along the downtube toward the headtube (+cos(dtAngle), +sin(dtAngle), 0)
  // - dtXAxis points UP-LEFT out of the top face of the downtube into the frame triangle (-sin(dtAngle), +cos(dtAngle), 0)
  const dtYAxis = new THREE.Vector3(Math.cos(dtAngle), Math.sin(dtAngle), 0).normalize();
  const dtXAxis = new THREE.Vector3(-Math.sin(dtAngle), Math.cos(dtAngle), 0).normalize();
  const dtZAxis = new THREE.Vector3().crossVectors(dtXAxis, dtYAxis).normalize();
  const dtBasis = new THREE.Matrix4().makeBasis(dtXAxis, dtYAxis, dtZAxis);

  const dtCage = createAttenAeroCage(true);
  // Placed flush on the top Kamm-tail surface of the downtube (offset by 0.034m along dtXAxis from tube center)
  dtCage.position.set(0.180, 0.448, 0).addScaledVector(dtXAxis, 0.034);
  dtCage.quaternion.setFromRotationMatrix(dtBasis);
  cagesGroup.add(dtCage);

  // Orient Seattube Cage flush on the front face of the 73.5 deg seat tube:
  const stAngle = THREE.MathUtils.degToRad(16.5);
  const stYAxis = new THREE.Vector3(-Math.sin(stAngle), Math.cos(stAngle), 0).normalize();
  const stXAxis = new THREE.Vector3(Math.cos(stAngle), Math.sin(stAngle), 0).normalize();
  const stZAxis = new THREE.Vector3().crossVectors(stXAxis, stYAxis).normalize();
  const stBasis = new THREE.Matrix4().makeBasis(stXAxis, stYAxis, stZAxis);

  const stCage = createAttenAeroCage(false);
  stCage.position.set(-0.052, 0.440, 0).addScaledVector(stXAxis, 0.025);
  stCage.quaternion.setFromRotationMatrix(stBasis);
  cagesGroup.add(stCage);

  // Optional Aero Bidon Bottles (aligned with the exact cage basis!)
  const createAeroBidon = () => {
    const bg = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.033, 0.032, 0.155, 28).scale(1.12, 1, 0.88),
      auroraCharcoalMat
    );
    body.position.set(0.042, 0.012, 0);
    bg.add(body);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.032, 0.026, 24).scale(1.10, 1, 0.88),
      satinCarbonMat
    );
    cap.position.set(0.042, 0.102, 0);
    bg.add(cap);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.016, 16), sramAnodizedBlackMat);
    nozzle.position.set(0.042, 0.120, 0);
    bg.add(nozzle);
    return bg;
  };

  const dtBottle = createAeroBidon();
  dtBottle.position.copy(dtCage.position);
  dtBottle.quaternion.copy(dtCage.quaternion);
  bottlesGroup.add(dtBottle);

  const stBottle = createAeroBidon();
  stBottle.position.copy(stCage.position);
  stBottle.quaternion.copy(stCage.quaternion);
  bottlesGroup.add(stBottle);

  // ============================================================================
  // 4. AERO SEATPOST & REPENTE QUASAR CR 2.0 CARBON SADDLE
  // ============================================================================
  const seatpostStations = [
    {
      pos: new THREE.Vector3(-0.142, 0.742, 0),
      chord: 0.050,
      width: 0.027,
      kamm: 0.36,
      power: 2.3,
      chordDir: new THREE.Vector3(0.959, 0.284, 0),
    },
    {
      pos: new THREE.Vector3(-0.175, 0.854, 0),
      chord: 0.048,
      width: 0.026,
      kamm: 0.36,
      power: 2.3,
      chordDir: new THREE.Vector3(0.959, 0.284, 0),
    },
    {
      // Setback head transition
      pos: new THREE.Vector3(-0.206, 0.946, 0),
      chord: 0.044,
      width: 0.028,
      kamm: 0.25,
      power: 2.2,
      chordDir: new THREE.Vector3(0.959, 0.284, 0),
    },
    {
      pos: new THREE.Vector3(-0.222, 0.962, 0),
      chord: 0.038,
      width: 0.032,
      kamm: 0.15,
      power: 2.1,
      chordDir: new THREE.Vector3(0.98, 0.15, 0),
    },
  ];
  frameGroup.add(createLoftedAeroMesh(seatpostStations, 36, satinCarbonMat, true));

  // Seatpost Rail Clamp Mechanism
  const railClamp = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.014, 0.044, 24).rotateX(Math.PI / 2),
    sramAnodizedBlackMat
  );
  railClamp.position.set(-0.222, 0.964, 0);
  frameGroup.add(railClamp);

  // Repente Quasar CR 2.0 Carbon Rails
  [-1, 1].forEach((side) => {
    const railPts = [
      new THREE.Vector3(-0.285, 0.978, side * 0.028),
      new THREE.Vector3(-0.245, 0.964, side * 0.021),
      new THREE.Vector3(-0.195, 0.964, side * 0.021),
      new THREE.Vector3(-0.125, 0.978, side * 0.008),
    ];
    const railCurve = new THREE.CatmullRomCurve3(railPts);
    const railMesh = new THREE.Mesh(new THREE.TubeGeometry(railCurve, 24, 0.0038, 10, false), satinCarbonMat);
    frameGroup.add(railMesh);
  });

  // Repente Quasar CR 2.0 Sculpted Racing Saddle Shell + Padding
  const saddleStations = [
    // Rear tail flare
    { pos: new THREE.Vector3(-0.312, 0.992, 0), chord: 0.011, width: 0.095, kamm: 0.1, power: 2.2, chordDir: new THREE.Vector3(0, 1, 0) },
    // Wide sit-bone wing (142mm)
    { pos: new THREE.Vector3(-0.278, 0.989, 0), chord: 0.015, width: 0.142, kamm: 0.1, power: 2.3, chordDir: new THREE.Vector3(0, 1, 0) },
    { pos: new THREE.Vector3(-0.235, 0.985, 0), chord: 0.016, width: 0.112, kamm: 0.1, power: 2.2, chordDir: new THREE.Vector3(0, 1, 0) },
    // Mid transition
    { pos: new THREE.Vector3(-0.185, 0.983, 0), chord: 0.016, width: 0.056, kamm: 0.1, power: 2.2, chordDir: new THREE.Vector3(0, 1, 0) },
    // Flat racing nose
    { pos: new THREE.Vector3(-0.125, 0.983, 0), chord: 0.015, width: 0.038, kamm: 0.1, power: 2.2, chordDir: new THREE.Vector3(0, 1, 0) },
    { pos: new THREE.Vector3(-0.082, 0.980, 0), chord: 0.011, width: 0.026, kamm: 0.1, power: 2.0, chordDir: new THREE.Vector3(0, 1, 0) },
  ];
  const saddleMesh = createLoftedAeroMesh(saddleStations, 36, saddleMat, true);
  frameGroup.add(saddleMesh);

  // Subtle red/silver Repente rail accent under the saddle tail
  const repenteAccent = new THREE.Mesh(
    new THREE.BoxGeometry(0.036, 0.003, 0.058),
    new THREE.MeshStandardMaterial({ color: '#c8102e', metalness: 0.6, roughness: 0.3 })
  );
  repenteAccent.position.set(-0.272, 0.980, 0);
  frameGroup.add(repenteAccent);

  // ============================================================================
  // 5. STEERABLE FRONT END: FORK + ATTEN CHB-01 AERO COCKPIT + FRONT WHEEL
  // ============================================================================
  // Placed in a pivot group aligned with the 72.7 deg Head Tube axis so steering is 100% accurate!
  const steeringPivot = new THREE.Group();
  steeringPivot.name = 'SteeringPivot';
  steeringPivot.position.copy(BIKE_COORDS.headTop);
  rootGroup.add(steeringPivot);

  // Helper to convert World coordinates into SteeringPivot local coordinates
  const toSteerLocal = (worldVec) => worldVec.clone().sub(BIKE_COORDS.headTop);

  // 5.1 Nitrogen Pro Wider, Deeper, Faster Aero Fork
  // Integrated Fork Crown (Aurora Charcoal at top blending into Gloss Black blades)
  const forkCrownStations = [
    {
      pos: toSteerLocal(new THREE.Vector3(0.433, 0.688, 0)),
      chord: 0.084,
      width: 0.052,
      kamm: 0.25,
      power: 2.2,
      chordDir: new THREE.Vector3(0.94, 0.34, 0),
    },
    {
      pos: toSteerLocal(new THREE.Vector3(0.448, 0.654, 0)),
      chord: 0.078,
      width: 0.078,
      kamm: 0.28,
      power: 2.4,
      chordDir: new THREE.Vector3(0.94, 0.34, 0),
    },
  ];
  steeringPivot.add(createLoftedAeroMesh(forkCrownStations, 36, auroraCharcoalMat, true));

  // Left & Right Wide Aero Fork Blades
  [-1, 1].forEach((side) => {
    // Upper Fork Blade (Aurora Charcoal down to mid-blade diagonal paint split)
    const upperBladeStations = [
      {
        pos: toSteerLocal(new THREE.Vector3(0.446, 0.660, side * 0.026)),
        chord: 0.068,
        width: 0.018,
        kamm: 0.28,
        power: 2.1,
        chordDir: new THREE.Vector3(0.92, 0.38, 0),
      },
      {
        pos: toSteerLocal(new THREE.Vector3(0.482, 0.578, side * 0.048)),
        chord: 0.062,
        width: 0.016,
        kamm: 0.30,
        power: 2.1,
        chordDir: new THREE.Vector3(0.92, 0.38, 0),
      },
      {
        pos: toSteerLocal(new THREE.Vector3(0.525, 0.482, side * 0.052)),
        chord: 0.056,
        width: 0.015,
        kamm: 0.30,
        power: 2.1,
        chordDir: new THREE.Vector3(0.92, 0.38, 0),
      },
    ];
    steeringPivot.add(createLoftedAeroMesh(upperBladeStations, 32, auroraCharcoalMat, false));

    // Lower Fork Blade (Gloss Carbon down to front thru-axle dropout)
    const lowerBladeStations = [
      {
        pos: toSteerLocal(new THREE.Vector3(0.525, 0.482, side * 0.052)),
        chord: 0.056,
        width: 0.015,
        kamm: 0.30,
        power: 2.1,
        chordDir: new THREE.Vector3(0.92, 0.38, 0),
      },
      {
        pos: toSteerLocal(new THREE.Vector3(0.562, 0.400, side * 0.052)),
        chord: 0.050,
        width: 0.014,
        kamm: 0.28,
        power: 2.1,
        chordDir: new THREE.Vector3(0.92, 0.38, 0),
      },
      {
        pos: toSteerLocal(new THREE.Vector3(0.588, 0.338, side * 0.051)),
        chord: 0.042,
        width: 0.013,
        kamm: 0.22,
        power: 2.1,
        chordDir: new THREE.Vector3(0.92, 0.38, 0),
      },
    ];
    steeringPivot.add(createLoftedAeroMesh(lowerBladeStations, 32, glossCarbonMat, true));

    // 5-Bar Iridescent Speed Stripes on Lower Fork Blade (matches profil.png & 34.png)
    const forkStripe = new THREE.Mesh(
      new THREE.PlaneGeometry(0.046, 0.046),
      makeHoloDecalMat(frameDecals.aeroStripesMap)
    );
    forkStripe.position.copy(toSteerLocal(new THREE.Vector3(0.565, 0.394, side * 0.060)));
    if (side === -1) forkStripe.rotation.y = Math.PI;
    forkStripe.rotation.z = side * -1.16;
    steeringPivot.add(forkStripe);
  });

  // Front Thru-Axle
  const frontAxleRod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.006, 0.006, 0.112, 20).rotateX(Math.PI / 2),
    sramAnodizedBlackMat
  );
  frontAxleRod.position.copy(toSteerLocal(BIKE_COORDS.frontAxle));
  steeringPivot.add(frontAxleRod);

  // 5.2 ATTEN CHB-01 Integrated One-Piece Carbon Aero Cockpit (Matches cockpit.jpg!)
  const cockpitGroup = new THREE.Group();
  cockpitGroup.name = 'ATTEN_Cockpit';
  steeringPivot.add(cockpitGroup);

  // 1. Contoured Aero Headset Spacer Stack (From Headtube Top 0.816m up to Stem Base 0.850m)
  const spacerStations = [
    {
      pos: toSteerLocal(new THREE.Vector3(0.393, 0.816, 0)),
      chord: 0.074,
      width: 0.045,
      kamm: 0.30,
      power: 2.3,
      chordDir: new THREE.Vector3(0.955, 0.297, 0),
    },
    {
      pos: toSteerLocal(new THREE.Vector3(0.388, 0.833, 0)),
      chord: 0.068,
      width: 0.042,
      kamm: 0.30,
      power: 2.4,
      chordDir: new THREE.Vector3(0.985, 0.170, 0),
    },
    {
      pos: toSteerLocal(new THREE.Vector3(0.383, 0.850, 0)),
      chord: 0.064,
      width: 0.041,
      kamm: 0.28,
      power: 2.4,
      chordDir: new THREE.Vector3(1.0, 0.0, 0.0),
    },
    {
      // Upper integrated steerer clamp housing (rises seamlessly to the 0.873m stem deck)
      pos: toSteerLocal(new THREE.Vector3(0.376, 0.873, 0)),
      chord: 0.056,
      width: 0.040,
      kamm: 0.28,
      power: 2.4,
      chordDir: new THREE.Vector3(1.0, 0.0, 0.0),
    },
  ];
  cockpitGroup.add(createLoftedAeroMesh(spacerStations, 40, satinCarbonMat, true));

  // 2. Integrated Aero Stem Body (Coplanar 0.873m top deck from steerer clamp into wing bar crest)
  const stemStations = [
    {
      pos: toSteerLocal(new THREE.Vector3(0.374, 0.862, 0)),
      chord: 0.022,
      width: 0.039,
      kamm: 0.12,
      power: 2.5,
      chordDir: new THREE.Vector3(0.0, 1.0, 0.0),
    },
    {
      pos: toSteerLocal(new THREE.Vector3(0.415, 0.862, 0)),
      chord: 0.022,
      width: 0.038,
      kamm: 0.12,
      power: 2.5,
      chordDir: new THREE.Vector3(0.0, 1.0, 0.0),
    },
    {
      pos: toSteerLocal(new THREE.Vector3(0.455, 0.862, 0)),
      chord: 0.022,
      width: 0.041,
      kamm: 0.12,
      power: 2.5,
      chordDir: new THREE.Vector3(0.0, 1.0, 0.0),
    },
    {
      pos: toSteerLocal(new THREE.Vector3(0.476, 0.862, 0)),
      chord: 0.0218,
      width: 0.052,
      kamm: 0.10,
      power: 2.45,
      chordDir: new THREE.Vector3(0.0, 1.0, 0.0),
    },
    {
      pos: toSteerLocal(new THREE.Vector3(0.490, 0.862, 0)),
      chord: 0.021,
      width: 0.062,
      kamm: 0.08,
      power: 2.4,
      chordDir: new THREE.Vector3(0.0, 1.0, 0.0),
    },
  ];
  cockpitGroup.add(createLoftedAeroMesh(stemStations, 36, satinCarbonMat, false));

  // Flush Countersunk Top Cap Ring + Bolt on the stem's steerer deck (seen in cockpit.jpg)
  const topCapBolt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0075, 0.0075, 0.002, 24),
    sramAnodizedBlackMat
  );
  topCapBolt.position.copy(toSteerLocal(new THREE.Vector3(0.372, 0.8732, 0)));
  cockpitGroup.add(topCapBolt);

  // ATTEN Underlined "A" Logo on the Top Center of the Handlebar Wing T-Junction (seen in cockpit.jpg!)
  const attenTopDecal = new THREE.Mesh(
    new THREE.PlaneGeometry(0.014, 0.014).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: frameDecals.attenLogoMap,
      transparent: true,
      alphaTest: 0.15,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    })
  );
  attenTopDecal.position.copy(toSteerLocal(new THREE.Vector3(0.486, 0.8734, 0)));
  cockpitGroup.add(attenTopDecal);

  // Out-Front ATTEN Integrated Computer Mount + Garmin/Wahoo Puck (seen in cockpit.jpg)
  const mountArm = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.006, 0.022), satinCarbonMat);
  mountArm.position.copy(toSteerLocal(new THREE.Vector3(0.532, 0.862, 0)));
  cockpitGroup.add(mountArm);

  const mountPuck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.019, 0.019, 0.008, 28),
    sramAnodizedBlackMat
  );
  mountPuck.position.copy(toSteerLocal(new THREE.Vector3(0.556, 0.863, 0)));
  cockpitGroup.add(mountPuck);

  // 3. Wing-Shaped Flat Aero Handlebar Tops (Spans z = -0.155 to +0.155, with swept central T-junction fillet)
  const wingStations = [
    {
      pos: toSteerLocal(new THREE.Vector3(0.492, 0.862, -0.155)),
      chord: 0.025,
      width: 0.025,
      kamm: 0.0,
      power: 2.0,
      chordDir: new THREE.Vector3(1.0, 0.0, 0.0),
      widthDir: new THREE.Vector3(0.0, 1.0, 0.0),
    },
    {
      pos: toSteerLocal(new THREE.Vector3(0.494, 0.862, -0.095)),
      chord: 0.042,
      width: 0.020,
      kamm: 0.18,
      power: 2.35,
      chordDir: new THREE.Vector3(0.99, 0.10, 0.0),
      widthDir: new THREE.Vector3(-0.10, 0.99, 0.0),
    },
    {
      pos: toSteerLocal(new THREE.Vector3(0.492, 0.862, -0.036)),
      chord: 0.046,
      width: 0.0218,
      kamm: 0.16,
      power: 2.45,
      chordDir: new THREE.Vector3(1.0, 0.0, 0.0),
      widthDir: new THREE.Vector3(0.0, 1.0, 0.0),
    },
    {
      pos: toSteerLocal(new THREE.Vector3(0.485, 0.862, 0.0)),
      chord: 0.060,
      width: 0.0222,
      kamm: 0.14,
      power: 2.5,
      chordDir: new THREE.Vector3(1.0, 0.0, 0.0),
      widthDir: new THREE.Vector3(0.0, 1.0, 0.0),
    },
    {
      pos: toSteerLocal(new THREE.Vector3(0.492, 0.862, 0.036)),
      chord: 0.046,
      width: 0.0218,
      kamm: 0.16,
      power: 2.45,
      chordDir: new THREE.Vector3(1.0, 0.0, 0.0),
      widthDir: new THREE.Vector3(0.0, 1.0, 0.0),
    },
    {
      pos: toSteerLocal(new THREE.Vector3(0.494, 0.862, 0.095)),
      chord: 0.042,
      width: 0.020,
      kamm: 0.18,
      power: 2.35,
      chordDir: new THREE.Vector3(0.99, 0.10, 0.0),
      widthDir: new THREE.Vector3(-0.10, 0.99, 0.0),
    },
    {
      pos: toSteerLocal(new THREE.Vector3(0.492, 0.862, 0.155)),
      chord: 0.025,
      width: 0.025,
      kamm: 0.0,
      power: 2.0,
      chordDir: new THREE.Vector3(1.0, 0.0, 0.0),
      widthDir: new THREE.Vector3(0.0, 1.0, 0.0),
    },
  ];
  cockpitGroup.add(createLoftedAeroMesh(wingStations, 36, satinCarbonMat, false));

  // 4. Compact Drop Bars + Ciclovation Leather Touch Bar Tape + SRAM RED AXS E1 Shifters/Hoods
  // Exits the 25mm circular wing end collinearly at z = ±0.148 before sweeping forward into the drops!
  [-1, 1].forEach((side) => {
    const dropPts = [
      toSteerLocal(new THREE.Vector3(0.492, 0.862, side * 0.148)),
      toSteerLocal(new THREE.Vector3(0.494, 0.862, side * 0.172)),
      toSteerLocal(new THREE.Vector3(0.525, 0.862, side * 0.194)),
      toSteerLocal(new THREE.Vector3(0.566, 0.858, side * 0.197)), // Enters smoothly inside the hood body
      toSteerLocal(new THREE.Vector3(0.584, 0.812, side * 0.200)), // Forward drop curve
      toSteerLocal(new THREE.Vector3(0.558, 0.752, side * 0.206)), // Lower drop bend
      toSteerLocal(new THREE.Vector3(0.455, 0.738, side * 0.210)), // Drop tail extension
    ];
    const dropCurve = new THREE.CatmullRomCurve3(dropPts);
    const dropGeom = new THREE.TubeGeometry(dropCurve, 56, 0.0126, 24, false);
    const dropMesh = new THREE.Mesh(dropGeom, barTapeMat);
    dropMesh.castShadow = true;
    dropMesh.receiveShadow = true;
    cockpitGroup.add(dropMesh);

    // 4.1 Argon 18 Finishing Tape Collar on the upper bar transition (visible in cockpit.jpg & front.jpg)
    // Closed cylinder sleeve wrapped around the bar transition so there are zero exposed flat end caps!
    const collarCylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0129, 0.0129, 0.018, 24).rotateX(Math.PI / 2),
      satinCarbonMat
    );
    collarCylinder.position.copy(toSteerLocal(new THREE.Vector3(0.4925, 0.862, side * 0.155)));
    cockpitGroup.add(collarCylinder);

    // 4.2 Bar-end plug with 3-dot Argon 18 molecular cap (seen in cockpit.jpg)
    const plugGroup = new THREE.Group();
    plugGroup.position.copy(toSteerLocal(new THREE.Vector3(0.453, 0.738, side * 0.210)));
    cockpitGroup.add(plugGroup);

    const plugCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0127, 0.0127, 0.006, 24).rotateZ(Math.PI / 2),
      sramAnodizedBlackMat
    );
    plugGroup.add(plugCap);
    [
      [0, 0.0042, 0],
      [0, -0.0025, 0.0038],
      [0, -0.0025, -0.0038],
    ].forEach(([dx, dy, dz]) => {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0013, 8, 8), glossCarbonMat);
      dot.position.set(-0.0031 + dx, dy, dz);
      plugGroup.add(dot);
    });

    // ==========================================================================
    // 4.3 SRAM RED AXS E1 (ED-RED-E1) HRD Shift-Brake Controls (Multi-Part Sculpted Assembly)
    // ==========================================================================
    const shifterGroup = new THREE.Group();
    shifterGroup.name = side > 0 ? 'SRAM_RED_AXS_Right_Shifter' : 'SRAM_RED_AXS_Left_Shifter';
    shifterGroup.position.copy(toSteerLocal(new THREE.Vector3(0.576, 0.858, side * 0.196)));
    // Pro aero ergonomics: slight inward toe-in cant + subtle inward roll of the hydraulic pommel (matches front.jpg!)
    shifterGroup.rotation.y = side * 0.125;
    shifterGroup.rotation.x = -side * 0.055;
    cockpitGroup.add(shifterGroup);

    // A0. Seamless Bar-Tape Lower Clamp Skirt (tapers flush onto the 25.2mm drop bar with capEnds=false so zero flat step!)
    const figure8Stations = [
      {
        // Embedded inside the main hood body
        pos: new THREE.Vector3(-0.005, 0.002, 0.0),
        chord: 0.031,
        width: 0.0282,
        kamm: 0.05,
        power: 2.15,
        chordDir: new THREE.Vector3(0.95, 0.31, 0),
        widthDir: new THREE.Vector3(0, 0, 1),
      },
      {
        // Wraps coaxially around the upper drop curve right below the hood body
        pos: new THREE.Vector3(0.002, -0.015, 0.0),
        chord: 0.0285,
        width: 0.0272,
        kamm: 0.0,
        power: 2.05,
        chordDir: new THREE.Vector3(0.98, 0.20, 0),
        widthDir: new THREE.Vector3(0, 0, 1),
      },
      {
        // Tapers flush onto the 25.2mm bar-tape tube at (0.007, -0.029, 0.0005)
        pos: new THREE.Vector3(0.007, -0.029, side * 0.0005),
        chord: 0.0253,
        width: 0.0253,
        kamm: 0.0,
        power: 2.0,
        chordDir: new THREE.Vector3(1.0, 0.0, 0),
        widthDir: new THREE.Vector3(0, 0, 1),
      },
    ];
    const figure8Mesh = createLoftedAeroMesh(figure8Stations, 32, sramHoodMat, false);
    shifterGroup.add(figure8Mesh);

    // A. Sculpted Ergonomic Silicone Hood Body & Hydraulic Master-Cylinder Pommel
    // Lofted across 9 anatomical cross-sections:
    // - Starts coaxially on the 25.2mm drop bar ramp (-0.025, 0.002, -side*0.001) with capEnds=false so there is zero flat disc!
    // - Swells smoothly into the lower hood clamp skirt covering the top of the forward drop curve
    // - Narrows in the ergonomic E1 2-finger grip saddle
    // - Rises at the signature SRAM RED E1 upward ramp into the tall, flat-fronted hydraulic reservoir pommel
    const hoodStations = [
      {
        // Coaxial with the 25.2mm bar-tape ramp for a 100% flush, seamless transition
        pos: new THREE.Vector3(-0.025, 0.002, -side * 0.001),
        chord: 0.0253,
        width: 0.0253,
        kamm: 0.0,
        power: 2.0,
        chordDir: new THREE.Vector3(0.20, 0.98, 0),
        widthDir: new THREE.Vector3(0, 0, 1),
      },
      {
        // Bar-to-hood figure-8 wrap collar flare (hugs both the upper ramp and lower drop bend)
        pos: new THREE.Vector3(-0.012, 0.001, -side * 0.0004),
        chord: 0.032,
        width: 0.0278,
        kamm: 0.08,
        power: 2.15,
        chordDir: new THREE.Vector3(0.32, 0.947, 0),
        widthDir: new THREE.Vector3(0, 0, 1),
      },
      {
        // Ulnar palm rest & lower clamp skirt transition
        pos: new THREE.Vector3(0.002, 0.003, 0.0),
        chord: 0.039,
        width: 0.0285,
        kamm: 0.14,
        power: 2.25,
        chordDir: new THREE.Vector3(0.45, 0.893, 0),
        widthDir: new THREE.Vector3(0, 0, 1),
      },
      {
        // Narrower E1 ergonomic finger-wrap saddle
        pos: new THREE.Vector3(0.017, 0.012, 0.0),
        chord: 0.038,
        width: 0.0265,
        kamm: 0.18,
        power: 2.38,
        chordDir: new THREE.Vector3(0.62, 0.785, 0),
        widthDir: new THREE.Vector3(0, 0, 1),
      },
      {
        // Forward ramp rising into the high-pivot housing
        pos: new THREE.Vector3(0.032, 0.025, -side * 0.0008),
        chord: 0.040,
        width: 0.0274,
        kamm: 0.24,
        power: 2.50,
        chordDir: new THREE.Vector3(0.84, 0.542, 0),
        widthDir: new THREE.Vector3(0, 0, 1),
      },
      {
        // Lower master-cylinder pommel neck
        pos: new THREE.Vector3(0.041, 0.043, -side * 0.0018),
        chord: 0.037,
        width: 0.0280,
        kamm: 0.28,
        power: 2.60,
        chordDir: new THREE.Vector3(0.96, 0.28, 0),
        widthDir: new THREE.Vector3(0, 0, 1),
      },
      {
        // Upper hydraulic reservoir pommel body (flat-fronted box-oval profile seen in front.jpg & cockpit.jpg)
        pos: new THREE.Vector3(0.045, 0.061, -side * 0.0026),
        chord: 0.034,
        width: 0.0274,
        kamm: 0.30,
        power: 2.65,
        chordDir: new THREE.Vector3(0.99, 0.14, 0),
        widthDir: new THREE.Vector3(0, 0, 1),
      },
      {
        // Pommel crown shoulder
        pos: new THREE.Vector3(0.044, 0.072, -side * 0.0030),
        chord: 0.027,
        width: 0.0235,
        kamm: 0.22,
        power: 2.35,
        chordDir: new THREE.Vector3(0.995, 0.10, 0),
        widthDir: new THREE.Vector3(0, 0, 1),
      },
      {
        // Smooth rounded top dome of the pommel (tapers to a smooth crown so there are zero flat end-cap discs)
        pos: new THREE.Vector3(0.043, 0.0758, -side * 0.0031),
        chord: 0.018,
        width: 0.0165,
        kamm: 0.12,
        power: 2.0,
        chordDir: new THREE.Vector3(1.0, 0.05, 0),
        widthDir: new THREE.Vector3(0, 0, 1),
      },
      {
        // Apex of the pommel dome
        pos: new THREE.Vector3(0.042, 0.0782, -side * 0.0032),
        chord: 0.003,
        width: 0.003,
        kamm: 0.0,
        power: 2.0,
        chordDir: new THREE.Vector3(1.0, 0.0, 0),
        widthDir: new THREE.Vector3(0, 0, 1),
      },
    ];
    const hoodMesh = createLoftedAeroMesh(hoodStations, 40, sramHoodMat, false);
    shifterGroup.add(hoodMesh);

    // B. Medial Recessed Tactile AXS "Bonus Button" flush on the inside thumb flank of the pommel
    const bonusBtnCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.0042, 14, 10),
      satinCarbonMat
    );
    bonusBtnCap.scale.set(1.25, 0.85, 0.25);
    bonusBtnCap.position.set(0.039, 0.048, -side * 0.0135);
    shifterGroup.add(bonusBtnCap);

    // D. High-Pivot Sculpted SRAM RED AXS E1 Carbon Brake Lever Blade (Carbon LFRT)
    // Matches front.jpg, cockpit.jpg, 34.png & profil.png:
    // - Hinges high inside the front pommel slot (x=0.048, y=0.038)
    // - Curves forward then sweeps down and back with the signature E1 one-finger ergonomic hook
    // - Flares OUTBOARD (+side * Z) by ~9 deg toward the drops so the tips frame the front view (front.jpg!)
    // - Wide aero front face (17.5mm) at the upper bridge tapering to a sculpted curled tip
    const bladeStations = [
      {
        // High-pivot hinge neck inside the hood slot
        pos: new THREE.Vector3(0.047, 0.038, -side * 0.001),
        chord: 0.010,
        width: 0.0150,
        kamm: 0.32,
        power: 2.5,
        chordDir: new THREE.Vector3(0.95, 0.16, side * 0.26).normalize(),
        widthDir: new THREE.Vector3(-0.26, 0.06, side * 0.96).normalize(),
      },
      {
        // Upper blade shoulder with recessed rectangular pivot window (v ≈ 0.18)
        pos: new THREE.Vector3(0.054, 0.018, side * 0.002),
        chord: 0.0115,
        width: 0.0176,
        kamm: 0.35,
        power: 2.65,
        chordDir: new THREE.Vector3(0.91, 0.12, side * 0.38).normalize(),
        widthDir: new THREE.Vector3(-0.38, 0.05, side * 0.92).normalize(),
      },
      {
        // Upper-mid ergonomic one-finger braking saddle (concave finger pocket in profile!)
        pos: new THREE.Vector3(0.052, -0.010, side * 0.0075),
        chord: 0.0105,
        width: 0.0168,
        kamm: 0.35,
        power: 2.60,
        chordDir: new THREE.Vector3(0.89, 0.04, side * 0.44).normalize(),
        widthDir: new THREE.Vector3(-0.44, 0.04, side * 0.90).normalize(),
      },
      {
        // Mid blade where the vertical silver "Red" speed graphic starts (v ≈ 0.48)
        pos: new THREE.Vector3(0.048, -0.042, side * 0.0145),
        chord: 0.0092,
        width: 0.0155,
        kamm: 0.34,
        power: 2.50,
        chordDir: new THREE.Vector3(0.88, -0.05, side * 0.46).normalize(),
        widthDir: new THREE.Vector3(-0.46, 0.02, side * 0.89).normalize(),
      },
      {
        // Lower blade body ("Red" wordmark zone, flaring outboard in front.jpg)
        pos: new THREE.Vector3(0.042, -0.076, side * 0.0225),
        chord: 0.0078,
        width: 0.0136,
        kamm: 0.30,
        power: 2.35,
        chordDir: new THREE.Vector3(0.87, -0.14, side * 0.46).normalize(),
        widthDir: new THREE.Vector3(-0.46, 0.0, side * 0.89).normalize(),
      },
      {
        // Lower finger-hook flare before the tip
        pos: new THREE.Vector3(0.036, -0.104, side * 0.0285),
        chord: 0.0068,
        width: 0.0114,
        kamm: 0.22,
        power: 2.15,
        chordDir: new THREE.Vector3(0.85, -0.24, side * 0.46).normalize(),
        widthDir: new THREE.Vector3(-0.46, 0.0, side * 0.89).normalize(),
      },
      {
        // Curled aerodynamic lever tip (sweeps slightly rearward at the very bottom like profil.png!)
        pos: new THREE.Vector3(0.029, -0.119, side * 0.0315),
        chord: 0.0052,
        width: 0.0078,
        kamm: 0.10,
        power: 2.0,
        chordDir: new THREE.Vector3(0.83, -0.34, side * 0.44).normalize(),
        widthDir: new THREE.Vector3(-0.44, 0.0, side * 0.90).normalize(),
      },
    ];
    const carbonBladeMesh = createLoftedAeroMesh(bladeStations, 32, sramLeverBladeMat, true);
    shifterGroup.add(carbonBladeMesh);

    // E. Nested eTap AXS Electronic Shift Paddle (Tucked directly behind the carbon brake blade!)
    // Matches profil.png & cockpit.jpg: thinner black composite paddle following the rear edge of the brake blade,
    // widening into the textured finger shift tab in the lower half
    const paddleStations = [
      {
        pos: new THREE.Vector3(0.039, 0.016, side * 0.0005),
        chord: 0.0045,
        width: 0.0095,
        kamm: 0.20,
        power: 2.4,
        chordDir: new THREE.Vector3(0.96, 0.08, side * 0.22).normalize(),
        widthDir: new THREE.Vector3(-0.22, 0.0, side * 0.975).normalize(),
      },
      {
        pos: new THREE.Vector3(0.039, -0.022, side * 0.0075),
        chord: 0.0052,
        width: 0.0112,
        kamm: 0.22,
        power: 2.5,
        chordDir: new THREE.Vector3(0.95, 0.0, side * 0.26).normalize(),
        widthDir: new THREE.Vector3(-0.26, 0.0, side * 0.965).normalize(),
      },
      {
        // Widened textured lower eTap shift paddle tab (projects slightly inward/rearward for instant finger reach)
        pos: new THREE.Vector3(0.035, -0.062, side * 0.0150),
        chord: 0.0065,
        width: 0.0132,
        kamm: 0.25,
        power: 2.55,
        chordDir: new THREE.Vector3(0.94, -0.10, side * 0.28).normalize(),
        widthDir: new THREE.Vector3(-0.28, 0.0, side * 0.96).normalize(),
      },
      {
        pos: new THREE.Vector3(0.029, -0.094, side * 0.0210),
        chord: 0.0058,
        width: 0.0115,
        kamm: 0.20,
        power: 2.4,
        chordDir: new THREE.Vector3(0.92, -0.18, side * 0.28).normalize(),
        widthDir: new THREE.Vector3(-0.28, 0.0, side * 0.96).normalize(),
      },
      {
        pos: new THREE.Vector3(0.024, -0.106, side * 0.0235),
        chord: 0.0038,
        width: 0.0072,
        kamm: 0.10,
        power: 2.1,
        chordDir: new THREE.Vector3(0.90, -0.24, side * 0.28).normalize(),
        widthDir: new THREE.Vector3(-0.28, 0.0, side * 0.96).normalize(),
      },
    ];
    const shiftPaddleMesh = createLoftedAeroMesh(paddleStations, 24, sramAnodizedBlackMat, true);
    shifterGroup.add(shiftPaddleMesh);
  });

  // ============================================================================
  // 6. ATTEN X SCOPE ARTECH 6.A+ 65MM WHEELSET & VITTORIA CORSA PRO 30C TIRES
  // ============================================================================
  const buildScopeArtechWheel = (isFront) => {
    const wheelGroup = new THREE.Group();
    wheelGroup.name = isFront ? 'FrontWheel' : 'RearWheel';

    // 6.1 Vittoria Corsa Pro TLR 30c Cotton Tan-Wall Tire
    // Torus major radius R = 0.3265, tube radius r = 0.0155 -> outer radius = 0.342m
    const tireGeom = new THREE.TorusGeometry(0.3265, 0.0155, 36, 112);
    const tireMat = new THREE.MeshPhysicalMaterial({
      name: 'VittoriaCorsaPro30c',
      map: vittoriaMaps.map,
      normalMap: vittoriaMaps.normalMap,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: 0.74,
      metalness: 0.02,
      clearcoat: 0.05,
    });
    const tireMesh = new THREE.Mesh(tireGeom, tireMat);
    tireMesh.castShadow = true;
    tireMesh.receiveShadow = true;
    wheelGroup.add(tireMesh);

    // 6.2 ATTEN x Scope Artech 6.A+ 65mm Toroidal Rim with Biomimetic Aeroscale Texture
    // Build a custom LatheGeometry in YZ -> rotated so its axis is Z (matching TorusGeometry)
    const rimProfilePts = [];
    const rOuter = 0.314;
    const rInner = 0.249; // 65mm depth
    const halfWidthOuter = 0.0152; // 30.4mm external width
    const halfWidthBelly = 0.0160; // 32mm toroidal bulge
    const stepsFlank = 16;
    const stepsNose = 12;

    // Right flank (from outer bead down to inner spoke bed nose)
    for (let i = 0; i <= stepsFlank; i++) {
      const t = i / stepsFlank;
      const r = THREE.MathUtils.lerp(rOuter, rInner + 0.010, t);
      const bulge = Math.sin(t * Math.PI) * (halfWidthBelly - halfWidthOuter);
      const z = (halfWidthOuter + bulge) * (1.0 - Math.pow(t, 2.4) * 0.48);
      rimProfilePts.push(new THREE.Vector2(r, z));
    }
    // Rounded toroidal spoke-bed nose across Z = +wNose to -wNose
    const wNose = rimProfilePts[rimProfilePts.length - 1].y;
    for (let i = 1; i < stepsNose; i++) {
      const ang = (i / stepsNose) * Math.PI;
      const r = rInner + 0.010 - Math.sin(ang) * 0.010;
      const z = Math.cos(ang) * wNose;
      rimProfilePts.push(new THREE.Vector2(r, z));
    }
    // Left flank (from inner nose back up to outer bead)
    for (let i = stepsFlank; i >= 0; i--) {
      const t = i / stepsFlank;
      const r = THREE.MathUtils.lerp(rOuter, rInner + 0.010, t);
      const bulge = Math.sin(t * Math.PI) * (halfWidthBelly - halfWidthOuter);
      const z = -(halfWidthOuter + bulge) * (1.0 - Math.pow(t, 2.4) * 0.48);
      rimProfilePts.push(new THREE.Vector2(r, z));
    }

    const rimGeom = new THREE.LatheGeometry(rimProfilePts, 96);
    rimGeom.rotateX(Math.PI / 2); // Align lathe Y axis with wheel Z axis
    rimGeom.rotateZ(Math.PI / 2); // Align u=0.25 with 12 o'clock and u=0.75 with 6 o'clock valve stem

    const rimMat = new THREE.MeshPhysicalMaterial({
      name: 'ScopeArtech6ARim',
      map: scopeWheelMaps.map,
      normalMap: scopeWheelMaps.normalMap,
      normalScale: new THREE.Vector2(0.55, 0.55),
      metalness: 0.25,
      roughness: 0.24,
      clearcoat: 0.88,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.4,
    });
    const rimMesh = new THREE.Mesh(rimGeom, rimMat);
    rimMesh.castShadow = true;
    rimMesh.receiveShadow = true;
    wheelGroup.add(rimMesh);

    // 6.3 Tubeless Presta Valve Stem at 6 o'clock (theta = -PI/2)
    const valveGroup = new THREE.Group();
    const valveBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0024, 0.0028, 0.032, 12),
      sramAnodizedBlackMat
    );
    valveBody.position.set(0, -0.236, 0);
    valveGroup.add(valveBody);
    const valveTip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0016, 0.0020, 0.010, 12),
      sramChromeMat
    );
    valveTip.position.set(0, -0.216, 0);
    valveGroup.add(valveTip);
    wheelGroup.add(valveGroup);

    // 6.4 CNC Machined Scope Artech Hub
    const hubShell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, isFront ? 0.098 : 0.136, 32).rotateX(Math.PI / 2),
      sramAnodizedBlackMat
    );
    wheelGroup.add(hubShell);

    [-1, 1].forEach((flangeSide) => {
      const flangeZ = flangeSide * (isFront ? 0.028 : 0.032);
      const flange = new THREE.Mesh(
        new THREE.CylinderGeometry(0.028, 0.028, 0.005, 32).rotateX(Math.PI / 2),
        sramAnodizedBlackMat
      );
      flange.position.z = flangeZ;
      wheelGroup.add(flange);
    });

    // 6.5 Bladed Carbon Aero Spokes (Tangential 2-Cross Lacing)
    const spokeCount = isFront ? 21 : 24;
    const spokeRadiusInner = 0.026;
    const spokeRadiusOuter = 0.252;

    for (let s = 0; s < spokeCount; s++) {
      const side = s % 2 === 0 ? 1 : -1;
      const crossDir = s % 4 < 2 ? 1 : -1;
      const baseAngle = (s / spokeCount) * Math.PI * 2;
      const hubAngle = baseAngle + crossDir * 0.42;

      const pStart = new THREE.Vector3(
        Math.cos(hubAngle) * spokeRadiusInner,
        Math.sin(hubAngle) * spokeRadiusInner,
        side * (isFront ? 0.027 : 0.031)
      );
      const pEnd = new THREE.Vector3(
        Math.cos(baseAngle) * spokeRadiusOuter,
        Math.sin(baseAngle) * spokeRadiusOuter,
        side * 0.002
      );

      const spokeVec = new THREE.Vector3().subVectors(pEnd, pStart);
      const spokeLen = spokeVec.length();
      // Aero bladed carbon spoke (flat in XY plane, thin in Z)
      const spokeGeom = new THREE.BoxGeometry(0.0032, spokeLen, 0.0011);
      const spokeMesh = new THREE.Mesh(spokeGeom, satinCarbonMat);
      spokeMesh.position.copy(pStart).addScaledVector(spokeVec, 0.5);
      spokeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), spokeVec.clone().normalize());
      spokeMesh.castShadow = true;
      wheelGroup.add(spokeMesh);
    }

    // 6.6 SRAM Centerlock Paceline X Disc Brake Rotor (Left / -Z Non-Drive Side)
    // Official Spec: Front 160mm (R=0.080m), Rear 140mm (R=0.070m)
    const rotorRadius = isFront ? 0.080 : 0.070;
    const rotorZ = isFront ? -0.042 : -0.054;
    const rotorGroup = new THREE.Group();
    rotorGroup.position.z = rotorZ;

    // Stainless steel slotted braking track
    const brakeTrack = new THREE.Mesh(
      new THREE.RingGeometry(rotorRadius - 0.016, rotorRadius, 48),
      new THREE.MeshStandardMaterial({
        color: '#d8dee8',
        metalness: 0.92,
        roughness: 0.22,
        side: THREE.DoubleSide,
      })
    );
    rotorGroup.add(brakeTrack);

    // Black aluminum Paceline X Centerlock lockring + open 6-arm aero spider carrier
    const spiderRing = new THREE.Mesh(
      new THREE.RingGeometry(0.015, 0.028, 28),
      new THREE.MeshStandardMaterial({
        color: '#15171b',
        metalness: 0.82,
        roughness: 0.28,
        side: THREE.DoubleSide,
      })
    );
    rotorGroup.add(spiderRing);

    for (let arm = 0; arm < 6; arm++) {
      const a = (arm / 6) * Math.PI * 2;
      const strut = new THREE.Mesh(
        new THREE.BoxGeometry(0.0055, rotorRadius - 0.022, 0.0022),
        sramAnodizedBlackMat
      );
      strut.position.set(Math.cos(a) * (rotorRadius * 0.52), Math.sin(a) * (rotorRadius * 0.52), 0);
      strut.rotation.z = a - Math.PI / 3;
      rotorGroup.add(strut);
    }
    wheelGroup.add(rotorGroup);

    return wheelGroup;
  };

  const frontWheel = buildScopeArtechWheel(true);
  frontWheel.position.copy(toSteerLocal(BIKE_COORDS.frontAxle));
  steeringPivot.add(frontWheel);

  const rearWheel = buildScopeArtechWheel(false);
  rearWheel.position.copy(BIKE_COORDS.rearAxle);
  rootGroup.add(rearWheel);

  // SRAM RED Flat-Mount Hydraulic Disc Calipers (Front & Rear on -Z Left Side)
  const createSramRedCaliper = () => {
    const cal = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.032, 0.056, 0.028),
      new THREE.MeshStandardMaterial({ color: '#c4cbd6', metalness: 0.88, roughness: 0.22 })
    );
    cal.add(body);
    const boreCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.011, 0.030, 20).rotateX(Math.PI / 2),
      sramAnodizedBlackMat
    );
    boreCap.position.set(0.002, 0, 0);
    cal.add(boreCap);
    return cal;
  };

  const frontCaliper = createSramRedCaliper();
  frontCaliper.position.copy(toSteerLocal(new THREE.Vector3(0.518, 0.368, -0.042)));
  frontCaliper.rotation.z = -0.35;
  steeringPivot.add(frontCaliper);

  const rearCaliper = createSramRedCaliper();
  rearCaliper.position.set(-0.348, 0.348, -0.054);
  rearCaliper.rotation.z = 0.25;
  frameGroup.add(rearCaliper);

  // ============================================================================
  // 7. SRAM RED AXS E1 DRIVETRAIN (Crankset, Cassette, Derailleurs & 3D Chain)
  // ============================================================================

  // 7.1 SRAM XG-1290 E1 12-Speed Cassette (10-33T) attached to Rear Wheel (+Z Drive Side)
  const cassetteGroup = new THREE.Group();
  cassetteGroup.position.z = 0.038;
  rearWheel.add(cassetteGroup);

  const cogMatSilver = new THREE.MeshPhysicalMaterial({
    map: frameDecals.sramCassetteMap,
    transparent: true,
    alphaTest: 0.35,
    color: '#e2e8f2',
    metalness: 0.92,
    roughness: 0.18,
    clearcoat: 0.35,
    side: THREE.DoubleSide,
  });

  const cogMatBlack33T = new THREE.MeshPhysicalMaterial({
    map: frameDecals.sramCassetteMap,
    transparent: true,
    alphaTest: 0.35,
    color: '#22262e',
    metalness: 0.85,
    roughness: 0.25,
    side: THREE.DoubleSide,
  });

  for (let c = 0; c < 12; c++) {
    const t = c / 11; // 0 = 33T (innermost), 1 = 10T (outermost)
    const cogRadius = THREE.MathUtils.lerp(0.067, 0.022, t);
    const cogZ = t * 0.030;
    // Alpha-perforated X-Dome CNC cog plane so spokes and light shine right through the spider cutouts!
    const cogGeom = new THREE.PlaneGeometry(cogRadius * 2.0, cogRadius * 2.0);
    const cogMesh = new THREE.Mesh(cogGeom, c === 0 ? cogMatBlack33T : cogMatSilver);
    cogMesh.position.z = cogZ;
    cogMesh.rotation.z = c * 0.24;
    cogMesh.castShadow = true;
    cogMesh.receiveShadow = true;
    cassetteGroup.add(cogMesh);
  }

  // 7.2 SRAM RED AXS E1 Powermeter Crankset (48/35T) at BB (Matches cages.jpg & profil.png!)
  const cranksetGroup = new THREE.Group();
  cranksetGroup.name = 'SRAM_RED_Crankset';
  cranksetGroup.position.copy(BIKE_COORDS.bb);
  rootGroup.add(cranksetGroup);

  const chainringZ = 0.048;

  // Build a multi-layer 3D perforated SRAM RED E1 48/35T chainring stack using our high-res
  // alpha-cutout CNC chainring map so you see right through the spider cutouts + 3D depth!
  const chainringFaceMat = new THREE.MeshPhysicalMaterial({
    map: frameDecals.sramChainringMap,
    transparent: true,
    alphaTest: 0.35,
    metalness: 0.88,
    roughness: 0.18,
    clearcoat: 0.45,
    clearcoatRoughness: 0.15,
    envMapIntensity: 1.65,
    side: THREE.DoubleSide,
  });

  // Layer stack from z = chainringZ - 0.0040 to chainringZ + 0.0018 gives realistic 6mm 3D CNC plate thickness
  const numLayers = 6;
  for (let l = 0; l < numLayers; l++) {
    const lz = chainringZ - 0.0040 + (l / (numLayers - 1)) * 0.0058;
    const ringPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.198, 0.198), chainringFaceMat);
    ringPlane.position.z = lz;
    ringPlane.castShadow = true;
    ringPlane.receiveShadow = true;
    cranksetGroup.add(ringPlane);
  }

  // Central Quarq AXS Powermeter Spider Ring & Recessed DUB Spindle Bore (Open center!)
  const pmSpiderRing = new THREE.Mesh(
    new THREE.RingGeometry(0.017, 0.035, 36),
    sramAnodizedBlackMat
  );
  pmSpiderRing.position.z = chainringZ + 0.0022;
  cranksetGroup.add(pmSpiderRing);

  const dubSpindleTube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.016, 0.118, 28, 1, true).rotateX(Math.PI / 2),
    sramAnodizedBlackMat
  );
  cranksetGroup.add(dubSpindleTube);

  // Drive-Side (+Z, pointing forward-down at -9.5 deg like profil.png) & Non-Drive (-Z, +170.5 deg)
  // Sculpted Hollow Carbon Crank Arms (172.5mm)
  [
    { side: 1, angle: -0.165, zPos: 0.056 },
    { side: -1, angle: Math.PI - 0.165, zPos: -0.054 },
  ].forEach(({ side, angle, zPos }) => {
    const armHolder = new THREE.Group();
    armHolder.rotation.z = angle;
    cranksetGroup.add(armHolder);

    // Sculpted crank arm stations from rounded BB heel (-0.020) out to rounded pedal tip (0.180)
    const armStations = [
      { pos: new THREE.Vector3(-0.022, 0, zPos), chord: 0.032, width: 0.013, kamm: 0.0, power: 2.0, chordDir: new THREE.Vector3(0, 1, 0) },
      { pos: new THREE.Vector3(0.000, 0, zPos + side * 0.001), chord: 0.045, width: 0.015, kamm: 0.05, power: 2.2, chordDir: new THREE.Vector3(0, 1, 0) },
      { pos: new THREE.Vector3(0.045, 0, zPos + side * 0.003), chord: 0.039, width: 0.014, kamm: 0.05, power: 2.4, chordDir: new THREE.Vector3(0, 1, 0) },
      { pos: new THREE.Vector3(0.115, 0, zPos + side * 0.005), chord: 0.034, width: 0.013, kamm: 0.05, power: 2.4, chordDir: new THREE.Vector3(0, 1, 0) },
      { pos: new THREE.Vector3(0.164, 0, zPos + side * 0.006), chord: 0.031, width: 0.0125, kamm: 0.05, power: 2.2, chordDir: new THREE.Vector3(0, 1, 0) },
      { pos: new THREE.Vector3(0.181, 0, zPos + side * 0.006), chord: 0.021, width: 0.011, kamm: 0.0, power: 2.0, chordDir: new THREE.Vector3(0, 1, 0) },
    ];
    armHolder.add(createLoftedAeroMesh(armStations, 32, glossCarbonMat, true));

    // Recessed DUB Spindle Cap Ring at (0, 0)
    const dubCap = new THREE.Mesh(
      new THREE.RingGeometry(0.009, 0.0165, 28),
      new THREE.MeshStandardMaterial({ color: '#22262e', metalness: 0.85, roughness: 0.25, side: THREE.DoubleSide })
    );
    dubCap.position.set(0, 0, zPos + side * 0.0082);
    armHolder.add(dubCap);

    // SRAM "Red" + Silver Speed-Lines Graphic conformed to the outer face of the carbon crank arm
    const crankLogo = new THREE.Mesh(
      new THREE.PlaneGeometry(0.125, 0.028),
      new THREE.MeshStandardMaterial({
        map: frameDecals.sramRedCrankMap,
        transparent: true,
        alphaTest: 0.1,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        metalness: 0.85,
        roughness: 0.18,
        side: THREE.FrontSide,
      })
    );
    crankLogo.position.set(0.088, 0, zPos + side * 0.0115);
    crankLogo.rotation.y = side * -0.032;
    if (side === -1) {
      crankLogo.rotation.y = Math.PI + 0.032;
      crankLogo.rotation.z = Math.PI;
    }
    armHolder.add(crankLogo);

    // Flush Silver Machined Pedal Thread Insert at x = 0.165m (matches profil.png)
    const pedalEye = new THREE.Mesh(
      new THREE.RingGeometry(0.0052, 0.0096, 24),
      sramChromeMat
    );
    pedalEye.position.set(0.164, 0, zPos + side * 0.0126);
    if (side === -1) pedalEye.rotation.y = Math.PI;
    armHolder.add(pedalEye);
  });

  // 7.3 SRAM RED AXS Front Derailleur + AXS Battery (Matches cages.jpg!)
  const fdGroup = new THREE.Group();
  fdGroup.position.set(-0.036, 0.382, 0.044);
  frameGroup.add(fdGroup);

  // Sculpted Wireless Actuator Head
  const fdBody = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.026, 0.022), sramAnodizedBlackMat);
  fdBody.rotation.z = 0.18;
  fdGroup.add(fdBody);

  // Rear Clip-On AXS Battery
  const fdBatt = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.024, 0.016), glossCarbonMat);
  fdBatt.position.set(-0.024, 0.002, 0);
  fdBatt.rotation.z = 0.25;
  fdGroup.add(fdBatt);

  // Chrome Yaw Outer Guide Cage Plate (sits cleanly over the top chain run)
  const fdCage = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.011, 0.003), sramChromeMat);
  fdCage.position.set(0.018, -0.012, 0.011);
  fdCage.rotation.z = -0.22;
  fdGroup.add(fdCage);

  const axsLedMat = new THREE.MeshBasicMaterial({ color: '#00ff88' });
  const fdLed = new THREE.Mesh(new THREE.SphereGeometry(0.0018, 8, 8), axsLedMat);
  fdLed.position.set(-0.014, 0.006, 0.012);
  fdGroup.add(fdLed);

  // 7.4 SRAM RED AXS E1 Rear Derailleur + Skeletonized Magic Wheel Pulleys (Matches profil.png!)
  const rdGroup = new THREE.Group();
  rdGroup.position.set(BIKE_COORDS.rearAxle.x, BIKE_COORDS.rearAxle.y, 0.064);
  frameGroup.add(rdGroup);

  // UDH B-Knuckle Hanger Link
  const bKnuckle = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.014, 0.012), sramAnodizedBlackMat);
  bKnuckle.position.set(-0.010, -0.020, 0.002);
  bKnuckle.rotation.z = 1.15;
  rdGroup.add(bKnuckle);

  // Sculpted Silver & Carbon Parallelogram Body + Orbit Fluid Damper Clutch
  const rdBody = new THREE.Mesh(new THREE.BoxGeometry(0.050, 0.024, 0.022), sramAnodizedBlackMat);
  rdBody.position.set(-0.022, -0.042, 0.0);
  rdBody.rotation.z = 0.34;
  rdGroup.add(rdBody);

  const rdSilverFace = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.011, 0.003), sramChromeMat);
  rdSilverFace.position.set(-0.020, -0.040, 0.012);
  rdSilverFace.rotation.z = 0.34;
  rdGroup.add(rdSilverFace);

  const rdBattery = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.028, 0.016), glossCarbonMat);
  rdBattery.position.set(-0.048, -0.044, 0.0);
  rdBattery.rotation.z = 0.22;
  rdGroup.add(rdBattery);

  const rdLed = new THREE.Mesh(new THREE.SphereGeometry(0.0018, 8, 8), axsLedMat);
  rdLed.position.set(-0.038, -0.034, 0.012);
  rdGroup.add(rdLed);

  // Upper Guide Pulley (12T) & Lower Oversized Skeletonized Magic Wheel Pulley (14T)
  const upperPulleyPos = new THREE.Vector3(BIKE_COORDS.rearAxle.x + 0.004, BIKE_COORDS.rearAxle.y - 0.056, 0.052);
  const lowerPulleyPos = new THREE.Vector3(BIKE_COORDS.rearAxle.x + 0.032, BIKE_COORDS.rearAxle.y - 0.118, 0.052);

  const buildPulleyWheel = (radius, spokeCount) => {
    const pg = new THREE.Group();
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.68, radius, 24),
      new THREE.MeshStandardMaterial({ color: '#15171c', metalness: 0.75, roughness: 0.25, side: THREE.DoubleSide })
    );
    pg.add(rim);
    for (let s = 0; s < spokeCount; s++) {
      const a = (s / spokeCount) * Math.PI * 2;
      const spk = new THREE.Mesh(new THREE.BoxGeometry(0.0024, radius * 1.4, 0.002), sramAnodizedBlackMat);
      spk.rotation.z = a;
      pg.add(spk);
    }
    const bolt = new THREE.Mesh(new THREE.CircleGeometry(0.0045, 16), sramChromeMat);
    bolt.position.z = 0.0015;
    pg.add(bolt);
    return pg;
  };

  const upperPulley = buildPulleyWheel(0.020, 5);
  upperPulley.position.copy(upperPulleyPos);
  frameGroup.add(upperPulley);

  const lowerPulley = buildPulleyWheel(0.025, 5);
  lowerPulley.position.copy(lowerPulleyPos);
  frameGroup.add(lowerPulley);

  // Skeletonized Carbon Pulley Cage Plates
  [-0.005, 0.005].forEach((dz) => {
    const cageVec = new THREE.Vector3().subVectors(lowerPulleyPos, upperPulleyPos);
    const cagePlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.015, cageVec.length() + 0.022, 0.0025),
      glossCarbonMat
    );
    cagePlate.position.copy(upperPulleyPos).addScaledVector(cageVec, 0.5);
    cagePlate.position.z += dz;
    cagePlate.rotation.z = Math.atan2(cageVec.x, -cageVec.y);
    frameGroup.add(cagePlate);
  });

  // 7.5 SRAM RED Flattop 12-Speed Chain (Exact Tangent-Arc-Tangent-Arc Taut Loop + 112 Perforated Flattop Links!)
  const chainZ = 0.050;
  const chainLoopPts = [];

  // 1. Front 48T Chainring Arc: clockwise from top tangent (+88 deg) to bottom tangent (-88 deg)
  const rChainring = 0.0955;
  const frontArcSteps = 18;
  for (let i = 0; i <= frontArcSteps; i++) {
    const ang = THREE.MathUtils.lerp(THREE.MathUtils.degToRad(88), THREE.MathUtils.degToRad(-88), i / frontArcSteps);
    chainLoopPts.push(
      new THREE.Vector3(
        BIKE_COORDS.bb.x + Math.cos(ang) * rChainring,
        BIKE_COORDS.bb.y + Math.sin(ang) * rChainring,
        chainZ
      )
    );
  }

  // 2. Taut Lower Span: collinear straight line from bottom of 48T chainring to bottom of Lower Magic Wheel Pulley
  const pLowerStart = chainLoopPts[chainLoopPts.length - 1].clone();
  const pLowerEnd = new THREE.Vector3(lowerPulleyPos.x, lowerPulleyPos.y - 0.024, chainZ);
  for (let i = 1; i < 10; i++) {
    chainLoopPts.push(new THREE.Vector3().lerpVectors(pLowerStart, pLowerEnd, i / 10));
  }

  // 3. Lower Magic Wheel Pulley Arc: clockwise around the bottom & rear of lower pulley
  const rLowerP = 0.024;
  const lowPulleyAngles = [-90, -135, -180, 140];
  lowPulleyAngles.forEach((deg) => {
    const a = THREE.MathUtils.degToRad(deg);
    chainLoopPts.push(
      new THREE.Vector3(lowerPulleyPos.x + Math.cos(a) * rLowerP, lowerPulleyPos.y + Math.sin(a) * rLowerP, chainZ)
    );
  });

  // 4. Upper Guide Pulley S-Wrap: counter-clockwise around the front of upper pulley
  const rUpperP = 0.020;
  const upPulleyAngles = [-35, 15, 75, 130];
  upPulleyAngles.forEach((deg) => {
    const a = THREE.MathUtils.degToRad(deg);
    chainLoopPts.push(
      new THREE.Vector3(upperPulleyPos.x + Math.cos(a) * rUpperP, upperPulleyPos.y + Math.sin(a) * rUpperP, chainZ)
    );
  });

  // 5. Rear Cassette Cog Arc: clockwise around the back & top of the active cog (R = 0.035m)
  const rCog = 0.035;
  const cogAngles = [-140, -175, 145, 115, 88];
  cogAngles.forEach((deg) => {
    const a = THREE.MathUtils.degToRad(deg);
    chainLoopPts.push(
      new THREE.Vector3(
        BIKE_COORDS.rearAxle.x + Math.cos(a) * rCog,
        BIKE_COORDS.rearAxle.y + Math.sin(a) * rCog,
        chainZ
      )
    );
  });

  // 6. Taut Upper Span: 100% collinear straight line from top of cassette cog to top of 48T chainring!
  const pUpperStart = chainLoopPts[chainLoopPts.length - 1].clone();
  const pUpperEnd = chainLoopPts[0].clone();
  for (let i = 1; i < 12; i++) {
    chainLoopPts.push(new THREE.Vector3().lerpVectors(pUpperStart, pUpperEnd, i / 12));
  }

  const chainCurve = new THREE.CatmullRomCurve3(chainLoopPts, true, 'centripetal', 0.15);

  // Build authentic SRAM RED Flattop link geometry with flat top edge, twin bottom roller lobes, and hollow pin cutouts!
  const linkShape = new THREE.Shape();
  const lw = 0.0056; // half length
  const lh = 0.0034; // half height
  // Flat top edge (signature SRAM Flattop profile!)
  linkShape.moveTo(-lw, lh);
  linkShape.lineTo(lw, lh);
  // Right rounded roller lobe
  linkShape.absarc(lw * 0.62, 0, lh, Math.PI * 0.5, -Math.PI * 0.5, true);
  // Recessed waist under the middle of the link
  linkShape.quadraticCurveTo(0, -lh * 0.45, -lw * 0.62, -lh);
  // Left rounded roller lobe
  linkShape.absarc(-lw * 0.62, 0, lh, -Math.PI * 0.5, Math.PI * 0.5, true);

  // Two hollow pin/weight-relief holes per link
  [-lw * 0.58, lw * 0.58].forEach((hx) => {
    const hole = new THREE.Path();
    hole.absarc(hx, 0, 0.0012, 0, Math.PI * 2, false);
    linkShape.holes.push(hole);
  });

  const linkGeom = new THREE.ExtrudeGeometry(linkShape, {
    depth: 0.0052,
    bevelEnabled: false,
    curveSegments: 8,
  });
  linkGeom.center();

  const linkCount = 114;
  const chainInstanced = new THREE.InstancedMesh(linkGeom, sramChromeMat, linkCount);
  chainInstanced.castShadow = true;
  rootGroup.add(chainInstanced);

  const dummyLink = new THREE.Object3D();
  const updateChainLinks = (phaseOffset = 0) => {
    for (let i = 0; i < linkCount; i++) {
      const u = ((i / linkCount + phaseOffset) % 1 + 1) % 1;
      const pt = chainCurve.getPointAt(u);
      const tan = chainCurve.getTangentAt(u);
      dummyLink.position.copy(pt);
      // Orient flat top edge outward along the loop normal
      dummyLink.rotation.set(0, 0, Math.atan2(tan.y, tan.x) + Math.PI);
      const isOuter = i % 2 === 0;
      dummyLink.scale.set(1.0, isOuter ? 1.04 : 0.90, isOuter ? 1.12 : 0.82);
      dummyLink.updateMatrix();
      chainInstanced.setMatrixAt(i, dummyLink.matrix);
    }
    chainInstanced.instanceMatrix.needsUpdate = true;
  };
  updateChainLinks(0);

  // ============================================================================
  // 8. ANIMATION & CONFIGURATION CONTROLLERS
  // ============================================================================
  let chainPhase = 0;

  const updateMechanicalAnimation = (dt, speedKmh) => {
    if (speedKmh <= 0.01) return;
    const speedMs = speedKmh / 3.6;
    const wheelOmega = speedMs / BIKE_COORDS.wheelRadius; // rad/s

    // Rotate wheels clockwise when moving forward (+X) -> negative Z rotation
    frontWheel.rotation.z -= wheelOmega * dt;
    rearWheel.rotation.z -= wheelOmega * dt;

    // Crankset rotates at ~90 RPM scaled by speed
    const crankOmega = wheelOmega * 0.36;
    cranksetGroup.rotation.z -= crankOmega * dt;

    // Pulleys & 3D Flattop chain travel along the closed curve
    upperPulley.rotation.z -= wheelOmega * 1.8 * dt;
    lowerPulley.rotation.z += wheelOmega * 1.5 * dt;
    chainPhase = (chainPhase + dt * speedMs * 0.14) % 1;
    updateChainLinks(chainPhase);
  };

  const setHydrationMode = (mode) => {
    // 'cages' | 'bottles' | 'stripped'
    if (mode === 'cages') {
      cagesGroup.visible = true;
      bottlesGroup.visible = false;
    } else if (mode === 'bottles') {
      cagesGroup.visible = true;
      bottlesGroup.visible = true;
    } else {
      cagesGroup.visible = false;
      bottlesGroup.visible = false;
    }
  };

  // True 72.7 deg steering axis rotation
  const steerAxis = new THREE.Vector3().subVectors(BIKE_COORDS.headTop, BIKE_COORDS.headBot).normalize();
  const setSteeringAngle = (deg) => {
    steeringPivot.setRotationFromAxisAngle(steerAxis, THREE.MathUtils.degToRad(deg));
  };

  const setSparkleIntensity = (factor) => {
    // factor in [0 .. 1.5]
    const s = 0.42 * factor;
    auroraCharcoalMat.normalScale.set(s, s);
    auroraCharcoalMat.iridescence = Math.min(1.0, 0.48 * factor);
  };

  // Interactive 3D World Hotspots for Museum Annotations
  const hotspots = [
    {
      id: '01',
      tag: 'AERO ARCHITECTURE',
      title: 'Flow-Optimized Speed Sniffer Headtube',
      desc: 'Extended forward volume and sculpted hourglass waist reduce frontal pressure drag while housing CeramicSpeed SLT maintenance-free bearings.',
      pos: new THREE.Vector3(0.445, 0.755, 0.025),
      camTarget: new THREE.Vector3(0.38, 0.76, 0.0),
      camPos: new THREE.Vector3(0.75, 0.88, 0.55),
    },
    {
      id: '02',
      tag: 'INTEGRATED COCKPIT',
      title: 'ATTEN CHB-01 Carbon Aero Cockpit',
      desc: 'One-piece wind-honed carbon wing bar and stem with internal cable routing, out-front computer mount, and Ciclovation Tornado Gloss tape.',
      pos: new THREE.Vector3(0.515, 0.868, 0.08),
      camTarget: new THREE.Vector3(0.46, 0.84, 0.0),
      camPos: new THREE.Vector3(0.22, 1.06, 0.52),
    },
    {
      id: '03',
      tag: 'WHEEL-FORK SYNERGY',
      title: 'Wider, Deeper, Faster Fork Design',
      desc: 'Wide-stance deep-chord fork blades engineered in tandem with the 30c tire profile to accelerate air cleanly through the crown slot.',
      pos: new THREE.Vector3(0.512, 0.515, 0.055),
      camTarget: new THREE.Vector3(0.52, 0.48, 0.0),
      camPos: new THREE.Vector3(0.88, 0.56, 0.68),
    },
    {
      id: '04',
      tag: 'BIOMIMETIC WHEELSET',
      title: 'ATTEN × Scope Artech 6.A+ & Vittoria 30c',
      desc: '65mm carbon rims featuring Aeroscale fish-scale surface topology to stabilize boundary-layer crosswinds, shod with Vittoria Corsa Pro TLR 30c cotton tan tires.',
      pos: new THREE.Vector3(0.845, 0.385, 0.02),
      camTarget: new THREE.Vector3(0.60, 0.35, 0.0),
      camPos: new THREE.Vector3(0.68, 0.40, 0.82),
    },
    {
      id: '05',
      tag: 'SYSTEM INTEGRATION',
      title: 'ATTEN Integrated Aero Bottle Cages',
      desc: 'Custom-molded carbon shrouds on both downtube and seattube shield bidons within the Kamm-tail slipstream and smooth airflow into the rear triangle.',
      pos: new THREE.Vector3(0.145, 0.465, 0.03),
      camTarget: new THREE.Vector3(0.08, 0.45, 0.0),
      camPos: new THREE.Vector3(0.18, 0.54, 0.68),
    },
    {
      id: '06',
      tag: 'DRIVETRAIN & POWER',
      title: 'SRAM RED AXS E1 48/35T Powermeter',
      desc: 'Hollow carbon crank arms paired with an integrated Quarq powermeter spider, CeramicSpeed Coated T47 DUB bottom bracket, and Flattop 12-speed chain.',
      pos: new THREE.Vector3(0.025, 0.263, 0.068),
      camTarget: new THREE.Vector3(-0.08, 0.29, 0.04),
      camPos: new THREE.Vector3(-0.05, 0.34, 0.72),
    },
    {
      id: '07',
      tag: 'REAR TRIANGLE',
      title: 'Horizontal Dropped Seatstays',
      desc: 'Inspired by the Electron Pro TKO track bike and E119 tri superbike, the seatstays exit horizontally before angling sharply to minimize frontal wake.',
      pos: new THREE.Vector3(-0.200, 0.566, 0.050),
      camTarget: new THREE.Vector3(-0.22, 0.50, 0.0),
      camPos: new THREE.Vector3(-0.55, 0.62, 0.72),
    },
  ];

  // Ensure all structural and mechanical components cast and receive crisp 4K shadows
  rootGroup.traverse((child) => {
    if (child.isMesh && !child.material?.polygonOffset) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return {
    rootGroup,
    materials: {
      auroraCharcoalMat,
      glossCarbonMat,
      satinCarbonMat,
    },
    hotspots,
    updateMechanicalAnimation,
    setHydrationMode,
    setSteeringAngle,
    setSparkleIntensity,
  };
}
