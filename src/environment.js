import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

/**
 * Museum Exhibition Plinth, High-Contrast Studio Softbox HDRI Generator,
 * Planar Roughness-Attenuated Floor Reflector, and 3-Tier Contact + 4K Shadow System.
 */

export const LIGHTING_PRESETS = {
  evening: {
    name: 'Evening Sun • 2850K Sparkle',
    bgTop: '#100d14',
    bgBottom: '#050507',
    fogColor: '#070609',
    keyColor: '#ffc282',
    keyIntensity: 4.6,
    keyElevationDeg: 25,
    fillColor: '#8a99ad',
    fillIntensity: 0.52,
    rimColor: '#ff926b',
    rimIntensity: 2.5,
    spotIntensity: 3.2,
    spotColor: '#ffe3be',
    ambientColor: '#141318',
    ambientIntensity: 0.45,
    plinthStripColor: '#ff9a44',
    exposure: 1.12,
    shadowOpacity: 0.68,
    contactOpacity: 0.98,
    reflectOpacity: 0.13,
    isLightTheme: false,
  },
  museum: {
    name: 'Museum Spotlight • 3400K Gallery',
    bgTop: '#0c0e12',
    bgBottom: '#040507',
    fogColor: '#050608',
    keyColor: '#fff2da',
    keyIntensity: 3.8,
    keyElevationDeg: 50,
    fillColor: '#8592a6',
    fillIntensity: 0.48,
    rimColor: '#ebd5ad',
    rimIntensity: 2.4,
    spotIntensity: 5.8,
    spotColor: '#ffefd4',
    ambientColor: '#121418',
    ambientIntensity: 0.45,
    plinthStripColor: '#ebd3a7',
    exposure: 1.10,
    shadowOpacity: 0.72,
    contactOpacity: 0.98,
    reflectOpacity: 0.14,
    isLightTheme: false,
  },
  morning: {
    name: 'Morning Sun • 5200K Alpine Dawn',
    bgTop: '#101824',
    bgBottom: '#05080c',
    fogColor: '#070b12',
    keyColor: '#fff7e6',
    keyIntensity: 4.5,
    keyElevationDeg: 32,
    fillColor: '#8ab4e8',
    fillIntensity: 0.65,
    rimColor: '#bce0fd',
    rimIntensity: 2.5,
    spotIntensity: 2.6,
    spotColor: '#ffffff',
    ambientColor: '#141c28',
    ambientIntensity: 0.48,
    plinthStripColor: '#8ce7f7',
    exposure: 1.10,
    shadowOpacity: 0.66,
    contactOpacity: 0.96,
    reflectOpacity: 0.13,
    isLightTheme: false,
  },
  aerolab: {
    name: 'Aero CFD Lab • 6500K Tunnel',
    bgTop: '#060d14',
    bgBottom: '#030609',
    fogColor: '#04070b',
    keyColor: '#e0f8ff',
    keyIntensity: 3.9,
    keyElevationDeg: 44,
    fillColor: '#6ec8ea',
    fillIntensity: 0.62,
    rimColor: '#00e5ff',
    rimIntensity: 3.0,
    spotIntensity: 3.8,
    spotColor: '#c8f4ff',
    ambientColor: '#0a131c',
    ambientIntensity: 0.48,
    plinthStripColor: '#00e5ff',
    exposure: 1.08,
    shadowOpacity: 0.68,
    contactOpacity: 0.96,
    reflectOpacity: 0.16,
    isLightTheme: false,
  },
  studio: {
    name: 'Daylight Cyclorama • 5600K Pure',
    bgTop: '#f5f7fa',
    bgBottom: '#f2f5f9',
    fogColor: '#f2f5f9',
    keyColor: '#ffffff',
    keyIntensity: 4.0,
    keyElevationDeg: 48,
    fillColor: '#e4ecf7',
    fillIntensity: 0.95,
    rimColor: '#ffffff',
    rimIntensity: 2.2,
    spotIntensity: 3.6,
    spotColor: '#ffffff',
    ambientColor: '#bcc6d4',
    ambientIntensity: 0.50,
    plinthStripColor: '#e50019',
    exposure: 1.04,
    shadowOpacity: 0.44,
    contactOpacity: 0.96,
    reflectOpacity: 0.05,
    isLightTheme: true,
  },
};

/**
 * Helper to create a soft-feathered photographic studio softbox texture
 * so clearcoat reflections on Kamm-tail carbon tubes have silky falloff instead of harsh polygon edges.
 */
function createFeatheredSoftboxTexture(colorHex, intensityMult) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createRadialGradient(128, 64, 10, 128, 64, 120);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.55, 'rgba(255, 255, 255, 0.82)');
  grad.addColorStop(0.85, 'rgba(255, 255, 255, 0.25)');
  grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 128);

  const tex = new THREE.CanvasTexture(canvas);
  const col = new THREE.Color(colorHex).multiplyScalar(intensityMult);
  return new THREE.MeshBasicMaterial({
    map: tex,
    color: col,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/**
 * Generates a high-contrast studio HDRI environment map using PMREMGenerator.
 * Uses dark negative-fill studio walls/ceiling punctuated by bright feathered softboxes
 * so black carbon stays deep obsidian-black with razor-sharp specular highlight lines.
 */
function buildProceduralEnvMap(renderer, preset) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();

  const domeCanvas = document.createElement('canvas');
  domeCanvas.width = 512;
  domeCanvas.height = 256;
  const ctx = domeCanvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);

  if (preset.isLightTheme) {
    grad.addColorStop(0.0, '#090b10');
    grad.addColorStop(0.38, '#10141d');
    grad.addColorStop(0.50, '#2a313d');
    grad.addColorStop(0.62, '#161a22');
    grad.addColorStop(1.0, '#242933');
  } else {
    grad.addColorStop(0.0, '#050608');
    grad.addColorStop(0.45, '#0b0d12');
    grad.addColorStop(0.50, '#1c1a1e');
    grad.addColorStop(0.56, '#07080b');
    grad.addColorStop(1.0, '#030405');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  const domeTex = new THREE.CanvasTexture(domeCanvas);
  domeTex.colorSpace = THREE.SRGBColorSpace;
  const domeMesh = new THREE.Mesh(
    new THREE.SphereGeometry(20, 48, 24),
    new THREE.MeshBasicMaterial({ map: domeTex, side: THREE.BackSide })
  );
  envScene.add(domeMesh);

  // Feathered studio reflection softbox strips (neutral-warm key & neutral-silver fill so floor never tints purple!)
  const stripMatMain = createFeatheredSoftboxTexture(preset.keyColor, preset.isLightTheme ? 4.8 : 3.8);
  const stripMatFill = createFeatheredSoftboxTexture('#cfd8e6', 1.65);
  const stripMatRim = createFeatheredSoftboxTexture(preset.rimColor, 3.2);

  // 1. Overhead long gallery softbox bank
  const topStrip = new THREE.Mesh(new THREE.PlaneGeometry(16, 2.6), stripMatMain);
  topStrip.position.set(0, 9.2, 1.8);
  topStrip.rotation.x = Math.PI / 2;
  envScene.add(topStrip);

  // 2. Primary 3/4 front-right key softbox
  const keyPanel = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 3.8), stripMatMain);
  keyPanel.position.set(6.2, 4.2, 7.2);
  keyPanel.lookAt(0, 0.5, 0);
  envScene.add(keyPanel);

  // 3. Left-rear neutral silver fill softbox
  const fillPanel = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.8), stripMatFill);
  fillPanel.position.set(-6.0, 3.8, -6.5);
  fillPanel.lookAt(0, 0.5, 0);
  envScene.add(fillPanel);

  // 4. Low grazing horizon rim strip
  const rimPanel = new THREE.Mesh(new THREE.PlaneGeometry(16, 1.6), stripMatRim);
  rimPanel.position.set(-7.8, 2.0, 5.2);
  rimPanel.lookAt(0, 0.5, 0);
  envScene.add(rimPanel);

  // 5. Front-on vertical strip softbox (creates twin highlight lines on hourglass headtube)
  const frontVerticalStrip = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 8.5), stripMatMain);
  frontVerticalStrip.position.set(9.5, 3.2, 0.0);
  frontVerticalStrip.lookAt(0, 0.6, 0);
  envScene.add(frontVerticalStrip);

  const envRT = pmrem.fromScene(envScene, 0.02);
  pmrem.dispose();
  return envRT.texture;
}

/**
 * Generates a high-resolution (2048x1024) Multi-Scale Contact Ambient Occlusion & Tire Grounding Texture.
 * Uses pixel-space radial gradients (radius 100 scaled smoothly) for zero Canvas quantization artifacts.
 */
function createMultiScaleContactShadowTexture() {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, width, height);

  const planeW = 2.70;
  const planeD = 1.40;
  const centerWorldX = 0.08;

  const worldToCanvasX = (wx) => ((wx - centerWorldX) / planeW + 0.5) * width;
  const worldToCanvasY = (wz) => (wz / planeD + 0.5) * height;
  const metersToPxX = (m) => (m / planeW) * width;
  const metersToPxY = (m) => (m / planeD) * height;

  const drawEllipticalShadow = (wx, wz, rxMeters, rzMeters, peakAlpha, innerStop = 0.18) => {
    const cx = worldToCanvasX(wx);
    const cy = worldToCanvasY(wz);
    const rx = Math.max(4, metersToPxX(rxMeters));
    const ry = Math.max(4, metersToPxY(rzMeters));

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(rx / 100, ry / 100);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 100);
    grad.addColorStop(0.0, `rgba(2, 3, 5, ${peakAlpha})`);
    grad.addColorStop(innerStop, `rgba(2, 3, 5, ${peakAlpha * 0.90})`);
    grad.addColorStop(0.48, `rgba(3, 4, 7, ${peakAlpha * 0.46})`);
    grad.addColorStop(0.78, `rgba(4, 5, 8, ${peakAlpha * 0.14})`);
    grad.addColorStop(1.0, 'rgba(4, 5, 8, 0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 100, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // Layer 1: Broad Under-Bike Studio Floor Ambient Bounce Occlusion across the 990mm wheelbase
  drawEllipticalShadow(0.09, 0.0, 0.92, 0.34, 0.28, 0.22);
  drawEllipticalShadow(0.07, 0.0, 0.60, 0.18, 0.32, 0.20);

  // Layer 2: T47 Bottom Bracket, 48/35T Crankset & Lower Chainstay Ambient Shadow
  drawEllipticalShadow(0.01, 0.02, 0.26, 0.13, 0.42, 0.18);
  drawEllipticalShadow(-0.20, 0.01, 0.24, 0.10, 0.30, 0.18);

  // Layer 3: Rear & Front Wheel Lower-Arc Occlusion + Deep Tire Contact Patch Grounding
  [-0.4023, 0.5877].forEach((wheelX) => {
    // 3a. Wide soft wheel-arch ambient shadow (cast by the 65mm deep Scope Artech rim & tire lower quadrant)
    drawEllipticalShadow(wheelX, 0.0, 0.38, 0.15, 0.46, 0.18);
    // 3b. Medium tire & cradle bounce occlusion
    drawEllipticalShadow(wheelX, 0.0, 0.20, 0.078, 0.74, 0.24);
    // 3c. Tight tire-tread + titanium cradle contact shadow
    drawEllipticalShadow(wheelX, 0.0, 0.11, 0.042, 0.94, 0.34);
    // 3d. Pitch-black 0mm contact crease directly beneath the 30c tire patch & cradle base
    drawEllipticalShadow(wheelX, 0.0, 0.068, 0.024, 1.0, 0.48);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 16;
  return tex;
}

/**
 * Custom Shader for the Roughness-Blurred & Radially Vignetted Plinth Planar Reflector
 */
const PlinthReflectorShader = {
  name: 'PlinthReflectorShader',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    uOpacity: { value: 0.13 },
    uBlurScale: { value: 0.0035 },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec2 vLocalXY;

    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vLocalXY = position.xy;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float uOpacity;
    uniform float uBlurScale;
    varying vec4 vUv;
    varying vec2 vLocalXY;

    void main() {
      float rNorm = length(vLocalXY) / 1.42;
      float radialFade = smoothstep(1.0, 0.32, rNorm);
      if (radialFade <= 0.001 || uOpacity <= 0.001) discard;

      vec2 projUv = vUv.xy / max(0.0001, vUv.w);
      vec3 sum = texture2D(tDiffuse, projUv).rgb * 0.24;
      float s = uBlurScale;
      sum += texture2D(tDiffuse, projUv + vec2( s,  0.0)).rgb * 0.12;
      sum += texture2D(tDiffuse, projUv + vec2(-s,  0.0)).rgb * 0.12;
      sum += texture2D(tDiffuse, projUv + vec2( 0.0,  s)).rgb * 0.12;
      sum += texture2D(tDiffuse, projUv + vec2( 0.0, -s)).rgb * 0.12;
      sum += texture2D(tDiffuse, projUv + vec2( s * 0.75,  s * 0.75)).rgb * 0.07;
      sum += texture2D(tDiffuse, projUv + vec2(-s * 0.75,  s * 0.75)).rgb * 0.07;
      sum += texture2D(tDiffuse, projUv + vec2( s * 0.75, -s * 0.75)).rgb * 0.07;
      sum += texture2D(tDiffuse, projUv + vec2(-s * 0.75, -s * 0.75)).rgb * 0.07;

      gl_FragColor = vec4(sum * color, uOpacity * radialFade);
    }
  `,
};

/**
 * Creates the Museum Exhibition Plinth, Planar Floor Reflection, 3-Tier Shadow System, and Multi-Light Rig
 */
export function createMuseumEnvironment(scene, renderer) {
  const envGroup = new THREE.Group();
  envGroup.name = 'MuseumEnvironment';
  scene.add(envGroup);

  // ============================================================================
  // 1. ARCHITECTURAL MUSEUM PLINTH / PEDESTAL & STAND
  // ============================================================================
  const stoneCanvas = document.createElement('canvas');
  stoneCanvas.width = 256;
  stoneCanvas.height = 256;
  const sCtx = stoneCanvas.getContext('2d');
  const sImg = sCtx.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) {
    const idx = i * 4;
    const n1 = Math.sin(i * 12.9898) * 43758.5453;
    const r = n1 - Math.floor(n1);
    sImg.data[idx] = 124 + Math.floor(r * 8);
    sImg.data[idx + 1] = 124 + Math.floor((1 - r) * 8);
    sImg.data[idx + 2] = 255;
    sImg.data[idx + 3] = 255;
  }
  sCtx.putImageData(sImg, 0, 0);
  const stoneNormal = new THREE.CanvasTexture(stoneCanvas);
  stoneNormal.wrapS = THREE.RepeatWrapping;
  stoneNormal.wrapT = THREE.RepeatWrapping;
  stoneNormal.repeat.set(18, 18);

  const plinthTopMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#090a0d'),
    normalMap: stoneNormal,
    normalScale: new THREE.Vector2(0.10, 0.10),
    roughness: 0.54,
    metalness: 0.08,
    clearcoat: 0.14,
    clearcoatRoughness: 0.38,
    envMapIntensity: 0.32,
  });

  const plinthBodyMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#07080b'),
    roughness: 0.62,
    metalness: 0.18,
  });

  // Main upper exhibition stage platform (top surface right at Y = 0.0)
  const stageGeom = new THREE.CylinderGeometry(1.45, 1.50, 0.048, 96);
  const stageMesh = new THREE.Mesh(stageGeom, plinthTopMat);
  stageMesh.position.set(0.08, -0.024, 0);
  stageMesh.receiveShadow = true;
  envGroup.add(stageMesh);

  // Recessed LED perimeter light channel ring around the plinth
  const ledStripMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ff9a44'),
  });
  const ledRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.465, 0.0035, 12, 96).rotateX(Math.PI / 2),
    ledStripMat
  );
  ledRing.position.set(0.08, -0.048, 0);
  envGroup.add(ledRing);

  // Lower monolith base tier
  const baseTier = new THREE.Mesh(
    new THREE.CylinderGeometry(1.52, 1.58, 0.08, 96),
    plinthBodyMat
  );
  baseTier.position.set(0.08, -0.088, 0);
  baseTier.receiveShadow = true;
  envGroup.add(baseTier);

  // Wide surrounding museum gallery / studio cyclorama floor
  const floorMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#060709'),
    normalMap: stoneNormal,
    normalScale: new THREE.Vector2(0.05, 0.05),
    roughness: 0.58,
    metalness: 0.06,
    envMapIntensity: 0.30,
  });
  const galleryFloor = new THREE.Mesh(new THREE.CircleGeometry(18, 64).rotateX(-Math.PI / 2), floorMat);
  galleryFloor.position.set(0, -0.128, 0);
  galleryFloor.receiveShadow = true;
  envGroup.add(galleryFloor);

  // ============================================================================
  // 2. PLANAR ROUGHNESS-BLURRED PLINTH REFLECTOR + 3-TIER CONTACT & 4K SHADOWS
  // ============================================================================

  // 2.1 Subtle Satin-Stone Planar Floor Reflection (at Y = 0.0003)
  const reflectorGeom = new THREE.CircleGeometry(1.42, 64);
  const plinthReflector = new Reflector(reflectorGeom, {
    clipBias: 0.003,
    textureWidth: 1024,
    textureHeight: 1024,
    color: 0xcfd6e0,
    multisample: 2,
    shader: PlinthReflectorShader,
  });
  plinthReflector.rotation.x = -Math.PI / 2;
  plinthReflector.position.set(0.08, 0.0003, 0);
  plinthReflector.material.transparent = true;
  plinthReflector.material.depthWrite = false;
  envGroup.add(plinthReflector);

  // 2.2 Multi-Scale Contact Ambient Occlusion & Tire Grounding Pad (at Y = 0.0007)
  const contactShadowTex = createMultiScaleContactShadowTexture();
  const contactShadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowTex,
    transparent: true,
    opacity: 0.98,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const contactShadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(2.70, 1.40).rotateX(-Math.PI / 2),
    contactShadowMat
  );
  contactShadowPlane.position.set(0.08, 0.0007, 0);
  envGroup.add(contactShadowPlane);

  // 2.3 High-Contrast 4K Shadow Catcher Overlay (at Y = 0.0011)
  // Sized to radius 1.44m on the plinth in dark modes, or scaled to 3.5m in seamless Studio Cyclorama mode
  // so long shadows are never clipped!
  const shadowCatcherMat = new THREE.ShadowMaterial({
    color: new THREE.Color('#020306'),
    opacity: 0.68,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const shadowCatcherMesh = new THREE.Mesh(
    new THREE.CircleGeometry(1.44, 72).rotateX(-Math.PI / 2),
    shadowCatcherMat
  );
  shadowCatcherMesh.position.set(0.08, 0.0011, 0);
  shadowCatcherMesh.receiveShadow = true;
  envGroup.add(shadowCatcherMesh);

  // Minimalist Brushed-Titanium Low-Profile Museum Wheel Contact Cradles + 3D Tire Contact Occlusion Collar
  const standMat = new THREE.MeshStandardMaterial({
    color: '#20242c',
    metalness: 0.88,
    roughness: 0.24,
  });
  const tireCreviceMat = new THREE.MeshBasicMaterial({
    color: '#020305',
    transparent: true,
    opacity: 0.86,
  });
  [-0.4023, 0.5877].forEach((wheelX) => {
    const cradleBase = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.0035, 0.052), standMat);
    cradleBase.position.set(wheelX, 0.0018, 0.0);
    cradleBase.castShadow = true;
    cradleBase.receiveShadow = true;
    envGroup.add(cradleBase);

    // 3D Tire-to-Cradle Contact Shadow Meniscus (ensures deep grounding even at 0-11 deg grazing profile angles!)
    const meniscus = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.026, 0.009, 24).scale(2.2, 1.0, 0.82),
      tireCreviceMat
    );
    meniscus.position.set(wheelX, 0.0045, 0.0);
    envGroup.add(meniscus);

    // Subtle twin side chock lips cradling the 30c tire contact patch
    [-0.036, 0.036].forEach((dx) => {
      const chock = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.0065, 0.038), standMat);
      chock.position.set(wheelX + dx, 0.0048, 0.0);
      chock.rotation.z = dx > 0 ? 0.35 : -0.35;
      chock.castShadow = true;
      chock.receiveShadow = true;
      envGroup.add(chock);
    });
  });

  // Museum Engraved Brass/Titanium Plaque on the front edge of the plinth (+Z side)
  const plaqueCanvas = document.createElement('canvas');
  plaqueCanvas.width = 512;
  plaqueCanvas.height = 128;
  const pCtx = plaqueCanvas.getContext('2d');
  pCtx.fillStyle = '#181a20';
  pCtx.fillRect(0, 0, 512, 128);
  pCtx.strokeStyle = 'rgba(235, 211, 167, 0.45)';
  pCtx.lineWidth = 3;
  pCtx.strokeRect(6, 6, 500, 116);
  pCtx.fillStyle = '#ebd3a7';
  pCtx.font = '700 24px "Syne", sans-serif';
  pCtx.textAlign = 'center';
  pCtx.fillText('ARGON 18 — NITROGEN PRO', 256, 50);
  pCtx.fillStyle = '#9aa3b2';
  pCtx.font = '500 15px "JetBrains Mono", monospace';
  pCtx.fillText('SRAM RED AXS E1 // SCOPE ARTECH 6.A+ // 6.88 KG', 256, 86);

  const plaqueTex = new THREE.CanvasTexture(plaqueCanvas);
  plaqueTex.colorSpace = THREE.SRGBColorSpace;
  const plaqueMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.065, 0.006),
    new THREE.MeshStandardMaterial({ map: plaqueTex, metalness: 0.6, roughness: 0.3 })
  );
  plaqueMesh.position.set(0.08, -0.022, 1.47);
  plaqueMesh.rotation.x = -0.35;
  envGroup.add(plaqueMesh);

  // ============================================================================
  // 3. MULTI-LIGHT STUDIO, MUSEUM & SOLAR RIG (4096x4096 Wide-Frustum Shadows)
  // ============================================================================
  const ambientLight = new THREE.AmbientLight('#141318', 0.45);
  scene.add(ambientLight);

  // Primary Directional Sun / Key Light (4096x4096 Ultra-Res Shadow Map with wide 4.4m frustum so long shadows never clip!)
  const keyLight = new THREE.DirectionalLight('#ffc282', 4.6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 4096;
  keyLight.shadow.mapSize.height = 4096;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 11.0;
  const d = 2.20;
  keyLight.shadow.camera.left = -d;
  keyLight.shadow.camera.right = d;
  keyLight.shadow.camera.top = d;
  keyLight.shadow.camera.bottom = -d;
  keyLight.shadow.bias = -0.00012;
  keyLight.shadow.normalBias = 0.0025;
  keyLight.shadow.radius = 2.4;
  keyLight.target.position.set(0.08, 0.28, 0);
  scene.add(keyLight);
  scene.add(keyLight.target);

  // Overhead Museum Gallery Spotlight (2048x2048 downward pool & under-frame shadow)
  const museumSpot = new THREE.SpotLight('#ffe3be', 3.2);
  museumSpot.position.set(0.08, 3.25, 0.35);
  museumSpot.target.position.set(0.08, 0.32, 0);
  museumSpot.angle = Math.PI / 3.2;
  museumSpot.penumbra = 0.88;
  museumSpot.decay = 1.35;
  museumSpot.distance = 9.0;
  museumSpot.castShadow = true;
  museumSpot.shadow.mapSize.width = 2048;
  museumSpot.shadow.mapSize.height = 2048;
  museumSpot.shadow.camera.near = 1.2;
  museumSpot.shadow.camera.far = 6.0;
  museumSpot.shadow.bias = -0.00008;
  museumSpot.shadow.normalBias = 0.0022;
  museumSpot.shadow.radius = 3.0;
  scene.add(museumSpot);
  scene.add(museumSpot.target);

  // Fill Light (neutral studio balance)
  const fillLight = new THREE.DirectionalLight('#8a99ad', 0.52);
  fillLight.position.set(-2.5, 1.8, -2.2);
  scene.add(fillLight);

  // Rim / Backlight (catches Kamm-tail carbon edges & tire silhouettes)
  const rimLight = new THREE.DirectionalLight('#ff926b', 2.5);
  rimLight.position.set(-2.2, 1.4, 2.4);
  scene.add(rimLight);

  const envMapCache = new Map();
  let currentPresetKey = 'evening';
  let currentAzimuthDeg = 38;

  const updateSunPosition = (azimuthDeg, elevationDeg) => {
    currentAzimuthDeg = azimuthDeg;
    const azRad = THREE.MathUtils.degToRad(azimuthDeg);
    const elRad = THREE.MathUtils.degToRad(elevationDeg);
    const radius = 4.4;

    const y = Math.sin(elRad) * radius;
    const hRadius = Math.cos(elRad) * radius;
    const x = 0.08 + Math.sin(azRad) * hRadius;
    const z = Math.cos(azRad) * hRadius;

    keyLight.position.set(x, y, z);

    rimLight.position.set(
      0.08 - Math.sin(azRad + 0.5) * 3.4,
      1.35,
      -Math.cos(azRad + 0.5) * 3.4
    );
    fillLight.position.set(
      0.08 + Math.sin(azRad - 1.8) * 3.0,
      1.7,
      Math.cos(azRad - 1.8) * 3.0
    );
  };

  const applyPreset = (presetKey, customAzimuthDeg) => {
    const preset = LIGHTING_PRESETS[presetKey] || LIGHTING_PRESETS.evening;
    currentPresetKey = presetKey;

    if (!envMapCache.has(presetKey)) {
      envMapCache.set(presetKey, buildProceduralEnvMap(renderer, preset));
    }
    scene.environment = envMapCache.get(presetKey);
    scene.background = new THREE.Color(preset.bgBottom);
    scene.fog = new THREE.FogExp2(preset.fogColor, preset.isLightTheme ? 0.025 : 0.075);

    keyLight.color.set(preset.keyColor);
    keyLight.intensity = preset.keyIntensity;
    fillLight.color.set(preset.fillColor);
    fillLight.intensity = preset.fillIntensity;
    rimLight.color.set(preset.rimColor);
    rimLight.intensity = preset.rimIntensity;
    museumSpot.color.set(preset.spotColor);
    museumSpot.intensity = preset.spotIntensity;
    ambientLight.color.set(preset.ambientColor);
    ambientLight.intensity = preset.ambientIntensity;
    ledStripMat.color.set(preset.plinthStripColor);

    shadowCatcherMat.opacity = preset.shadowOpacity;
    contactShadowMat.opacity = preset.contactOpacity;
    if (plinthReflector.material?.uniforms?.uOpacity) {
      plinthReflector.material.uniforms.uOpacity.value = preset.reflectOpacity;
    }

    // Seamless White Infinity Cove in Daylight Studio mode vs Honed Basalt Plinth in Dark modes
    if (preset.isLightTheme) {
      stageMesh.visible = false;
      baseTier.visible = false;
      ledRing.visible = false;
      plaqueMesh.visible = false;
      floorMat.color.set('#f2f5f9');
      floorMat.roughness = 0.82;
      galleryFloor.position.y = 0.0;
      shadowCatcherMesh.scale.set(2.4, 2.4, 1.0);
      document.body.classList.add('theme-light');
    } else {
      stageMesh.visible = true;
      baseTier.visible = true;
      ledRing.visible = true;
      plaqueMesh.visible = true;
      plinthTopMat.color.set('#090a0d');
      plinthBodyMat.color.set('#07080b');
      floorMat.color.set('#050608');
      floorMat.roughness = 0.58;
      galleryFloor.position.y = -0.128;
      shadowCatcherMesh.scale.set(1.0, 1.0, 1.0);
      document.body.classList.remove('theme-light');
    }

    renderer.toneMappingExposure = preset.exposure;
    const az = customAzimuthDeg !== undefined ? customAzimuthDeg : currentAzimuthDeg;
    updateSunPosition(az, preset.keyElevationDeg);

    return preset;
  };

  const setSunAzimuth = (azimuthDeg) => {
    const preset = LIGHTING_PRESETS[currentPresetKey] || LIGHTING_PRESETS.evening;
    updateSunPosition(azimuthDeg, preset.keyElevationDeg);
  };

  applyPreset('evening', 38);

  return {
    envGroup,
    applyPreset,
    setSunAzimuth,
    getCurrentPreset: () => LIGHTING_PRESETS[currentPresetKey],
  };
}
