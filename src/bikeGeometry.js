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
  // 1. CURATED PBR MATERIALS & REAL-TIME CFD SURFACE PRESSURE (Cp) SHADER HOOK
  // ============================================================================
  const aeroCpUniforms = {
    uSurfaceCpMix: { value: 0.0 },
    uWindYawRad: { value: 0.0 },
  };

  // Zero-overhead shader hook: when uSurfaceCpMix > 0, overlays real-time 3D aerodynamic
  // surface pressure coefficient (Cp) + isobar contours across frame, fork, cockpit & wheelset!
  const attachSurfaceCpShader = (mat) => {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSurfaceCpMix = aeroCpUniforms.uSurfaceCpMix;
      shader.uniforms.uWindYawRad = aeroCpUniforms.uWindYawRad;

      shader.vertexShader =
        `varying vec3 vAeroWorldNormal;\nvarying vec3 vAeroWorldPos;\n` +
        shader.vertexShader.replace(
          '#include <worldpos_vertex>',
          /* glsl */ `
          #include <worldpos_vertex>
          vAeroWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vAeroWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
          `
        );

      shader.fragmentShader =
        `uniform float uSurfaceCpMix;\nuniform float uWindYawRad;\nvarying vec3 vAeroWorldNormal;\nvarying vec3 vAeroWorldPos;\n` +
        shader.fragmentShader.replace(
          '#include <dithering_fragment>',
          /* glsl */ `
          if (uSurfaceCpMix > 0.001) {
            vec3 nw = normalize(vAeroWorldNormal);
            vec3 windUpwind = normalize(vec3(cos(uWindYawRad), 0.0, sin(uWindYawRad)));
            float windAlign = dot(nw, windUpwind);
            float flankSuction = smoothstep(0.32, 0.96, abs(nw.z)) * (1.0 - abs(windAlign * 1.12));
            float throatBoost = exp(-length(vAeroWorldPos - vec3(0.46, 0.65, 0.0)) * 7.5) * 0.55
                              + exp(-length(vAeroWorldPos - vec3(-0.08, 0.42, 0.0)) * 7.5) * 0.45;
            float cpVal = clamp(windAlign * 1.48 - flankSuction * 0.94 - throatBoost, -1.0, 1.0);
            float tCp = clamp(cpVal * 0.5 + 0.5, 0.0, 1.0);
            vec3 c0 = vec3(0.05, 0.22, 0.96);
            vec3 c1 = vec3(0.00, 0.85, 0.98);
            vec3 c2 = vec3(0.08, 0.90, 0.45);
            vec3 c3 = vec3(1.00, 0.78, 0.05);
            vec3 c4 = vec3(0.98, 0.12, 0.16);
            vec3 cpColor = tCp < 0.25 ? mix(c0, c1, tCp * 4.0)
                         : tCp < 0.50 ? mix(c1, c2, (tCp - 0.25) * 4.0)
                         : tCp < 0.75 ? mix(c2, c3, (tCp - 0.50) * 4.0)
                         : mix(c3, c4, (tCp - 0.75) * 4.0);
            float luma = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
            vec3 shadedCp = cpColor * (0.50 + 0.78 * smoothstep(0.0, 0.65, luma)) + gl_FragColor.rgb * 0.26;
            float isobar = smoothstep(0.93, 0.995, abs(sin(cpVal * 12.566)));
            shadedCp = mix(shadedCp, vec3(1.0), isobar * 0.16);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, shadedCp, uSurfaceCpMix * 0.86);
          }
          #include <dithering_fragment>
          `
        );
    };
    return mat;
  };

  // A. "Aurora Charcoal" Metallic Sparkle Paint (Front/Upper Frame & Fork Crown)
  const auroraCharcoalMat = attachSurfaceCpShader(
    new THREE.MeshPhysicalMaterial({
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
    })
  );

  // B. Deep Gloss Piano Black Carbon (Rear/Lower Frame, Seatpost, Lower Fork)
  const glossCarbonMat = attachSurfaceCpShader(
    new THREE.MeshPhysicalMaterial({
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
    })
  );

  // C. Satin Raw Unidirectional Carbon (ATTEN Cockpit, Aero Cages, Saddle Shell)
  const satinCarbonMat = attachSurfaceCpShader(
    new THREE.MeshPhysicalMaterial({
      name: 'SatinUDCarbon',
      color: new THREE.Color('#14161b'),
      normalMap: carbonMaps.normalMap,
      normalScale: new THREE.Vector2(0.14, 0.14),
      metalness: 0.22,
      roughness: 0.34,
      clearcoat: 0.35,
      clearcoatRoughness: 0.25,
      envMapIntensity: 1.15,
    })
  );

  // D. View-Dependent Dichroic Holographic Foil Decal Material (ARGON 18 Downtube, Top Tube Prism, Headtube & Speed Stripes)
  // Shifts hue dynamically across cyan, champagne-gold, rose-pink, and violet as the camera orbits!
  const makeHoloDecalMat = (texture) => {
    const mat = new THREE.MeshPhysicalMaterial({
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
      envMapIntensity: 1.85,
      side: THREE.FrontSide,
    });
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        /* glsl */ `
        #include <map_fragment>
        {
          vec3 viewDir = normalize(vViewPosition);
          vec3 nDir = normalize(vNormal);
          float ndv = clamp(abs(dot(nDir, viewDir)), 0.0, 1.0);
          float phase = (1.0 - ndv) * 4.5 + viewDir.x * 2.4 + viewDir.y * 1.8 + nDir.x * 1.5;
          vec3 prismShift = 0.5 + 0.5 * cos(phase + vec3(0.0, 2.094, 4.188));
          vec3 holoTint = mix(vec3(0.64, 0.94, 1.0), vec3(1.0, 0.78, 0.92), prismShift.r);
          holoTint = mix(holoTint, vec3(1.0, 0.95, 0.76), prismShift.g * 0.55);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * (0.76 + 0.52 * holoTint), 0.62);
        }
        `
      );
    };
    return mat;
  };

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

  // J. SRAM RED AXS E1 Sculpted Carbon LFRT Brake Lever Blade (Right & Left un-mirrored maps!)
  const sramLeverBladeMat = new THREE.MeshPhysicalMaterial({
    name: 'SRAMRedE1CarbonBladeRight',
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

  const sramLeverBladeMatLeft = new THREE.MeshPhysicalMaterial({
    name: 'SRAMRedE1CarbonBladeLeft',
    color: new THREE.Color('#ffffff'),
    map: frameDecals.sramLeverBladeMapLeft,
    normalMap: carbonMaps.normalMap,
    normalScale: new THREE.Vector2(0.06, 0.06),
    metalness: 0.24,
    roughness: 0.14,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    reflectivity: 1.0,
    envMapIntensity: 1.45,
  });

  // Helper for crisp white/silver technical micro-decals
  const makeMicroDecalMat = (texture) =>
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.10,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      side: THREE.FrontSide,
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
      pos: new THREE.Vector3(0.433, 0.686, 0),
      chord: 0.084,
      width: 0.050,
      kamm: 0.26,
      power: 2.15,
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

  // Conformed Iridescent 6-Node Molecular Emblem on the front nose of the Head Tube (matches 4_front.jpg & 9_tire_clearance.jpg!)
  // At y = 0.738, headtube center is x = 0.4177, chord = 0.0867, chordDir = (0.955, 0.297, 0),
  // so the leading nose surface is at x ≈ 0.459, y ≈ 0.750. We curve the badge around the nose radius so it sits 100% flush outside the mesh!
  {
    const htBadgeGeom = new THREE.PlaneGeometry(0.025, 0.026, 16, 12);
    const bPos = htBadgeGeom.attributes.position;
    for (let i = 0; i < bPos.count; i++) {
      const px = bPos.getX(i); // horizontal across nose (-Z to +Z)
      // Curve gently backward in local -Z as |px| increases to hug the 38mm headtube nose
      bPos.setZ(i, -(px * px) * 14.0);
    }
    htBadgeGeom.computeVertexNormals();
    const htBadgeMesh = new THREE.Mesh(htBadgeGeom, makeHoloDecalMat(frameDecals.headtubeLogoMap));
    htBadgeMesh.position.set(0.4635, 0.748, 0);
    // Rotate +90 deg around Y (so normal points +X forward), then tilt backward around world Z by +0.368 rad to match the flaring lower-waist nose!
    htBadgeMesh.rotation.order = 'ZYX';
    htBadgeMesh.rotation.set(0, Math.PI / 2, 0.368);
    frameGroup.add(htBadgeMesh);
  }

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

  // Skin-Tight 3D Conformed Top Tube Wrap Decal ("NITR⊐GEN PR⊐" on top ridge + Holographic Prism Band wrapping top & sides!)
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

  // Top Tube Front Micro-Motto "RIDE YOUR ELEMENT" right behind the stem/spacer stack (visible in 3_cockpit.jpg!)
  const rideElementMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.056, 0.007).rotateX(-Math.PI / 2),
    makeMicroDecalMat(frameDecals.rideElementMap)
  );
  rideElementMesh.position.set(0.305, 0.8085, 0);
  rideElementMesh.rotation.z = 0.085;
  frameGroup.add(rideElementMesh);

  // Integrated Seatpost Wedge Clamp Cover ("6.5 Nm" + recessed angled hex bolt port in front of seatpost, matches 5_logo.jpg!)
  const clampCoverGeom = new THREE.BoxGeometry(0.024, 0.0024, 0.017);
  const clampCover = new THREE.Mesh(clampCoverGeom, satinCarbonMat);
  clampCover.position.set(-0.104, 0.7675, 0);
  clampCover.rotation.z = -0.11;
  frameGroup.add(clampCover);

  const clampTorqueDecal = new THREE.Mesh(
    new THREE.PlaneGeometry(0.022, 0.011).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({
      map: frameDecals.wedgeTorqueMap,
      roughness: 0.45,
      metalness: 0.35,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    })
  );
  clampTorqueDecal.position.set(-0.104, 0.7689, 0);
  clampTorqueDecal.rotation.z = -0.11;
  frameGroup.add(clampTorqueDecal);

  // 2.3 Deep Aero Kamm-Tail Down Tube + Wheel Cutout Throat + Oversized T47 BB Shell
  // Colinear main trajectory from (0.048, 0.326) -> (0.282, 0.602) -> (0.338, 0.668) with 66mm chord
  // gives a generous 26.4mm aerodynamic clearance around the 700x30c front tire even in 3/4 views!
  const dtChordVec = new THREE.Vector3(0.7628, -0.6467, 0);
  const downTubeUpperStations = [
    {
      pos: new THREE.Vector3(0.412, 0.734, 0),
      chord: 0.078,
      width: 0.038,
      kamm: 0.28,
      power: 2.25,
      chordDir: new THREE.Vector3(0.920, -0.392, 0),
    },
    {
      pos: new THREE.Vector3(0.376, 0.708, 0),
      chord: 0.072,
      width: 0.045,
      kamm: 0.32,
      power: 2.45,
      chordDir: new THREE.Vector3(0.840, -0.542, 0),
    },
    {
      pos: new THREE.Vector3(0.338, 0.668, 0),
      chord: 0.066,
      width: 0.050,
      kamm: 0.35,
      power: 2.60,
      chordDir: dtChordVec,
    },
    {
      pos: new THREE.Vector3(0.282, 0.602, 0),
      chord: 0.066,
      width: 0.052,
      kamm: 0.36,
      power: 2.65,
      chordDir: dtChordVec,
    },
  ];
  frameGroup.add(createLoftedAeroMesh(downTubeUpperStations, 44, auroraCharcoalMat, false));

  // Main Aero Foil Down Tube (Gloss Piano Black Carbon, colinear continuation from (0.282, 0.602))
  const downTubeMainStations = [
    {
      pos: new THREE.Vector3(0.282, 0.602, 0),
      chord: 0.066,
      width: 0.052,
      kamm: 0.36,
      power: 2.65,
      chordDir: dtChordVec,
    },
    {
      pos: new THREE.Vector3(0.180, 0.482, 0),
      chord: 0.066,
      width: 0.052,
      kamm: 0.36,
      power: 2.65,
      chordDir: dtChordVec,
    },
    {
      pos: new THREE.Vector3(0.048, 0.326, 0),
      chord: 0.068,
      width: 0.054,
      kamm: 0.36,
      power: 2.65,
      chordDir: dtChordVec,
    },
    {
      // Flare into oversized T47 Bottom Bracket below the ARGON 18 logo
      pos: new THREE.Vector3(0.012, 0.283, 0),
      chord: 0.088,
      width: 0.072,
      kamm: 0.24,
      power: 2.4,
      chordDir: dtChordVec,
    },
    {
      pos: new THREE.Vector3(-0.012, 0.254, 0),
      chord: 0.096,
      width: 0.082,
      kamm: 0.18,
      power: 2.2,
      chordDir: dtChordVec,
    },
  ];
  frameGroup.add(createLoftedAeroMesh(downTubeMainStations, 44, glossCarbonMat, false));

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
  const dtAngle = Math.atan2(0.602 - 0.326, 0.282 - 0.048); // ~49.71 deg
  const dtLogoMat = makeHoloDecalMat(frameDecals.downtubeLogoMap);
  [-1, 1].forEach((side) => {
    const decalGeom = new THREE.PlaneGeometry(0.348, 0.052, 32, 16);
    const posAttr = decalGeom.attributes.position;
    const exp = 2.65;
    const kamm = 0.36;
    for (let i = 0; i < posAttr.count; i++) {
      const py = posAttr.getY(i);
      const sCos = THREE.MathUtils.clamp(-py / 0.033, -0.92, 0.92);
      const sSin = Math.pow(Math.max(0.05, 1.0 - Math.pow(Math.abs(sCos), exp)), 1 / exp);
      const widthTaper = sCos < 0 ? 1.0 - Math.abs(sCos) * kamm * 0.24 : 1.0;
      const exactSurfaceZ = 0.026 * sSin * widthTaper;
      posAttr.setZ(i, exactSurfaceZ + 0.0012);
    }
    decalGeom.computeVertexNormals();

    const logoPlane = new THREE.Mesh(decalGeom, dtLogoMat);
    logoPlane.position.set(0.193, 0.497, 0);
    if (side === 1) {
      logoPlane.rotation.z = dtAngle;
    } else {
      logoPlane.rotation.y = Math.PI;
      logoPlane.rotation.z = -dtAngle;
    }
    frameGroup.add(logoPlane);
  });

  // Upper Downtube Kamm-Tail Spine Physics Formula Decal: P_acc = (m_c + m_b + I_w/R_w^2) v dv/dt (visible in 3_cockpit.jpg!)
  {
    const physPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.068, 0.017).rotateX(-Math.PI / 2),
      makeMicroDecalMat(frameDecals.physicsFormulaMap)
    );
    // Placed flush on the upper Kamm-tail flat spine of the downtube above the bottle cage
    physPlane.position.set(0.2448, 0.6064, 0);
    physPlane.rotation.z = dtAngle;
    frameGroup.add(physPlane);
  }

  // 2.4 Wheel-Hugging Aero Seat Tube
  const seatTubeStations = [];
  const numStSteps = 18;
  for (let i = 0; i <= numStSteps; i++) {
    const t = i / numStSteps;
    const y = THREE.MathUtils.lerp(0.263, 0.761, t);
    const baseLineX = -(y - 0.263) * Math.tan(THREE.MathUtils.degToRad(16.5));

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

  // Rear Seat Tube UCI Certification & Size "M" Badge below the top tube junction (visible in 1_profil.png & 2_34.png!)
  {
    const uciPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.015, 0.030),
      makeMicroDecalMat(frameDecals.uciSeatTubeMap)
    );
    uciPlane.position.set(-0.1445, 0.686, 0);
    uciPlane.rotation.order = 'ZYX';
    uciPlane.rotation.set(0, -Math.PI / 2, -THREE.MathUtils.degToRad(16.5));
    frameGroup.add(uciPlane);
  }

  // 2.5 Signature Horizontal Dropped Seatstays (Single Continuous Monocoque Loft per Side!)
  [-1, 1].forEach((side) => {
    const seatstayStations = [
      {
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
        pos: new THREE.Vector3(-0.180, 0.566, side * 0.045),
        chord: 0.028,
        width: 0.014,
        kamm: 0.20,
        power: 2.2,
        chordDir: new THREE.Vector3(-0.18, 0.98, 0),
      },
      {
        pos: new THREE.Vector3(-0.198, 0.562, side * 0.048),
        chord: 0.029,
        width: 0.014,
        kamm: 0.20,
        power: 2.2,
        chordDir: new THREE.Vector3(-0.45, 0.89, 0),
      },
      {
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
        pos: new THREE.Vector3(-0.402, 0.344, side * 0.070),
        chord: 0.020,
        width: 0.012,
        kamm: 0.15,
        power: 2.1,
        chordDir: new THREE.Vector3(-0.72, 0.69, 0),
      },
    ];
    frameGroup.add(createLoftedAeroMesh(seatstayStations, 32, glossCarbonMat, true));

    // 6-Bar HORIZONTAL Iridescent Speed Stripes right below the dropped seatstay knee (matches crop_rd.png 1:1!)
    // Sheared in X by +0.92 * py so the bars remain 100% HORIZONTAL in world space while aligning with the 47 deg stay!
    const stayStripeGeom = new THREE.PlaneGeometry(0.024, 0.032, 4, 8);
    const ssPos = stayStripeGeom.attributes.position;
    for (let i = 0; i < ssPos.count; i++) {
      const px = ssPos.getX(i);
      const py = ssPos.getY(i);
      ssPos.setX(i, px + side * py * 0.90);
    }
    stayStripeGeom.computeVertexNormals();
    const stayStripe = new THREE.Mesh(stayStripeGeom, makeHoloDecalMat(frameDecals.aeroStripesMap));
    stayStripe.position.set(-0.236, 0.524, side * 0.0612);
    stayStripe.rotation.y = side === 1 ? -0.11 : Math.PI + 0.11;
    // rotation.z = 0 so the holographic stripes are 100% HORIZONTAL in world space!
    frameGroup.add(stayStripe);
  });

  // 2.6 Tall Box-Section Chainstays + Rear Dropouts + Inner Canadian Heritage Badge (matches 8_cages.jpg!)
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

  // Inner Drive-Side Chainstay Canadian Maple Leaf "ENGINEERED WITH PURPOSE / DESIGNED WITH PASSION / IN CANADA" Badge (visible in 8_cages.jpg!)
  {
    const canBadge = new THREE.Mesh(
      new THREE.PlaneGeometry(0.064, 0.016),
      makeMicroDecalMat(frameDecals.chainstayHeritageMap)
    );
    canBadge.position.set(-0.185, 0.290, -0.041);
    canBadge.rotation.y = 0.11;
    canBadge.rotation.z = -0.21;
    frameGroup.add(canBadge);
  }

  // Molded Ribbed Matte-Black Elastomer Chainstay Protector along the top ridge of the +Z Drive-Side Chainstay (matches crop_rd.png & 8_cages.jpg!)
  {
    const csProtectorMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#111317'),
      roughness: 0.72,
      metalness: 0.04,
      clearcoat: 0.08,
    });
    const csProtStations = [
      { pos: new THREE.Vector3(-0.095, 0.293, 0.0445), chord: 0.0048, width: 0.0165, kamm: 0.1, power: 2.4, chordDir: new THREE.Vector3(0.22, 0.975, 0) },
      { pos: new THREE.Vector3(-0.225, 0.320, 0.0565), chord: 0.0052, width: 0.0150, kamm: 0.1, power: 2.4, chordDir: new THREE.Vector3(0.22, 0.975, 0) },
      { pos: new THREE.Vector3(-0.355, 0.343, 0.0655), chord: 0.0044, width: 0.0130, kamm: 0.1, power: 2.3, chordDir: new THREE.Vector3(0.22, 0.975, 0) },
    ];
    frameGroup.add(createLoftedAeroMesh(csProtStations, 20, csProtectorMat, true));

    // 10 transverse anti-chain-slap elastomer damping ribs along the top spine
    for (let r = 0; r < 10; r++) {
      const t = (r + 0.5) / 10;
      const rx = THREE.MathUtils.lerp(-0.110, -0.340, t);
      const ry = THREE.MathUtils.lerp(0.296, 0.341, t) + 0.0022;
      const rz = THREE.MathUtils.lerp(0.046, 0.064, t);
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.0045, 0.0024, 0.0135), csProtectorMat);
      rib.position.set(rx, ry, rz);
      rib.rotation.z = -0.195;
      rib.rotation.y = -0.075;
      frameGroup.add(rib);
    }
  }

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
  // - Local +Y is from bottom retention foot (-0.068) to upper shroud (+0.068)
  // - Local +X is outward from the frame tube into the bottle cavity (0 -> +0.076)
  const cageCompositeMat = attachSurfaceCpShader(satinCarbonMat.clone());
  cageCompositeMat.roughness = 0.52;
  cageCompositeMat.clearcoat = 0.08;

  const createAttenAeroCage = (isDowntube) => {
    const cg = new THREE.Group();

    // 1. Deep Kamm-Tail Composite Aero Shroud Spine (hugs the frame tube with zero gap, matches 6_bottle_feature.jpg & 8_cages.jpg)
    const spineStations = [
      { pos: new THREE.Vector3(0.005, -0.068, 0), chord: 0.013, width: 0.024, kamm: 0.18, power: 2.3, chordDir: new THREE.Vector3(1, 0, 0) },
      { pos: new THREE.Vector3(0.009, -0.025, 0), chord: 0.020, width: 0.032, kamm: 0.16, power: 2.4, chordDir: new THREE.Vector3(1, 0, 0) },
      { pos: new THREE.Vector3(0.010, 0.035, 0), chord: 0.022, width: 0.034, kamm: 0.16, power: 2.4, chordDir: new THREE.Vector3(1, 0, 0) },
      { pos: new THREE.Vector3(0.006, 0.068, 0), chord: 0.011, width: 0.022, kamm: 0.18, power: 2.2, chordDir: new THREE.Vector3(1, 0, 0) },
    ];
    cg.add(createLoftedAeroMesh(spineStations, 28, cageCompositeMat, true));

    // Internal horizontal structural ribs & recessed silver M5 mounting bolts inside the spine channel (6_bottle_feature.jpg)
    [-0.042, -0.014, 0.014, 0.042].forEach((ry) => {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.0022, 0.026), sramAnodizedBlackMat);
      rib.position.set(0.018, ry, 0);
      cg.add(rib);
    });
    [-0.028, 0.028].forEach((by) => {
      const boltHead = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0042, 0.0042, 0.003, 16).rotateZ(Math.PI / 2),
        sramChromeMat
      );
      boltHead.position.set(0.0185, by, 0);
      cg.add(boltHead);
    });

    // 2. Bottom L-Shaped Bottle Retention Foot & Upward Lip (at y = -0.066, protruding in +X)
    const footBase = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.0055, 0.020), cageCompositeMat);
    footBase.position.set(0.016, -0.066, 0);
    footBase.rotation.z = 0.08;
    cg.add(footBase);

    const footHook = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.010, 0.016), cageCompositeMat);
    footHook.position.set(0.029, -0.061, 0);
    footHook.rotation.z = -0.22;
    cg.add(footHook);

    // 3. Sculpted Wide Flat-Walled Composite Wrap-Around Retention Wing (Matches 8_cages.jpg & crop_crank.png!)
    // Instead of thin wire tubes, the ATTEN aero cage features a single wide (~17mm tall), flat-walled composite
    // retention band that sweeps out from the upper spine so its top/bottom edges sit HORIZONTAL in world space!
    const wingDropY = isDowntube ? -0.018 : 0.004;
    const upperStartY = isDowntube ? 0.038 : 0.024;
    const wingChordDir = new THREE.Vector3(isDowntube ? -0.68 : -0.28, isDowntube ? 0.73 : 0.96, 0).normalize();

    const wingStations = [
      {
        pos: new THREE.Vector3(0.011, upperStartY, -0.015),
        chord: 0.022,
        width: 0.0042,
        kamm: 0.12,
        power: 2.3,
        chordDir: wingChordDir,
        widthDir: new THREE.Vector3(0.25, 0, -0.97).normalize(),
      },
      {
        pos: new THREE.Vector3(0.042, (upperStartY + wingDropY) * 0.52, -0.0365),
        chord: 0.0185,
        width: 0.0038,
        kamm: 0.10,
        power: 2.35,
        chordDir: wingChordDir,
        widthDir: new THREE.Vector3(0.12, 0, -0.99).normalize(),
      },
      {
        pos: new THREE.Vector3(0.071, wingDropY + 0.002, -0.027),
        chord: 0.0165,
        width: 0.0036,
        kamm: 0.10,
        power: 2.35,
        chordDir: wingChordDir,
        widthDir: new THREE.Vector3(0.72, 0, -0.69).normalize(),
      },
      {
        // Front center of the wrap-around band with subtle upper lip notch
        pos: new THREE.Vector3(0.077, wingDropY, 0.0),
        chord: 0.0155,
        width: 0.0036,
        kamm: 0.10,
        power: 2.35,
        chordDir: wingChordDir,
        widthDir: new THREE.Vector3(1.0, 0, 0.0),
      },
      {
        pos: new THREE.Vector3(0.071, wingDropY + 0.002, 0.027),
        chord: 0.0165,
        width: 0.0036,
        kamm: 0.10,
        power: 2.35,
        chordDir: wingChordDir,
        widthDir: new THREE.Vector3(0.72, 0, 0.69).normalize(),
      },
      {
        pos: new THREE.Vector3(0.042, (upperStartY + wingDropY) * 0.52, 0.0365),
        chord: 0.0185,
        width: 0.0038,
        kamm: 0.10,
        power: 2.35,
        chordDir: wingChordDir,
        widthDir: new THREE.Vector3(0.12, 0, 0.99).normalize(),
      },
      {
        pos: new THREE.Vector3(0.011, upperStartY, 0.015),
        chord: 0.022,
        width: 0.0042,
        kamm: 0.12,
        power: 2.3,
        chordDir: wingChordDir,
        widthDir: new THREE.Vector3(0.25, 0, 0.97).normalize(),
      },
    ];
    cg.add(createLoftedAeroMesh(wingStations, 28, cageCompositeMat, true));

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
  // Placed flush on the top Kamm-tail surface of the downtube (offset by 0.028m along dtXAxis from tube center)
  dtCage.position.set(0.153, 0.450, 0).addScaledVector(dtXAxis, 0.028);
  dtCage.quaternion.setFromRotationMatrix(dtBasis);
  cagesGroup.add(dtCage);

  // Third exposed lower bottle-boss bolt on the downtube below the cage (visible in 8_cages.jpg!)
  const extraBossBolt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0042, 0.0042, 0.003, 16),
    sramAnodizedBlackMat
  );
  extraBossBolt.position.copy(dtCage.position).addScaledVector(dtYAxis, -0.092).addScaledVector(dtXAxis, 0.003);
  extraBossBolt.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dtXAxis);
  frameGroup.add(extraBossBolt);

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
  // Integrated Fork Crown (Matches upperBladeStations at y=0.660 in x, y, chord=0.068, kamm=0.28, chordDir, and outer z=±0.034!)
  const forkCrownStations = [
    {
      pos: toSteerLocal(new THREE.Vector3(0.4335, 0.685, 0)),
      chord: 0.082,
      width: 0.050,
      kamm: 0.26,
      power: 2.18,
      chordDir: new THREE.Vector3(0.955, 0.297, 0),
    },
    {
      pos: toSteerLocal(new THREE.Vector3(0.440, 0.672, 0)),
      chord: 0.075,
      width: 0.060,
      kamm: 0.27,
      power: 2.22,
      chordDir: new THREE.Vector3(0.938, 0.346, 0),
    },
    {
      pos: toSteerLocal(new THREE.Vector3(0.446, 0.660, 0)),
      chord: 0.068,
      width: 0.068,
      kamm: 0.28,
      power: 2.25,
      chordDir: new THREE.Vector3(0.92, 0.38, 0),
    },
  ];
  steeringPivot.add(createLoftedAeroMesh(forkCrownStations, 36, auroraCharcoalMat, true));

  // Left & Right Wide Aero Fork Blades
  [-1, 1].forEach((side) => {
    // Upper Fork Blade (Coincides 1:1 with forkCrownStations at y=0.685 and y=0.660 so there is zero rear step and zero tire bleed!)
    const upperBladeStations = [
      {
        pos: toSteerLocal(new THREE.Vector3(0.4335, 0.685, side * 0.016)),
        chord: 0.082,
        width: 0.018,
        kamm: 0.26,
        power: 2.15,
        chordDir: new THREE.Vector3(0.955, 0.297, 0),
      },
      {
        pos: toSteerLocal(new THREE.Vector3(0.446, 0.660, side * 0.025)),
        chord: 0.068,
        width: 0.018,
        kamm: 0.28,
        power: 2.15,
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

    // 6-Bar Horizontal Iridescent Speed Stripes on Lower Fork Blade (matches crop_front_hub.png & 1_profil.png!)
    // Sheared in X while keeping rotation.z = 0 so the 6 bars remain 100% HORIZONTAL in world space!
    const forkStripeGeom = new THREE.PlaneGeometry(0.044, 0.040, 1, 8);
    const fsPos = forkStripeGeom.attributes.position;
    for (let i = 0; i < fsPos.count; i++) {
      const py = fsPos.getY(i);
      fsPos.setX(i, fsPos.getX(i) + side * py * -0.43);
    }
    forkStripeGeom.computeVertexNormals();
    const forkStripe = new THREE.Mesh(forkStripeGeom, makeHoloDecalMat(frameDecals.aeroStripesMap));
    forkStripe.position.copy(toSteerLocal(new THREE.Vector3(0.564, 0.396, side * 0.060)));
    if (side === -1) forkStripe.rotation.y = Math.PI;
    steeringPivot.add(forkStripe);
  });

  // Front Thru-Axle + Silver Hex Socket Cap on Right Dropout (crop_front_hub.png)
  const frontAxleRod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.006, 0.006, 0.114, 20).rotateX(Math.PI / 2),
    sramAnodizedBlackMat
  );
  frontAxleRod.position.copy(toSteerLocal(BIKE_COORDS.frontAxle));
  steeringPivot.add(frontAxleRod);

  const frontAxleCap = new THREE.Mesh(
    new THREE.RingGeometry(0.0028, 0.0068, 6),
    sramChromeMat
  );
  frontAxleCap.position.copy(toSteerLocal(new THREE.Vector3(BIKE_COORDS.frontAxle.x, BIKE_COORDS.frontAxle.y, 0.058)));
  steeringPivot.add(frontAxleCap);

  // 5.2 ATTEN CHB-01 Integrated One-Piece Carbon Aero Cockpit (Matches 3_cockpit.jpg & 7_speed_sniffer.jpg!)
  const cockpitGroup = new THREE.Group();
  cockpitGroup.name = 'ATTEN_Cockpit';
  steeringPivot.add(cockpitGroup);

  // 1. Contoured Aero Headset Spacer Stack (From Headtube Top 0.816m up to Stem Base 0.851m)
  // Top station sits at y = 0.862m (coplanar with stemStations center) so the tilted steerer nose never pokes above the 0.873m stem deck!
  const spacerStations = [
    {
      pos: toSteerLocal(new THREE.Vector3(0.393, 0.816, 0)),
      chord: 0.072,
      width: 0.045,
      kamm: 0.30,
      power: 2.3,
      chordDir: new THREE.Vector3(0.96, 0.28, 0),
    },
    {
      pos: toSteerLocal(new THREE.Vector3(0.388, 0.833, 0)),
      chord: 0.066,
      width: 0.042,
      kamm: 0.30,
      power: 2.4,
      chordDir: new THREE.Vector3(0.985, 0.17, 0),
    },
    {
      pos: toSteerLocal(new THREE.Vector3(0.383, 0.850, 0)),
      chord: 0.060,
      width: 0.040,
      kamm: 0.28,
      power: 2.4,
      chordDir: new THREE.Vector3(1.0, 0.0, 0.0),
    },
    {
      // Merges cleanly inside the horizontal stem clamp body at y = 0.862m
      pos: toSteerLocal(new THREE.Vector3(0.379, 0.862, 0)),
      chord: 0.052,
      width: 0.039,
      kamm: 0.26,
      power: 2.4,
      chordDir: new THREE.Vector3(1.0, 0.0, 0.0),
    },
  ];
  cockpitGroup.add(createLoftedAeroMesh(spacerStations, 40, satinCarbonMat, true));

  // White "ATTEN" Decal on the Front Nose of the Lower Headset Spacer (3_cockpit.jpg & 7_speed_sniffer.jpg)
  const attenSpacerDecal = new THREE.Mesh(
    new THREE.PlaneGeometry(0.018, 0.0055),
    makeMicroDecalMat(frameDecals.attenSpacerMap, 0.05)
  );
  attenSpacerDecal.position.copy(toSteerLocal(new THREE.Vector3(0.4265, 0.828, 0)));
  attenSpacerDecal.rotation.order = 'ZYX';
  attenSpacerDecal.rotation.set(0, Math.PI / 2, 0.29);
  cockpitGroup.add(attenSpacerDecal);

  // 2. Integrated Aero Stem Body (Coplanar 0.873m top deck from steerer clamp rear into wing bar crest)
  const stemStations = [
    {
      pos: toSteerLocal(new THREE.Vector3(0.355, 0.862, 0)),
      chord: 0.022,
      width: 0.036,
      kamm: 0.14,
      power: 2.4,
      chordDir: new THREE.Vector3(0.0, 1.0, 0.0),
    },
    {
      pos: toSteerLocal(new THREE.Vector3(0.378, 0.862, 0)),
      chord: 0.022,
      width: 0.040,
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
  cockpitGroup.add(createLoftedAeroMesh(stemStations, 36, satinCarbonMat, true));

  // Flush Countersunk Steerer Top Cap Ring + Recessed Hex Bolt on the stem's steerer deck (seen in 3_cockpit.jpg)
  const topCapRing = new THREE.Mesh(
    new THREE.RingGeometry(0.0045, 0.0155, 32).rotateX(-Math.PI / 2),
    sramAnodizedBlackMat
  );
  topCapRing.position.copy(toSteerLocal(new THREE.Vector3(0.376, 0.8732, 0)));
  cockpitGroup.add(topCapRing);

  const topCapBolt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0045, 0.0045, 0.0015, 6),
    new THREE.MeshStandardMaterial({ color: '#0a0b0e', metalness: 0.7, roughness: 0.35 })
  );
  topCapBolt.position.copy(toSteerLocal(new THREE.Vector3(0.376, 0.8728, 0)));
  cockpitGroup.add(topCapBolt);

  // ATTEN Underlined "A" Logo on the Top Center of the Handlebar Wing T-Junction (seen in 3_cockpit.jpg!)
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

  // Out-Front ATTEN Slotted Integrated Computer Mount + Garmin Puck + Gold GoPro Insert (7_speed_sniffer.jpg & 3_cockpit.jpg)
  const mountGroup = new THREE.Group();
  mountGroup.position.copy(toSteerLocal(new THREE.Vector3(0.530, 0.856, 0)));
  cockpitGroup.add(mountGroup);

  // Twin parallel slotted rail arms + front ring carrier
  [-0.0068, 0.0068].forEach((mz) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.0045, 0.0042), sramAnodizedBlackMat);
    rail.position.set(0, 0, mz);
    mountGroup.add(rail);
  });
  // Rear underside mounting bracket + two silver M4 bolts under the stem
  const mountBase = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.0045, 0.018), sramAnodizedBlackMat);
  mountBase.position.set(-0.024, 0.001, 0);
  mountGroup.add(mountBase);
  [-0.031, -0.018].forEach((bx) => {
    const mBolt = new THREE.Mesh(new THREE.CylinderGeometry(0.0024, 0.0024, 0.003, 12), sramChromeMat);
    mBolt.position.set(bx, -0.002, 0);
    mountGroup.add(mBolt);
  });
  // Outer circular computer puck housing
  const mountPuck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0185, 0.0185, 0.0065, 32),
    sramAnodizedBlackMat
  );
  mountPuck.position.set(0.028, 0.001, 0);
  mountGroup.add(mountPuck);
  // Inner quarter-turn Garmin/Wahoo bayonet ring + 2 side tabs
  const puckInsert = new THREE.Mesh(
    new THREE.RingGeometry(0.007, 0.0145, 24).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#1c2026', metalness: 0.4, roughness: 0.4 })
  );
  puckInsert.position.set(0.028, 0.0044, 0);
  mountGroup.add(puckInsert);
  // Gold/brass threaded accessory insert ring on the underside (visible in 7_speed_sniffer.jpg!)
  const goldInsert = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0042, 0.0042, 0.003, 16),
    new THREE.MeshStandardMaterial({ color: '#d4af37', metalness: 0.88, roughness: 0.22 })
  );
  goldInsert.position.set(0.010, -0.0022, 0);
  mountGroup.add(goldInsert);

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
  const finishingCollarMat = new THREE.MeshStandardMaterial({
    map: frameDecals.finishingTapeMap,
    roughness: 0.42,
    metalness: 0.08,
  });

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

    // 4.1 Argon 18 Embossed Finishing Tape Collar on the upper bar transition (visible in 3_cockpit.jpg & 7_speed_sniffer.jpg)
    const collarCylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0129, 0.0129, 0.019, 24).rotateX(Math.PI / 2),
      finishingCollarMat
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
    const carbonBladeMesh = createLoftedAeroMesh(
      bladeStations,
      32,
      side === 1 ? sramLeverBladeMat : sramLeverBladeMatLeft,
      true
    );
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

    // 6.1 Vittoria Corsa Pro TLR 30c Cotton Tan-Wall Tire (with Dual-Roughness Map: matte 0.83 cotton sidewalls + satin 0.42 graphene tread!)
    // Torus major radius R = 0.3265, tube radius r = 0.0155 -> outer radius = 0.342m
    const tireGeom = new THREE.TorusGeometry(0.3265, 0.0155, 36, 112);
    const tireMat = attachSurfaceCpShader(
      new THREE.MeshPhysicalMaterial({
        name: 'VittoriaCorsaPro30c',
        map: vittoriaMaps.map,
        normalMap: vittoriaMaps.normalMap,
        normalScale: new THREE.Vector2(0.35, 0.35),
        roughnessMap: vittoriaMaps.roughnessMap,
        roughness: 1.0,
        metalness: 0.02,
        clearcoat: 0.06,
        clearcoatRoughness: 0.32,
        sheen: 0.28,
        sheenColor: new THREE.Color('#323642'),
        sheenRoughness: 0.42,
        envMapIntensity: 1.18,
      })
    );
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

    const rimMat = attachSurfaceCpShader(
      new THREE.MeshPhysicalMaterial({
        name: 'ScopeArtech6ARim',
        map: scopeWheelMaps.map,
        normalMap: scopeWheelMaps.normalMap,
        normalScale: new THREE.Vector2(0.55, 0.55),
        metalness: 0.25,
        roughness: 0.24,
        clearcoat: 0.88,
        clearcoatRoughness: 0.08,
        envMapIntensity: 1.4,
      })
    );
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

    // 6.5 Bladed Carbon Aero Spokes (Tangential 2-Cross Lacing) + External Black-Anodized Spoke Nipples
    const spokeCount = isFront ? 21 : 24;
    const spokeRadiusInner = 0.026;
    const spokeRadiusOuter = 0.252;
    const nippleGeom = new THREE.CylinderGeometry(0.0013, 0.0017, 0.0068, 8);

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
      const spokeDir = spokeVec.clone().normalize();
      // Aero bladed carbon spoke (flat in XY plane, thin in Z)
      const spokeGeom = new THREE.BoxGeometry(0.0032, spokeLen, 0.0011);
      const spokeMesh = new THREE.Mesh(spokeGeom, satinCarbonMat);
      spokeMesh.position.copy(pStart).addScaledVector(spokeVec, 0.5);
      spokeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), spokeDir);
      spokeMesh.castShadow = true;
      wheelGroup.add(spokeMesh);

      // External black-anodized spoke nipple collar seating into the 65mm Scope Artech 6.A+ rim nose (visible in crop_front_hub.png!)
      const nippleMesh = new THREE.Mesh(nippleGeom, sramAnodizedBlackMat);
      nippleMesh.position.copy(pEnd).addScaledVector(spokeDir, -0.0045);
      nippleMesh.quaternion.copy(spokeMesh.quaternion);
      wheelGroup.add(nippleMesh);
    }

    // 6.6 SRAM Centerlock Paceline X Disc Brake Rotor (Left / -Z Non-Drive Side, matches crop_front_hub.png!)
    // Official Spec: Front 160mm (R=0.080m), Rear 140mm (R=0.070m)
    const rotorRadius = isFront ? 0.080 : 0.070;
    const rotorZ = isFront ? -0.042 : -0.054;
    const rotorGroup = new THREE.Group();
    rotorGroup.position.z = rotorZ;

    const pacelineMat = new THREE.MeshPhysicalMaterial({
      name: 'SRAMPacelineXRotor',
      map: frameDecals.pacelineRotorMap,
      normalMap: frameDecals.pacelineRotorNormalMap,
      normalScale: new THREE.Vector2(0.45, 0.45),
      transparent: true,
      alphaTest: 0.35,
      metalness: 0.88,
      roughness: 0.22,
      clearcoat: 0.25,
      envMapIntensity: 1.5,
      side: THREE.DoubleSide,
    });

    // 4-layer stack (2.0mm total thickness) for real 3D depth across the laser-cut cooling slots & 6-arm spider
    const rotorDiameter = rotorRadius * 2.06;
    for (let rl = 0; rl < 4; rl++) {
      const rLz = -0.0010 + (rl / 3) * 0.0020;
      const rPlane = new THREE.Mesh(new THREE.PlaneGeometry(rotorDiameter, rotorDiameter), pacelineMat);
      rPlane.position.z = rLz;
      rPlane.castShadow = true;
      rPlane.receiveShadow = true;
      rotorGroup.add(rPlane);
    }

    // 3D Raised Anodized Black Centerlock Lockring Collar + 6 Floating Stainless Rivet Pins (crop_front_hub.png)
    const lockringCollar = new THREE.Mesh(
      new THREE.CylinderGeometry(rotorRadius * 0.28, rotorRadius * 0.30, 0.0045, 32, 1, true).rotateX(Math.PI / 2),
      sramAnodizedBlackMat
    );
    lockringCollar.position.z = -0.0015;
    rotorGroup.add(lockringCollar);

    for (let arm = 0; arm < 6; arm++) {
      const a = (arm / 6) * Math.PI * 2 + 0.38;
      const pinR = rotorRadius * 0.658 * 1.03;
      const rivetPin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0026, 0.0026, 0.0032, 12).rotateX(Math.PI / 2),
        sramChromeMat
      );
      rivetPin.position.set(Math.cos(a) * pinR, Math.sin(a) * pinR, 0);
      rotorGroup.add(rivetPin);
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

  // SRAM RED AXS E1 Flat-Mount Hydraulic Disc Calipers (Front & Rear on -Z Left Side, matches crop_front_hub.png & crop_rd.png!)
  const caliperSilverMat = new THREE.MeshPhysicalMaterial({
    color: '#d4dbe6',
    metalness: 0.90,
    roughness: 0.20,
    clearcoat: 0.35,
    envMapIntensity: 1.5,
  });

  const createSramRedCaliper = (isFront) => {
    const cal = new THREE.Group();

    // 1. Sculpted CNC Machined Silver 2-Piece Caliper Body (Lofted Aero-Machined Housing)
    const calStations = [
      { pos: new THREE.Vector3(0, -0.028, 0), chord: 0.026, width: 0.024, kamm: 0.15, power: 2.3, chordDir: new THREE.Vector3(1, 0, 0) },
      { pos: new THREE.Vector3(0.002, -0.010, 0), chord: 0.032, width: 0.028, kamm: 0.12, power: 2.4, chordDir: new THREE.Vector3(1, 0, 0) },
      { pos: new THREE.Vector3(0.002, 0.010, 0), chord: 0.032, width: 0.028, kamm: 0.12, power: 2.4, chordDir: new THREE.Vector3(1, 0, 0) },
      { pos: new THREE.Vector3(0, 0.028, 0), chord: 0.025, width: 0.024, kamm: 0.15, power: 2.3, chordDir: new THREE.Vector3(1, 0, 0) },
    ];
    cal.add(createLoftedAeroMesh(calStations, 24, caliperSilverMat, true));

    // 2. Recessed Circular 4-Port Piston Bore Cap on Outer Face (-Z)
    const boreOuterRing = new THREE.Mesh(
      new THREE.RingGeometry(0.0055, 0.0105, 24),
      new THREE.MeshStandardMaterial({ color: '#8c94a2', metalness: 0.85, roughness: 0.28, side: THREE.DoubleSide })
    );
    boreOuterRing.position.set(0.002, 0, -0.0145);
    cal.add(boreOuterRing);

    const boreInnerWell = new THREE.Mesh(
      new THREE.CircleGeometry(0.0055, 20),
      sramAnodizedBlackMat
    );
    boreInnerWell.position.set(0.002, 0, -0.0143);
     boreInnerWell.rotation.y = Math.PI;
    cal.add(boreInnerWell);

    // 3. Two Black Structural Bridge Torx Bolts + Top Bleed Port Rubber Boot + Pad Cooling Fins
    [-0.017, 0.017].forEach((by) => {
      const bridgeBolt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0028, 0.0028, 0.029, 12).rotateX(Math.PI / 2),
        sramAnodizedBlackMat
      );
      bridgeBolt.position.set(-0.005, by, 0);
      cal.add(bridgeBolt);
    });

    // Black alloy finned brake pad backing tab protruding at the top window
    const padFins = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.018, 0.009), sramAnodizedBlackMat);
    padFins.position.set(0.005, 0.004, 0);
    cal.add(padFins);

    // Top bleed nipple rubber dust boot
    const bleedBoot = new THREE.Mesh(new THREE.CylinderGeometry(0.0026, 0.0032, 0.008, 12), sramAnodizedBlackMat);
    bleedBoot.position.set(0.004, 0.030, -0.004);
    cal.add(bleedBoot);

    // Flat-mount black anodized mounting bracket + curved black hydraulic hose stub
    const fmBracket = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.068, 0.012), sramAnodizedBlackMat);
    fmBracket.position.set(isFront ? -0.012 : 0.012, 0, 0.002);
    cal.add(fmBracket);

    const hosePts = isFront
      ? [new THREE.Vector3(-0.004, 0.024, 0.002), new THREE.Vector3(-0.012, 0.048, -0.002), new THREE.Vector3(-0.018, 0.072, -0.005)]
      : [new THREE.Vector3(0.008, 0.018, 0.002), new THREE.Vector3(0.032, 0.012, 0.004), new THREE.Vector3(0.058, 0.008, 0.006)];
    const hoseCurve = new THREE.CatmullRomCurve3(hosePts);
    const hoseMesh = new THREE.Mesh(new THREE.TubeGeometry(hoseCurve, 12, 0.0024, 8, false), sramAnodizedBlackMat);
    cal.add(hoseMesh);

    return cal;
  };

  const frontCaliper = createSramRedCaliper(true);
  frontCaliper.position.copy(toSteerLocal(new THREE.Vector3(0.514, 0.366, -0.042)));
  frontCaliper.rotation.z = -0.36;
  steeringPivot.add(frontCaliper);

  const rearCaliper = createSramRedCaliper(false);
  rearCaliper.position.set(-0.344, 0.340, -0.054);
  rearCaliper.rotation.z = 1.38;
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
    color: '#e6ecf6',
    metalness: 0.92,
    roughness: 0.17,
    clearcoat: 0.35,
    side: THREE.DoubleSide,
  });

  // Inner cogs (c = 1..4) receive subtle radial crevice ambient occlusion so the 12-speed X-Dome dome has rich 3D pocket depth
  const cogMatSilverInnerAO = new THREE.MeshPhysicalMaterial({
    map: frameDecals.sramCassetteMap,
    transparent: true,
    alphaTest: 0.35,
    color: '#bcc5d4',
    metalness: 0.90,
    roughness: 0.22,
    clearcoat: 0.30,
    side: THREE.DoubleSide,
  });

  const cogMatBlack33T = new THREE.MeshPhysicalMaterial({
    map: frameDecals.sramCassetteMap,
    transparent: true,
    alphaTest: 0.35,
    color: '#20242c',
    metalness: 0.85,
    roughness: 0.25,
    side: THREE.DoubleSide,
  });

  const sramDerailleurFaceMat = new THREE.MeshPhysicalMaterial({
    map: frameDecals.sramDerailleurFaceMap,
    color: '#ffffff',
    metalness: 0.90,
    roughness: 0.18,
    clearcoat: 0.38,
    envMapIntensity: 1.55,
  });

  for (let c = 0; c < 12; c++) {
    const t = c / 11; // 0 = 33T (innermost), 1 = 10T (outermost)
    const cogRadius = THREE.MathUtils.lerp(0.067, 0.022, t);
    const cogZ = t * 0.030;
    // Alpha-perforated X-Dome CNC cog plane so spokes and light shine right through the spider cutouts!
    const cogGeom = new THREE.PlaneGeometry(cogRadius * 2.0, cogRadius * 2.0);
    const cogMesh = new THREE.Mesh(
      cogGeom,
      c === 0 ? cogMatBlack33T : c <= 4 ? cogMatSilverInnerAO : cogMatSilver
    );
    cogMesh.position.z = cogZ;
    cogMesh.rotation.z = c * 0.24;
    cogMesh.castShadow = true;
    cogMesh.receiveShadow = true;
    cassetteGroup.add(cogMesh);
  }

  // 7.2 SRAM RED AXS E1 Powermeter Crankset (48/35T) at BB (Matches 8_cages.jpg & crop_crank.png!)
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

  // Central Quarq AXS Powermeter Spider Ring & Aero Electronics Lobe (crop_crank.png!)
  const pmSpiderRing = new THREE.Mesh(
    new THREE.RingGeometry(0.0165, 0.0355, 36),
    sramAnodizedBlackMat
  );
  pmSpiderRing.position.z = chainringZ + 0.0022;
  cranksetGroup.add(pmSpiderRing);

  // Sculpted Matte-Black Quarq AXS Powermeter Aero Spider Lobe on the Rear/Left Side of the DUB Spindle (crop_crank.png!)
  const quarqLobeStations = [
    { pos: new THREE.Vector3(-0.024, 0, chainringZ + 0.001), chord: 0.036, width: 0.006, kamm: 0.15, power: 2.3, chordDir: new THREE.Vector3(0, 1, 0), widthDir: new THREE.Vector3(0, 0, 1) },
    { pos: new THREE.Vector3(-0.044, 0.002, chainringZ + 0.001), chord: 0.048, width: 0.0065, kamm: 0.18, power: 2.4, chordDir: new THREE.Vector3(0.08, 0.99, 0), widthDir: new THREE.Vector3(0, 0, 1) },
    { pos: new THREE.Vector3(-0.060, 0.005, chainringZ + 0.0005), chord: 0.034, width: 0.005, kamm: 0.15, power: 2.2, chordDir: new THREE.Vector3(0.12, 0.99, 0), widthDir: new THREE.Vector3(0, 0, 1) },
  ];
  const quarqLobeMesh = createLoftedAeroMesh(quarqLobeStations, 24, sramAnodizedBlackMat, true);
  quarqLobeMesh.rotation.z = -0.165; // Rotates with the crank arm orientation
  cranksetGroup.add(quarqLobeMesh);

  // Small silver/white Quarq pairing button dot on the powermeter lobe (crop_crank.png)
  const quarqDot = new THREE.Mesh(
    new THREE.CircleGeometry(0.0022, 12),
    new THREE.MeshStandardMaterial({ color: '#d8dee8', metalness: 0.6, roughness: 0.3 })
  );
  quarqDot.position.set(-0.046, 0.011, chainringZ + 0.0046);
  cranksetGroup.add(quarqDot);

  const dubSpindleTube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.016, 0.118, 28, 1, true).rotateX(Math.PI / 2),
    sramAnodizedBlackMat
  );
  cranksetGroup.add(dubSpindleTube);

  // Drive-Side (+Z, pointing forward-down at -9.5 deg like 1_profil.png) & Non-Drive (-Z, +170.5 deg)
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

    // Recessed DUB Spindle Cap Ring + 8mm Hex Extractor Socket at (0, 0) (crop_crank.png)
    const dubCap = new THREE.Mesh(
      new THREE.RingGeometry(0.0085, 0.0172, 28),
      new THREE.MeshStandardMaterial({ color: '#1a1d24', metalness: 0.85, roughness: 0.25, side: THREE.DoubleSide })
    );
    dubCap.position.set(0, 0, zPos + side * 0.0082);
    armHolder.add(dubCap);

    const dubHex = new THREE.Mesh(
      new THREE.RingGeometry(0.0045, 0.0085, 6),
      new THREE.MeshStandardMaterial({ color: '#383e4a', metalness: 0.88, roughness: 0.22, side: THREE.DoubleSide })
    );
    dubHex.position.set(0, 0, zPos + side * 0.0080);
    armHolder.add(dubHex);

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

    // Flush Silver Machined Pedal Thread Insert at x = 0.165m (matches 1_profil.png & crop_crank.png)
    const pedalEye = new THREE.Mesh(
      new THREE.RingGeometry(0.0052, 0.0096, 24),
      sramChromeMat
    );
    pedalEye.position.set(0.164, 0, zPos + side * 0.0126);
    if (side === -1) pedalEye.rotation.y = Math.PI;
    armHolder.add(pedalEye);
  });

  // 7.3 SRAM RED AXS E1 Front Derailleur + AXS Battery (Matches crop_crank.png & 8_cages.jpg!)
  const fdGroup = new THREE.Group();
  fdGroup.position.set(-0.035, 0.386, 0.044);
  frameGroup.add(fdGroup);

  // Braze-on silver mounting bracket attached to seat tube + mounting bolt
  const fdMount = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.012, 0.022), caliperSilverMat);
  fdMount.position.set(-0.006, -0.004, -0.016);
  fdGroup.add(fdMount);

  // Sculpted Wireless Actuator Head (Black composite upper housing + brushed silver diagonal parallelogram link)
  const fdBodyStations = [
    { pos: new THREE.Vector3(-0.016, 0.004, 0), chord: 0.019, width: 0.018, kamm: 0.18, power: 2.3, chordDir: new THREE.Vector3(0, 1, 0) },
    { pos: new THREE.Vector3(0.002, 0.005, 0.002), chord: 0.021, width: 0.020, kamm: 0.15, power: 2.4, chordDir: new THREE.Vector3(0, 1, 0) },
    { pos: new THREE.Vector3(0.018, 0.002, 0.004), chord: 0.017, width: 0.016, kamm: 0.18, power: 2.3, chordDir: new THREE.Vector3(0, 1, 0) },
  ];
  fdGroup.add(createLoftedAeroMesh(fdBodyStations, 20, sramAnodizedBlackMat, true));

  // Signature SRAM RED E1 angled brushed-silver outer faceplate with laser-etched "SRAM RED" stencil
  const fdSilverPlate = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.009, 0.0025), sramDerailleurFaceMat);
  fdSilverPlate.position.set(0.005, 0.002, 0.0105);
  fdSilverPlate.rotation.z = -0.18;
  fdGroup.add(fdSilverPlate);

  // Rear Clip-On AXS Battery + upper latch tab (crop_crank.png)
  const fdBatt = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.026, 0.014), glossCarbonMat);
  fdBatt.position.set(-0.022, 0.001, -0.002);
  fdBatt.rotation.z = 0.26;
  fdGroup.add(fdBatt);

  const fdBattLatch = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.004, 0.011), caliperSilverMat);
  fdBattLatch.position.set(-0.026, 0.015, -0.002);
  fdBattLatch.rotation.z = 0.26;
  fdGroup.add(fdBattLatch);

  // Sculpted Chrome Yaw Outer & Inner Guide Cage Plates (conformed to the 48T chainring arc, crop_crank.png)
  const fdOuterCage = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.010, 0.0020), sramChromeMat);
  fdOuterCage.position.set(0.020, -0.013, 0.0105);
  fdOuterCage.rotation.z = -0.32;
  fdGroup.add(fdOuterCage);

  const fdInnerCage = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.012, 0.0020), caliperSilverMat);
  fdInnerCage.position.set(0.017, -0.016, 0.001);
  fdInnerCage.rotation.z = -0.32;
  fdGroup.add(fdInnerCage);

  // 7.4 SRAM RED AXS E1 Rear Derailleur + Skeletonized Magic Wheel Pulleys (Matches crop_rd.png & 1_profil.png!)
  const rdGroup = new THREE.Group();
  rdGroup.position.set(BIKE_COORDS.rearAxle.x, BIKE_COORDS.rearAxle.y, 0.062);
  frameGroup.add(rdGroup);

  // 1. UDH Direct-Mount B-Knuckle Hanger Link + Silver Knuckle Pivot Bolt (crop_rd.png)
  const bKnuckle = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.013, 0.012), sramAnodizedBlackMat);
  bKnuckle.position.set(-0.012, -0.010, -0.001);
  bKnuckle.rotation.z = 0.48;
  rdGroup.add(bKnuckle);

  const bKnucklePivot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0055, 0.0055, 0.014, 16).rotateX(Math.PI / 2),
    caliperSilverMat
  );
  bKnucklePivot.position.set(-0.024, -0.017, 0.001);
  rdGroup.add(bKnucklePivot);

  // 2. Sculpted Carbon & Brushed-Silver Parallelogram Body + Lower-Front Orbit Fluid Damper Clutch (crop_rd.png)
  const rdBodyStations = [
    { pos: new THREE.Vector3(-0.032, -0.026, 0), chord: 0.022, width: 0.022, kamm: 0.20, power: 2.3, chordDir: new THREE.Vector3(0.45, 0.89, 0) },
    { pos: new THREE.Vector3(-0.014, -0.038, 0.002), chord: 0.026, width: 0.024, kamm: 0.18, power: 2.4, chordDir: new THREE.Vector3(0.45, 0.89, 0) },
    { pos: new THREE.Vector3(0.004, -0.048, 0.002), chord: 0.024, width: 0.022, kamm: 0.18, power: 2.3, chordDir: new THREE.Vector3(0.45, 0.89, 0) },
  ];
  rdGroup.add(createLoftedAeroMesh(rdBodyStations, 24, glossCarbonMat, true));

  // Signature SRAM RED E1 Diagonal Brushed-Silver Outer Faceplate + Window Cutout (crop_rd.png!)
  const rdSilverFace = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.014, 0.003), sramDerailleurFaceMat);
  rdSilverFace.position.set(-0.013, -0.037, 0.0125);
  rdSilverFace.rotation.z = -0.52;
  rdGroup.add(rdSilverFace);

  const rdFaceSlot = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.0038, 0.0035), sramAnodizedBlackMat);
  rdFaceSlot.position.set(-0.013, -0.037, 0.0128);
  rdFaceSlot.rotation.z = -0.52;
  rdGroup.add(rdFaceSlot);

  // Circular Orbit Fluid Damper Clutch Cap at the lower-front knuckle (crop_rd.png)
  const orbitCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0095, 0.0095, 0.004, 20).rotateX(Math.PI / 2),
    caliperSilverMat
  );
  orbitCap.position.set(0.005, -0.049, 0.0115);
  rdGroup.add(orbitCap);

  // 3. Rear Clip-On AXS Battery + Top Silver Release Latch (crop_rd.png)
  const rdBattery = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.028, 0.016), glossCarbonMat);
  rdBattery.position.set(-0.042, -0.034, -0.001);
  rdBattery.rotation.z = -0.35;
  rdGroup.add(rdBattery);

  const rdBattLatch = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.005, 0.012), caliperSilverMat);
  rdBattLatch.position.set(-0.036, -0.019, -0.001);
  rdBattLatch.rotation.z = -0.35;
  rdGroup.add(rdBattLatch);

  // 4. Upper Guide Pulley (12T) & Lower Oversized Skeletonized Magic Wheel Pulley (14T) (crop_rd.png)
  const upperPulleyPos = new THREE.Vector3(BIKE_COORDS.rearAxle.x + 0.004, BIKE_COORDS.rearAxle.y - 0.056, 0.052);
  const lowerPulleyPos = new THREE.Vector3(BIKE_COORDS.rearAxle.x + 0.032, BIKE_COORDS.rearAxle.y - 0.118, 0.052);

  const buildPulleyWheel = (radius, spokeCount) => {
    const pg = new THREE.Group();
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.64, radius * 0.92, 28),
      new THREE.MeshStandardMaterial({ color: '#14171d', metalness: 0.78, roughness: 0.24, side: THREE.DoubleSide })
    );
    pg.add(rim);
    // Narrow-wide pulley teeth around circumference
    const toothCount = spokeCount === 5 && radius > 0.022 ? 14 : 12;
    for (let t = 0; t < toothCount; t++) {
      const ta = (t / toothCount) * Math.PI * 2;
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.0024, 0.0045, 0.0022), sramAnodizedBlackMat);
      tooth.position.set(Math.cos(ta) * (radius * 0.94), Math.sin(ta) * (radius * 0.94), 0);
      tooth.rotation.z = ta - Math.PI / 2;
      pg.add(tooth);
    }
    for (let s = 0; s < spokeCount; s++) {
      const a = (s / spokeCount) * Math.PI * 2;
      const spk = new THREE.Mesh(new THREE.BoxGeometry(0.0022, radius * 1.35, 0.0022), sramAnodizedBlackMat);
      spk.rotation.z = a;
      pg.add(spk);
    }
    // Silver ceramic bearing dust cap + center bolt (crop_rd.png)
    const bearingCap = new THREE.Mesh(new THREE.RingGeometry(0.0022, 0.0062, 20), caliperSilverMat);
    bearingCap.position.z = 0.0016;
    pg.add(bearingCap);
    const innerHole = new THREE.Mesh(new THREE.CircleGeometry(0.0022, 12), sramAnodizedBlackMat);
    innerHole.position.z = 0.0017;
    pg.add(innerHole);
    return pg;
  };

  const upperPulley = buildPulleyWheel(0.020, 5);
  upperPulley.position.copy(upperPulleyPos);
  frameGroup.add(upperPulley);

  const lowerPulley = buildPulleyWheel(0.025, 5);
  lowerPulley.position.copy(lowerPulleyPos);
  frameGroup.add(lowerPulley);

  // 5. Skeletonized Carbon Pulley Cage Plates with Open Central Cutout Window (crop_rd.png)
  const cageVec = new THREE.Vector3().subVectors(lowerPulleyPos, upperPulleyPos);
  const cageLen = cageVec.length();
  const cageAng = Math.atan2(cageVec.x, -cageVec.y);
  const cageMid = new THREE.Vector3().copy(upperPulleyPos).addScaledVector(cageVec, 0.5);

  [-0.0052, 0.0052].forEach((dz) => {
    const sideCage = new THREE.Group();
    sideCage.position.copy(cageMid);
    sideCage.position.z += dz;
    sideCage.rotation.z = cageAng;

    // Front & rear skeletonized carbon rails framing the central cutout window
    [-0.0058, 0.0058].forEach((rx) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.0052, cageLen + 0.018, 0.0026), glossCarbonMat);
      rail.position.set(rx, 0, 0);
       rail.rotation.z = rx < 0 ? -0.05 : 0.05;
      sideCage.add(rail);
    });
    // Upper & lower rounded pulley boss rings
    [cageLen * 0.5, -cageLen * 0.5].forEach((py, idx) => {
      const bossR = idx === 0 ? 0.011 : 0.013;
      const boss = new THREE.Mesh(
        new THREE.CylinderGeometry(bossR, bossR, 0.0026, 20).rotateX(Math.PI / 2),
         idx === 1 && dz > 0 ? caliperSilverMat : glossCarbonMat
      );
      boss.position.set(0, py, 0);
      sideCage.add(boss);
    });
    frameGroup.add(sideCage);
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

  const setSurfaceCpMode = (enabled, yawDeg = 0) => {
    aeroCpUniforms.uSurfaceCpMix.value = enabled ? 1.0 : 0.0;
    aeroCpUniforms.uWindYawRad.value = THREE.MathUtils.degToRad(yawDeg);
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
    setSurfaceCpMode,
  };
}
