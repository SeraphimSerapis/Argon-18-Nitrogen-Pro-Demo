import * as THREE from 'three';

/**
 * Procedural Ultra-High-Resolution PBR Texture & Normal Map Suite
 * Crafted specifically for the Argon 18 Nitrogen Pro (SRAM RED AXS / Scope Artech 6.A+)
 */

// Seeded deterministic PRNG for crisp, repeatable metallic flakes
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 1. Aurora Charcoal Metallic Micro-Flake Normal & Sparkle Roughness Maps
 * Produces millions of micro-facets under the clearcoat that glint in directional sunbeams.
 */
export function createMetallicFlakeMaps() {
  const size = 512;
  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = size;
  normalCanvas.height = size;
  const nCtx = normalCanvas.getContext('2d');

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d');

  const nImg = nCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);
  const nData = nImg.data;
  const rData = rImg.data;

  const rand = mulberry32(18383);

  // Base flat normal + mid roughness
  for (let i = 0; i < size * size; i++) {
    const idx = i * 4;
    nData[idx] = 128;
    nData[idx + 1] = 128;
    nData[idx + 2] = 255;
    nData[idx + 3] = 255;

    const baseR = 68 + Math.floor((rand() - 0.5) * 14);
    rData[idx] = baseR;
    rData[idx + 1] = baseR;
    rData[idx + 2] = baseR;
    rData[idx + 3] = 255;
  }

  // Scatter 42,000 micro-flakes (1-2px metallic crystals with tilted normals)
  const flakeCount = 42000;
  for (let f = 0; f < flakeCount; f++) {
    const cx = Math.floor(rand() * size);
    const cy = Math.floor(rand() * size);
    const angle = rand() * Math.PI * 2;
    // Tilt up to ~28 degrees so grazing sunbeams ignite bright specular glints
    const tilt = 0.18 + Math.pow(rand(), 1.6) * 0.65;
    const nx = Math.cos(angle) * tilt;
    const ny = Math.sin(angle) * tilt;
    const nz = Math.sqrt(Math.max(0.1, 1 - nx * nx - ny * ny));

    const rByte = Math.min(255, Math.max(0, Math.floor((nx * 0.5 + 0.5) * 255)));
    const gByte = Math.min(255, Math.max(0, Math.floor((ny * 0.5 + 0.5) * 255)));
    const bByte = Math.min(255, Math.max(0, Math.floor(nz * 255)));

    // Low roughness on the crystal facet so it sparkles sharply
    const flakeRough = 12 + Math.floor(rand() * 28);
    const radius = rand() > 0.72 ? 2 : 1;

    for (let dy = 0; dy < radius; dy++) {
      for (let dx = 0; dx < radius; dx++) {
        const x = (cx + dx) % size;
        const y = (cy + dy) % size;
        const p = (y * size + x) * 4;
        nData[p] = rByte;
        nData[p + 1] = gByte;
        nData[p + 2] = bByte;
        rData[p] = flakeRough;
        rData[p + 1] = flakeRough;
        rData[p + 2] = flakeRough;
      }
    }
  }

  nCtx.putImageData(nImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  const normalMap = new THREE.CanvasTexture(normalCanvas);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(14, 14);

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(14, 14);

  return { normalMap, roughnessMap };
}

/**
 * 2. 3K Twill & Unidirectional Carbon Fiber Weave Maps
 */
export function createCarbonWeaveMaps() {
  const size = 256;
  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = size;
  normalCanvas.height = size;
  const nCtx = normalCanvas.getContext('2d');

  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const aCtx = albedoCanvas.getContext('2d');

  const nImg = nCtx.createImageData(size, size);
  const aImg = aCtx.createImageData(size, size);
  const cell = 8; // 2x2 twill repeat

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const gx = Math.floor(x / cell);
      const gy = Math.floor(y / cell);
      const lx = (x % cell) / cell;
      const ly = (y % cell) / cell;

      const isWarp = (gx + gy) % 2 === 0;
      let nx = 0;
      let ny = 0;
      let shade = 18;

      if (isWarp) {
        nx = Math.sin((lx - 0.5) * Math.PI) * 0.22;
        ny = (ly - 0.5) * 0.06;
        shade = 16 + Math.cos((lx - 0.5) * Math.PI) * 14;
      } else {
        nx = (lx - 0.5) * 0.06;
        ny = Math.sin((ly - 0.5) * Math.PI) * 0.22;
        shade = 12 + Math.cos((ly - 0.5) * Math.PI) * 12;
      }

      nImg.data[idx] = Math.floor((nx * 0.5 + 0.5) * 255);
      nImg.data[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
      nImg.data[idx + 2] = 248;
      nImg.data[idx + 3] = 255;

      aImg.data[idx] = shade;
      aImg.data[idx + 1] = shade + 1;
      aImg.data[idx + 2] = shade + 2;
      aImg.data[idx + 3] = 255;
    }
  }

  nCtx.putImageData(nImg, 0, 0);
  aCtx.putImageData(aImg, 0, 0);

  const normalMap = new THREE.CanvasTexture(normalCanvas);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(24, 24);

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(24, 24);
  map.colorSpace = THREE.SRGBColorSpace;

  return { map, normalMap };
}

/**
 * 3. ATTEN x Scope Artech 6.A+ Wheel Rim Texture & Biomimetic Aeroscale (Fish-Scale) Normal Map
 * Maps onto a LatheGeometry or Ring/Torus UV where U = circumference [0..1], V = radial profile [0..1].
 */
export function createScopeWheelMaps() {
  const width = 2048;
  const height = 512;

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = width;
  colorCanvas.height = height;
  const ctx = colorCanvas.getContext('2d');

  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = width;
  normalCanvas.height = height;
  const nCtx = normalCanvas.getContext('2d');

  // Base carbon dark anthracite fill
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0.0, '#101215');
  grad.addColorStop(0.25, '#191c21');
  grad.addColorStop(0.5, '#121418');
  grad.addColorStop(0.75, '#191c21');
  grad.addColorStop(1.0, '#0f1013');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Neutral normal base
  nCtx.fillStyle = 'rgb(128, 128, 255)';
  nCtx.fillRect(0, 0, width, height);

  // Draw Scope Artech 6.A+ Biomimetic Fish-Scale ("Aeroscale") pattern across the rim flanks!
  // On our rim LatheGeometry, V=0..0.44 is right flank, V=0.56..1.0 is left flank, V=0.44..0.56 is inner nose
  const cols = 128; // scales around circumference
  const rows = 14;  // scale rows radially
  const scaleW = width / cols;
  const scaleH = (height * 0.42) / rows;

  const drawAeroscaleBand = (vStart, vEnd, flipDir) => {
    const y0 = vStart * height;
    const bandH = (vEnd - vStart) * height;
    const rCount = rows;
    const rowH = bandH / rCount;

    for (let r = 0; r < rCount; r++) {
      const cy = y0 + (r + 0.5) * rowH;
      const offset = (r % 2) * 0.5 * scaleW;

      for (let c = -1; c <= cols; c++) {
        const cx = c * scaleW + offset;

        // Subtle carbon weave / scale sheen in color map
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(cx, cy, scaleW * 0.52, rowH * 0.68, 0, 0, Math.PI * 2);
        ctx.fillStyle = (r + c) % 2 === 0 ? 'rgba(255,255,255,0.032)' : 'rgba(0,0,0,0.16)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.055)';
        ctx.lineWidth = 1.1;
        ctx.stroke();
        ctx.restore();

        // Normal map emboss for each biomimetic scale
        const nGrad = nCtx.createLinearGradient(
          cx - scaleW * 0.45,
          cy - rowH * 0.5 * flipDir,
          cx + scaleW * 0.45,
          cy + rowH * 0.5 * flipDir
        );
        nGrad.addColorStop(0.0, 'rgb(108, 108, 255)');
        nGrad.addColorStop(0.5, 'rgb(128, 128, 255)');
        nGrad.addColorStop(1.0, 'rgb(152, 152, 255)');

        nCtx.save();
        nCtx.beginPath();
        nCtx.ellipse(cx, cy, scaleW * 0.48, rowH * 0.62, 0, 0, Math.PI * 2);
        nCtx.fillStyle = nGrad;
        nCtx.fill();
        nCtx.restore();
      }
    }
  };

  drawAeroscaleBand(0.04, 0.44, 1);
  drawAeroscaleBand(0.56, 0.96, -1);

  // Helper to stamp rim decals on both non-drive flank (v ~ 0.24) and drive-side flank (v ~ 0.76)
  const stampBothFlanks = (uPos, drawCallback) => {
    const x = ((uPos % 1) + 1) % 1 * width;
    // Non-drive (-Z) flank: outer bead is at canvas top (v=0)
    ctx.save();
    ctx.translate(x, height * 0.24);
    drawCallback(ctx, false);
    ctx.restore();

    // Drive (+Z) flank: outer bead is at canvas bottom (v=1), clockwise is -x
    ctx.save();
    ctx.translate(x, height * 0.76);
    ctx.scale(-1, -1);
    drawCallback(ctx, true);
    ctx.restore();
  };

  // 1. Top (12 o'clock, u = 0.25): Iconic underlined "A" (ATTEN emblem)
  stampBothFlanks(0.25, (c) => {
    c.fillStyle = '#f4f6f9';
    c.font = '800 54px "Syne", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('A', 0, -6);
    // Underline bar under the A
    c.fillRect(-18, 22, 36, 4.5);
  });

  // 2. Bottom (6 o'clock, u = 0.75): Matte black rectangle patch + vertical "ATTEN" wordmark
  stampBothFlanks(0.75, (c) => {
    c.fillStyle = 'rgba(8, 9, 11, 0.92)';
    c.fillRect(-34, -85, 68, 170);
    c.save();
    c.rotate(-Math.PI / 2);
    c.fillStyle = '#eef1f6';
    c.font = '700 26px "JetBrains Mono", sans-serif';
    c.letterSpacing = '4px';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('ATTEN', 0, 0);
    c.restore();
  });

  // 3. Two "SCOPE" wordmarks at u = 0.42 (~10 o'clock) and u = 0.92 (~4 o'clock)
  const drawScopeLogo = (c) => {
    c.save();
    c.transform(1, 0, -0.28, 1, 0, 0); // sleek aerodynamic forward slant
    c.fillStyle = '#f2f4f8';
    c.font = '800 44px "Syne", sans-serif';
    c.letterSpacing = '8px';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('SCOPE', 0, 0);
    c.restore();
  };

  stampBothFlanks(0.42, drawScopeLogo);
  stampBothFlanks(0.92, drawScopeLogo);

  // 4. Micro technical callout at u = 0.58 ("ARTECH 6.A+ // ATTEN BY SCOPE")
  stampBothFlanks(0.58, (c) => {
    c.fillStyle = 'rgba(235, 240, 248, 0.72)';
    c.font = '600 13px "JetBrains Mono", monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('ARTECH 6.A+', 0, -8);
    c.fillText('ATTEN BY SCOPE', 0, 9);
  });

  const map = new THREE.CanvasTexture(colorCanvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 16;

  const normalMap = new THREE.CanvasTexture(normalCanvas);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.ClampToEdgeWrapping;
  normalMap.anisotropy = 16;

  return { map, normalMap };
}

/**
 * 4. Vittoria Corsa Pro TLR 30c Cotton Tan-Wall Tire Texture & Tread Normal Map
 * For a TorusGeometry: U = around wheel circumference [0..1], V = around tube cross-section [0..1].
 */
export function createVittoriaTireMaps() {
  const width = 2048;
  const height = 512;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const nCanvas = document.createElement('canvas');
  nCanvas.width = width;
  nCanvas.height = height;
  const nCtx = nCanvas.getContext('2d');

  // In Three.js TorusGeometry, V=0 / V=1 is outer equator (or inner depending on phi),
  // Let's inspect TorusGeometry UV:
  // v = j / radialSegments where phi = j / radialSegments * 2 * PI.
  // centerX = (R + r * cos(phi)) * cos(u), so:
  // phi = 0 (v=0 and v=1): r*cos(0) = +r -> OUTERMOST TREAD CROWN!
  // phi = PI (v=0.5): r*cos(PI) = -r -> INNERMOST RIM BED!
  // phi = PI/2 (v=0.25) and phi = 3*PI/2 (v=0.75): SIDEWALLS (+Z and -Z)!
  // That's a super important mathematical fact about THREE.TorusGeometry!
  // Let's paint the V profile accordingly:
  // - Tread crown: v in [0.0, 0.16] and [0.84, 1.0] -> vulcanized black tread (#151619)
  // - Tan sidewalls: v in [0.16, 0.42] and [0.58, 0.84] -> warm Para cotton tan (#d8b574)
  // - Inner bead: v in [0.42, 0.58] -> dark bead (#1a1917)

  const vGrad = ctx.createLinearGradient(0, 0, 0, height);
  vGrad.addColorStop(0.0, '#141619');
  vGrad.addColorStop(0.14, '#17191c');
  vGrad.addColorStop(0.165, '#cfa968');
  vGrad.addColorStop(0.26, '#DFBE82'); // Warm Cotton Para Tan peak
  vGrad.addColorStop(0.39, '#c7a05e');
  vGrad.addColorStop(0.43, '#1e1b18');
  vGrad.addColorStop(0.57, '#1e1b18');
  vGrad.addColorStop(0.61, '#c7a05e');
  vGrad.addColorStop(0.74, '#DFBE82'); // Warm Cotton Para Tan peak
  vGrad.addColorStop(0.835, '#cfa968');
  vGrad.addColorStop(0.86, '#17191c');
  vGrad.addColorStop(1.0, '#141619');

  ctx.fillStyle = vGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle diagonal cotton-casing thread lines on the tan sidewalls
  ctx.strokeStyle = 'rgba(90, 62, 22, 0.08)';
  ctx.lineWidth = 1.5;
  for (let x = -height; x < width + height; x += 8) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + height, height);
    ctx.stroke();
  }
  // Re-mask the black tread center so cotton lines only stay on the tan sidewalls
  ctx.fillStyle = '#141619';
  ctx.fillRect(0, 0, width, height * 0.145);
  ctx.fillRect(0, height * 0.855, width, height * 0.145);

  // Stamp "vittoria" at 12 o'clock (u = 0.25) and "vittoria CORSA PRO" at 6 o'clock (u = 0.75) on both sidewalls (v=0.25 and v=0.75)
  const stampSidewallPatch = (uPos, textMain, textSub, hasColorStripe) => {
    const x = uPos * width;
    [0.25, 0.75].forEach((vPos, idx) => {
      ctx.save();
      ctx.translate(x, vPos * height);
      if (idx === 1) ctx.scale(-1, -1);

      // Italian tricolor / Vittoria accent dash
      if (hasColorStripe) {
        ctx.fillStyle = '#e50019';
        ctx.fillRect(-95, -5, 14, 4);
        ctx.fillStyle = '#f5a623';
        ctx.fillRect(-79, -5, 10, 4);
      }

      ctx.fillStyle = '#18181a';
      ctx.font = 'italic 800 18px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(textMain, 0, 0);

      if (textSub) {
        ctx.fillStyle = '#c4122f';
        ctx.font = '700 13px "JetBrains Mono", sans-serif';
        ctx.fillText(textSub, 88, 0);
      }
      ctx.restore();
    });
  };

  stampSidewallPatch(0.25, 'vittoria', '', true);
  stampSidewallPatch(0.75, 'vittoria  CORSA PRO', 'TLR 30c', true);

  // Normal map: longitudinal micro-siping grooves on the Vittoria Corsa Pro tread crown
  nCtx.fillStyle = 'rgb(128, 128, 255)';
  nCtx.fillRect(0, 0, width, height);

  const grooveRows = [0.02, 0.045, 0.07, 0.095, 0.12, 0.88, 0.905, 0.93, 0.955, 0.98];
  grooveRows.forEach((vr) => {
    const y = vr * height;
    nCtx.fillStyle = 'rgb(128, 96, 245)';
    nCtx.fillRect(0, y - 1.5, width, 1.5);
    nCtx.fillStyle = 'rgb(128, 160, 245)';
    nCtx.fillRect(0, y, width, 1.5);
  });

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 16;

  const normalMap = new THREE.CanvasTexture(nCanvas);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.anisotropy = 16;

  return { map, normalMap };
}

/**
 * 5. Argon 18 Nitrogen Pro Frame & Component Decal Textures
 * - Downtube Holographic Sliced "ARGON 18" Logo
 * - Top Tube "NITROGEN PRO" + Holographic Prism Band
 * - Head Tube Molecular Cluster Emblem
 * - SRAM RED AXS Crankset & Chainring Graphics
 */
export function createFrameDecalTextures() {
  // Helper for Argon 18 molecular cluster icon
  const drawMolecule = (c, mx, my, scale, color) => {
    c.save();
    c.translate(mx, my);
    c.scale(scale, scale);
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = 2.6;
    const pts = [
      [0, -14, 4.5],
      [0, 0, 5.5],
      [-12, 10, 4.5],
      [12, 8, 4.5],
    ];
    c.beginPath();
    c.moveTo(0, -14);
    c.lineTo(0, 0);
    c.lineTo(-12, 10);
    c.moveTo(0, 0);
    c.lineTo(12, 8);
    c.stroke();
    pts.forEach(([px, py, r]) => {
      c.beginPath();
      c.arc(px, py, r, 0, Math.PI * 2);
      c.fill();
    });
    c.restore();
  };

  // A. Downtube "ARGON 18" Holographic Sliced Speed Logo (matches cages.jpg & profil.png)
  const dtCanvas = document.createElement('canvas');
  dtCanvas.width = 2048;
  dtCanvas.height = 384;
  const dtCtx = dtCanvas.getContext('2d');

  dtCtx.clearRect(0, 0, dtCanvas.width, dtCanvas.height);

  // Iridescent Aurora gradient (Rose -> Champagne Gold -> Icy Cyan -> Sky Blue)
  const holoGrad = dtCtx.createLinearGradient(160, 0, 1888, 120);
  holoGrad.addColorStop(0.0, '#d89ec6');
  holoGrad.addColorStop(0.22, '#edd5a8');
  holoGrad.addColorStop(0.5, '#c6e6dc');
  holoGrad.addColorStop(0.78, '#7ce6f7');
  holoGrad.addColorStop(1.0, '#9fc8f9');

  dtCtx.save();
  dtCtx.fillStyle = holoGrad;
  // Sized with generous horizontal margin so the leading 'A' and trailing '8' are never clipped
  dtCtx.font = '800 198px "Syne", "Arial Black", sans-serif';
  dtCtx.textAlign = 'center';
  dtCtx.textBaseline = 'middle';
  // Slight forward italic shear like official Argon 18 typography
  dtCtx.transform(1, 0, -0.16, 1, dtCanvas.width * 0.51, dtCanvas.height * 0.52);
  dtCtx.fillText('ARGON 18', 0, 0);
  dtCtx.restore();

  // Slice the lower 50% of the lettering with horizontal speed-line cutouts (exact match to cages.jpg!)
  dtCtx.globalCompositeOperation = 'destination-out';
  const startY = dtCanvas.height * 0.46;
  const endY = dtCanvas.height * 0.94;
  const stripeStep = 13;
  for (let y = startY; y < endY; y += stripeStep) {
    const progress = (y - startY) / (endY - startY);
    const cutH = 3.6 + progress * 4.2;
    dtCtx.fillRect(0, y, dtCanvas.width, cutH);
  }
  dtCtx.globalCompositeOperation = 'source-over';

  const downtubeLogoMap = new THREE.CanvasTexture(dtCanvas);
  downtubeLogoMap.colorSpace = THREE.SRGBColorSpace;
  downtubeLogoMap.anisotropy = 16;

  // B. Conformed 3D Top Tube Wrap Decal (Matches logo.jpg & 34.png!)
  // UV Layout on conformed top-tube wrap:
  // - U (horizontal, 0..1024): runs along the top tube from Rear (x = -0.092 at u=0) to Front (x = +0.125 at u=1)
  // - V (vertical, 0..512): wraps across the top tube perimeter:
  //   - y = 256 (v = 0.50) is the TOP CENTER RIDGE of the top tube (where "NITROGEN PRO" sits in logo.jpg!)
  //   - y = 105 (v ≈ 0.79) is the DRIVE-SIDE (+Z) FLANK
  //   - y = 407 (v ≈ 0.21) is the NON-DRIVE-SIDE (-Z) FLANK
  const ttCanvas = document.createElement('canvas');
  ttCanvas.width = 1024;
  ttCanvas.height = 512;
  const ttCtx = ttCanvas.getContext('2d');
  ttCtx.clearRect(0, 0, ttCanvas.width, ttCanvas.height);

  // 1. Wide Iridescent Holographic Prism Band wrapping over the top ridge and down both side flanks (u ≈ 0.66..0.90)
  ttCtx.save();
  ttCtx.beginPath();
  ttCtx.moveTo(675, 16);
  ttCtx.lineTo(905, 16);
  ttCtx.lineTo(845, 496);
  ttCtx.lineTo(615, 496);
  ttCtx.closePath();

  const prismGrad = ttCtx.createLinearGradient(620, 0, 900, 512);
  prismGrad.addColorStop(0.0, '#78e6f8');
  prismGrad.addColorStop(0.28, '#d8a8dc');
  prismGrad.addColorStop(0.52, '#f4e2c6');
  prismGrad.addColorStop(0.76, '#b8ece4');
  prismGrad.addColorStop(1.0, '#78e6f8');
  ttCtx.fillStyle = prismGrad;
  ttCtx.fill();

  // Dark molecular cluster emblem on both side flanks inside the prism band (matches 34.png & profil.png)
  drawMolecule(ttCtx, 772, 118, 1.35, '#14161b');
  drawMolecule(ttCtx, 748, 394, 1.35, '#14161b');
  ttCtx.restore();

  // 2. "NITROGEN PRO" stencil lettering centered along the TOP RIDGE (y = 256) right behind the prism band (matches logo.jpg!)
  ttCtx.save();
  const textGrad = ttCtx.createLinearGradient(80, 230, 540, 280);
  textGrad.addColorStop(0.0, '#cddbe8');
  textGrad.addColorStop(0.6, '#b8e2ec');
  textGrad.addColorStop(1.0, '#dcbad8');
  ttCtx.fillStyle = textGrad;
  ttCtx.font = 'italic 700 44px "JetBrains Mono", sans-serif';
  ttCtx.textBaseline = 'middle';
  ttCtx.fillText('NITROGEN', 95, 260);

  // Superscript crisp metallic "PRO" stencil next to NITROGEN
  ttCtx.fillStyle = '#14171e';
  ttCtx.strokeStyle = 'rgba(220, 236, 250, 0.92)';
  ttCtx.lineWidth = 2.6;
  ttCtx.font = 'italic 800 27px "JetBrains Mono", sans-serif';
  ttCtx.strokeText('PRO', 462, 244);
  ttCtx.fillText('PRO', 462, 244);
  ttCtx.restore();

  const toptubeDecalMap = new THREE.CanvasTexture(ttCanvas);
  toptubeDecalMap.colorSpace = THREE.SRGBColorSpace;
  toptubeDecalMap.anisotropy = 16;

  // C. Head Tube Iridescent Molecular Emblem (matches front.jpg)
  const htCanvas = document.createElement('canvas');
  htCanvas.width = 256;
  htCanvas.height = 256;
  const htCtx = htCanvas.getContext('2d');
  htCtx.clearRect(0, 0, 256, 256);

  const mGrad = htCtx.createLinearGradient(60, 60, 196, 196);
  mGrad.addColorStop(0.0, '#7be6f8');
  mGrad.addColorStop(0.5, '#f2dcc0');
  mGrad.addColorStop(1.0, '#e09bc4');
  drawMolecule(htCtx, 128, 128, 3.6, mGrad);

  const headtubeLogoMap = new THREE.CanvasTexture(htCanvas);
  headtubeLogoMap.colorSpace = THREE.SRGBColorSpace;

  // D. Aero 5-Stripe Speed Graphic (Lower Fork & Dropped Seatstay Knee)
  const stripeCanvas = document.createElement('canvas');
  stripeCanvas.width = 256;
  stripeCanvas.height = 256;
  const sCtx = stripeCanvas.getContext('2d');
  sCtx.clearRect(0, 0, 256, 256);
  const sGrad = sCtx.createLinearGradient(0, 0, 256, 256);
  sGrad.addColorStop(0, '#8ae8f8');
  sGrad.addColorStop(0.5, '#ede0c8');
  sGrad.addColorStop(1, '#dc9ec4');
  sCtx.fillStyle = sGrad;
  for (let i = 0; i < 5; i++) {
    const y = 36 + i * 38;
    sCtx.fillRect(24, y, 208, 11);
  }
  const aeroStripesMap = new THREE.CanvasTexture(stripeCanvas);
  aeroStripesMap.colorSpace = THREE.SRGBColorSpace;

  // E. SRAM RED E1 Crank Arm Graphic (matches profil.png & cages.jpg)
  const crankCanvas = document.createElement('canvas');
  crankCanvas.width = 1024;
  crankCanvas.height = 256;
  const cCtx = crankCanvas.getContext('2d');
  cCtx.clearRect(0, 0, 1024, 256);

  // Sleek silver metallic double speed lines + "Red" wordmark
  cCtx.strokeStyle = 'rgba(232, 238, 246, 0.92)';
  cCtx.lineWidth = 4.5;
  cCtx.beginPath();
  // Upper & lower speed-line framing
  cCtx.moveTo(70, 108);
  cCtx.lineTo(410, 108);
  cCtx.moveTo(600, 108);
  cCtx.lineTo(900, 108);
  cCtx.moveTo(110, 148);
  cCtx.lineTo(900, 148);
  cCtx.stroke();

  cCtx.fillStyle = '#f5f7fb';
  cCtx.font = 'italic 800 66px "Syne", sans-serif';
  cCtx.textAlign = 'center';
  cCtx.textBaseline = 'middle';
  cCtx.fillText('Red', 505, 126);

  const sramRedCrankMap = new THREE.CanvasTexture(crankCanvas);
  sramRedCrankMap.colorSpace = THREE.SRGBColorSpace;
  sramRedCrankMap.anisotropy = 16;

  // F. High-Precision SRAM RED AXS E1 48/35T Direct-Mount Aero Chainring Map (matches cages.jpg!)
  const ringSize = 1024;
  const ringCanvas = document.createElement('canvas');
  ringCanvas.width = ringSize;
  ringCanvas.height = ringSize;
  const rCtx = ringCanvas.getContext('2d');
  const cx = ringSize * 0.5;
  const cy = ringSize * 0.5;
  rCtx.clearRect(0, 0, ringSize, ringSize);

  // 1. Inner 35T Chainring (radius 355px)
  rCtx.save();
  rCtx.translate(cx, cy);
  rCtx.fillStyle = '#b8c0cc';
  rCtx.beginPath();
  for (let i = 0; i < 35; i++) {
    const a0 = (i / 35) * Math.PI * 2;
    const a1 = ((i + 0.38) / 35) * Math.PI * 2;
    const a2 = ((i + 0.55) / 35) * Math.PI * 2;
    const a3 = ((i + 1.0) / 35) * Math.PI * 2;
    rCtx.lineTo(Math.cos(a0) * 336, Math.sin(a0) * 336);
    rCtx.lineTo(Math.cos(a1) * 362, Math.sin(a1) * 362);
    rCtx.lineTo(Math.cos(a2) * 362, Math.sin(a2) * 362);
    rCtx.lineTo(Math.cos(a3) * 336, Math.sin(a3) * 336);
  }
  rCtx.closePath();
  rCtx.fill();

  // Dark anodized inner 35T body
  rCtx.fillStyle = '#16181d';
  rCtx.beginPath();
  rCtx.arc(0, 0, 336, 0, Math.PI * 2);
  rCtx.fill();

  // 2. Outer 48T CNC Silver Tooth Ring (outer radius 496px, base 456px)
  const toothGrad = rCtx.createRadialGradient(0, 0, 445, 0, 0, 500);
  toothGrad.addColorStop(0.0, '#181a20');
  toothGrad.addColorStop(0.28, '#d8e0ec');
  toothGrad.addColorStop(0.75, '#f2f6fc');
  toothGrad.addColorStop(1.0, '#b8c2d0');
  rCtx.fillStyle = toothGrad;
  rCtx.beginPath();
  for (let i = 0; i < 48; i++) {
    const a0 = (i / 48) * Math.PI * 2;
    const a1 = ((i + 0.34) / 48) * Math.PI * 2;
    const a2 = ((i + 0.54) / 48) * Math.PI * 2;
    const a3 = ((i + 1.0) / 48) * Math.PI * 2;
    rCtx.lineTo(Math.cos(a0) * 458, Math.sin(a0) * 458);
    rCtx.lineTo(Math.cos(a1) * 498, Math.sin(a1) * 498);
    rCtx.lineTo(Math.cos(a2) * 498, Math.sin(a2) * 498);
    rCtx.lineTo(Math.cos(a3) * 458, Math.sin(a3) * 458);
  }
  rCtx.closePath();
  rCtx.fill();

  // Outer Aero Black Anodized Ring Body (radius 458px)
  const bodyGrad = rCtx.createRadialGradient(0, 0, 120, 0, 0, 458);
  bodyGrad.addColorStop(0.0, '#121418');
  bodyGrad.addColorStop(0.7, '#181b21');
  bodyGrad.addColorStop(1.0, '#101216');
  rCtx.fillStyle = bodyGrad;
  rCtx.beginPath();
  rCtx.arc(0, 0, 458, 0, Math.PI * 2);
  rCtx.fill();

  // Thin silver CNC machined step ring at r = 452px
  rCtx.strokeStyle = '#d8e0ec';
  rCtx.lineWidth = 3.5;
  rCtx.beginPath();
  rCtx.arc(0, 0, 452, 0, Math.PI * 2);
  rCtx.stroke();

  // 3. Punch out thethrough-holes (Transparent Cutouts!) so background & frame show through!
  rCtx.globalCompositeOperation = 'destination-out';
  // Center DUB spindle hole
  rCtx.beginPath();
  rCtx.arc(0, 0, 96, 0, Math.PI * 2);
  rCtx.fill();

  // 4 Large Outer Kidney/Trapezoidal Windows + 8 Inner Spider Relief Cutouts
  for (let k = 0; k < 4; k++) {
    const baseAng = (k / 4) * Math.PI * 2 + 0.18;
    // Outer ring window (between r=358 and r=425)
    rCtx.beginPath();
    rCtx.arc(0, 0, 422, baseAng + 0.14, baseAng + 1.12, false);
    rCtx.arc(0, 0, 360, baseAng + 1.06, baseAng + 0.20, true);
    rCtx.closePath();
    rCtx.fill();

    // Mid-ring window (between r=225 and r=312)
    rCtx.beginPath();
    rCtx.arc(0, 0, 310, baseAng + 0.18, baseAng + 1.05, false);
    rCtx.arc(0, 0, 222, baseAng + 0.98, baseAng + 0.25, true);
    rCtx.closePath();
    rCtx.fill();
  }
  rCtx.globalCompositeOperation = 'source-over';

  // 4. Signature SRAM RED E1 Silver CNC Machined Split-Spoke Diagonal Structural Ribs (matches cages.jpg!)
  for (let k = 0; k < 4; k++) {
    rCtx.save();
    const armAng = (k / 4) * Math.PI * 2 - 0.12;
    rCtx.rotate(armAng);

    // Bright brushed-silver outer bevel frame on each of the 4 aero structural arms
    const silGrad = rCtx.createLinearGradient(160, -80, 440, 80);
    silGrad.addColorStop(0.0, '#cfd8e4');
    silGrad.addColorStop(0.5, '#f4f8ff');
    silGrad.addColorStop(1.0, '#b8c2d0');

    // Leading silver rib with recessed dark slot
    rCtx.fillStyle = silGrad;
    rCtx.beginPath();
    rCtx.moveTo(175, -18);
    rCtx.lineTo(448, -56);
    rCtx.lineTo(451, -20);
    rCtx.lineTo(182, 10);
    rCtx.closePath();
    rCtx.fill();

    // Dark recessed CNC slot inside leading silver rib
    rCtx.fillStyle = '#121418';
    rCtx.beginPath();
    rCtx.moveTo(205, -11);
    rCtx.lineTo(432, -42);
    rCtx.lineTo(434, -30);
    rCtx.lineTo(208, -1);
    rCtx.closePath();
    rCtx.fill();

    // Trailing silver rib Joining at outer rim
    rCtx.fillStyle = silGrad;
    rCtx.beginPath();
    rCtx.moveTo(220, 24);
    rCtx.lineTo(445, 72);
    rCtx.lineTo(450, 38);
    rCtx.lineTo(228, -2);
    rCtx.closePath();
    rCtx.fill();

    // Dark recessed CNC slot inside trailing silver rib
    rCtx.fillStyle = '#121418';
    rCtx.beginPath();
    rCtx.moveTo(245, 19);
    rCtx.lineTo(428, 58);
    rCtx.lineTo(430, 47);
    rCtx.lineTo(248, 9);
    rCtx.closePath();
    rCtx.fill();

    rCtx.restore();
  }

  // 5. "SRAM | 48/35T | 12SPD" Pill Badge at 12 o'clock top of chainring (matches cages.jpg!)
  rCtx.save();
  rCtx.rotate(-0.08);
  rCtx.fillStyle = '#14161b';
  rCtx.strokeStyle = 'rgba(225, 232, 242, 0.78)';
  rCtx.lineWidth = 2.5;
  rCtx.beginPath();
  rCtx.roundRect(-84, -445, 168, 22, 11);
  rCtx.fill();
  rCtx.stroke();

  rCtx.fillStyle = '#eef2f8';
  rCtx.font = '800 13px "JetBrains Mono", sans-serif';
  rCtx.textAlign = 'center';
  rCtx.textBaseline = 'middle';
  rCtx.fillText('SRAM  48/35T  12SPD', 0, -434);
  rCtx.restore();

  // 6. Central Quarq AXS Spider Ring & Green LED indicator
  rCtx.strokeStyle = 'rgba(220, 228, 240, 0.45)';
  rCtx.lineWidth = 3;
  rCtx.beginPath();
  rCtx.arc(0, 0, 172, 0, Math.PI * 2);
  rCtx.stroke();

  rCtx.fillStyle = '#00ff88';
  rCtx.beginPath();
  rCtx.arc(-138, -12, 6, 0, Math.PI * 2);
  rCtx.fill();
  rCtx.restore();

  const sramChainringMap = new THREE.CanvasTexture(ringCanvas);
  sramChainringMap.colorSpace = THREE.SRGBColorSpace;
  sramChainringMap.anisotropy = 16;

  // G. Alpha-Perforated CNC SRAM XG-1290 E1 12-Speed X-Dome Cassette Cog Map
  // Eliminates solid-disk occlusion so spokes and studio light shine right through the laser-cut spider windows!
  const casSize = 512;
  const casCanvas = document.createElement('canvas');
  casCanvas.width = casSize;
  casCanvas.height = casSize;
  const casCtx = casCanvas.getContext('2d');
  const ccx = casSize * 0.5;
  const ccy = casSize * 0.5;
  casCtx.clearRect(0, 0, casSize, casSize);

  casCtx.save();
  casCtx.translate(ccx, ccy);

  // Outer CNC tooth profile (36 teeth)
  const casGrad = casCtx.createRadialGradient(0, 0, 60, 0, 0, 250);
  casGrad.addColorStop(0.0, '#22262e');
  casGrad.addColorStop(0.35, '#cfd6e2');
  casGrad.addColorStop(0.82, '#e8eef7');
  casGrad.addColorStop(1.0, '#b0b8c6');
  casCtx.fillStyle = casGrad;

  casCtx.beginPath();
  const numCasTeeth = 34;
  for (let i = 0; i < numCasTeeth; i++) {
    const a0 = (i / numCasTeeth) * Math.PI * 2;
    const a1 = ((i + 0.32) / numCasTeeth) * Math.PI * 2;
    const a2 = ((i + 0.56) / numCasTeeth) * Math.PI * 2;
    const a3 = ((i + 1.0) / numCasTeeth) * Math.PI * 2;
    casCtx.lineTo(Math.cos(a0) * 228, Math.sin(a0) * 228);
    casCtx.lineTo(Math.cos(a1) * 252, Math.sin(a1) * 252);
    casCtx.lineTo(Math.cos(a2) * 252, Math.sin(a2) * 252);
    casCtx.lineTo(Math.cos(a3) * 228, Math.sin(a3) * 228);
  }
  casCtx.closePath();
  casCtx.fill();

  // Punch out X-Dome weight-relief spider windows so cassette is skeletonized and airy
  casCtx.globalCompositeOperation = 'destination-out';
  casCtx.beginPath();
  casCtx.arc(0, 0, 58, 0, Math.PI * 2);
  casCtx.fill();

  const numSpiderArms = 6;
  for (let k = 0; k < numSpiderArms; k++) {
    const baseA = (k / numSpiderArms) * Math.PI * 2;
    // Outer ring window
    casCtx.beginPath();
    casCtx.arc(0, 0, 206, baseA + 0.14, baseA + 0.88, false);
    casCtx.arc(0, 0, 136, baseA + 0.84, baseA + 0.18, true);
    casCtx.closePath();
    casCtx.fill();

    // Inner ring window
    casCtx.beginPath();
    casCtx.arc(0, 0, 122, baseA + 0.18, baseA + 0.84, false);
    casCtx.arc(0, 0, 68, baseA + 0.78, baseA + 0.24, true);
    casCtx.closePath();
    casCtx.fill();
  }
  casCtx.globalCompositeOperation = 'source-over';
  casCtx.restore();

  const sramCassetteMap = new THREE.CanvasTexture(casCanvas);
  sramCassetteMap.colorSpace = THREE.SRGBColorSpace;
  sramCassetteMap.anisotropy = 16;

  // H. ATTEN CHB-01 Cockpit Underlined "A" Emblem & "ATTEN" Spacer Decal (matches cockpit.jpg)
  const attenCanvas = document.createElement('canvas');
  attenCanvas.width = 256;
  attenCanvas.height = 256;
  const atCtx = attenCanvas.getContext('2d');
  atCtx.clearRect(0, 0, 256, 256);
  atCtx.fillStyle = '#eef2f8';
  atCtx.font = '800 110px "Syne", sans-serif';
  atCtx.textAlign = 'center';
  atCtx.textBaseline = 'middle';
  atCtx.fillText('A', 128, 112);
  atCtx.fillRect(82, 168, 92, 11);

  const attenLogoMap = new THREE.CanvasTexture(attenCanvas);
  attenLogoMap.colorSpace = THREE.SRGBColorSpace;

  // I. SRAM RED AXS E1 Carbon Brake Lever Blade Graphic & Pivot Window (matches front.jpg & 34.png!)
  // UV space on the lofted carbon brake blade:
  // u in [0..1] wraps around the blade perimeter:
  //   u = 0.0 / 1.0 -> leading (+chordDir, front-facing) ridge of the carbon lever blade
  //   u = 0.25      -> +widthDir flank
  //   u = 0.50      -> trailing (-chordDir, rear-facing) edge
  //   u = 0.75      -> -widthDir flank
  // v in [0..1] runs from the upper hood pivot (v = 0) down to the curled finger tip (v = 1)
  const leverCanvas = document.createElement('canvas');
  leverCanvas.width = 512;
  leverCanvas.height = 1024;
  const lCtx = leverCanvas.getContext('2d');

  // Rich satin-gloss unidirectional carbon base with longitudinal fiber sheen
  const lBgGrad = lCtx.createLinearGradient(0, 0, 512, 0);
  lBgGrad.addColorStop(0.0, '#16181e');
  lBgGrad.addColorStop(0.15, '#1d2027');
  lBgGrad.addColorStop(0.35, '#121419');
  lBgGrad.addColorStop(0.65, '#121419');
  lBgGrad.addColorStop(0.85, '#1d2027');
  lBgGrad.addColorStop(1.0, '#16181e');
  lCtx.fillStyle = lBgGrad;
  lCtx.fillRect(0, 0, 512, 1024);

  // Subtle longitudinal UD carbon fiber striations
  lCtx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
  lCtx.lineWidth = 1.5;
  for (let x = 0; x < 512; x += 5) {
    lCtx.beginPath();
    lCtx.moveTo(x, 0);
    lCtx.lineTo(x, 1024);
    lCtx.stroke();
  }

  // Helper to stamp the upper rectangular pivot window + vertical silver "Red" & speed-line graphic
  // Placed once along the front-outer face (centered at u = 0 / 1) so there is zero double-stamping!
  const drawBladeFaceDetails = (cx) => {
    lCtx.save();
    lCtx.translate(cx, 0);

    // 1. Upper High-Pivot Recessed Rectangular Slot Window (v ≈ 0.14..0.25, visible in front.jpg!)
    lCtx.fillStyle = '#050608';
    lCtx.strokeStyle = 'rgba(215, 225, 240, 0.38)';
    lCtx.lineWidth = 3.5;
    lCtx.beginPath();
    lCtx.roundRect(-26, 138, 52, 92, 11);
    lCtx.fill();
    lCtx.stroke();

    // Inner metallic pivot pin gleam inside the slot
    const pinGrad = lCtx.createLinearGradient(-20, 162, 20, 198);
    pinGrad.addColorStop(0, '#2a2e37');
    pinGrad.addColorStop(0.5, '#788296');
    pinGrad.addColorStop(1, '#1b1e24');
    lCtx.fillStyle = pinGrad;
    lCtx.fillRect(-20, 166, 40, 36);

    // 2. Vertical Silver Metallic Speed Lines & "Red" Wordmark along lower half of blade (v ≈ 0.42..0.84)
    const silGrad = lCtx.createLinearGradient(0, 420, 0, 860);
    silGrad.addColorStop(0.0, 'rgba(225, 232, 245, 0.94)');
    silGrad.addColorStop(0.5, '#ffffff');
    silGrad.addColorStop(1.0, 'rgba(210, 220, 236, 0.92)');

    lCtx.strokeStyle = silGrad;
    lCtx.lineWidth = 5.5;
    lCtx.beginPath();
    // Upper speed accent lines flanking the blade
    lCtx.moveTo(-15, 435);
    lCtx.lineTo(-15, 542);
    lCtx.moveTo(15, 420);
    lCtx.lineTo(15, 845);
    // Lower speed continuation line
    lCtx.moveTo(-15, 742);
    lCtx.lineTo(-15, 855);
    lCtx.stroke();

    // Vertical "Red" wordmark (rotated -90 deg along the blade axis so it reads right-side-up from the outer flank!)
    lCtx.save();
    lCtx.translate(0, 642);
    lCtx.rotate(-Math.PI / 2);
    lCtx.fillStyle = '#f8faff';
    lCtx.font = 'italic 800 56px "Syne", "Arial Black", sans-serif';
    lCtx.textAlign = 'center';
    lCtx.textBaseline = 'middle';
    lCtx.fillText('Red', 0, 0);
    lCtx.restore();

    // 3. Subtle lower finger-hook dimple/recess highlight near tip (v ≈ 0.88..0.93)
    lCtx.fillStyle = 'rgba(235, 242, 252, 0.42)';
    lCtx.beginPath();
    lCtx.roundRect(-12, 892, 24, 34, 7);
    lCtx.fill();

    lCtx.restore();
  };

  // Stamp across the u = 0 / 1 seam (front-outer face of the blade)
  drawBladeFaceDetails(0);
  drawBladeFaceDetails(512);

  const sramLeverBladeMap = new THREE.CanvasTexture(leverCanvas);
  sramLeverBladeMap.wrapS = THREE.RepeatWrapping;
  sramLeverBladeMap.colorSpace = THREE.SRGBColorSpace;
  sramLeverBladeMap.anisotropy = 16;

  return {
    downtubeLogoMap,
    toptubeDecalMap,
    headtubeLogoMap,
    aeroStripesMap,
    sramRedCrankMap,
    sramChainringMap,
    sramCassetteMap,
    attenLogoMap,
    sramLeverBladeMap,
  };
}

/**
 * 6. Ciclovation Tornado Gloss Spiral-Wrapped Bar Tape Normal & Roughness Maps (matches cockpit.jpg & front.jpg)
 */
export function createBarTapeMaps() {
  const width = 512;
  const height = 256;
  const nCanvas = document.createElement('canvas');
  nCanvas.width = width;
  nCanvas.height = height;
  const nCtx = nCanvas.getContext('2d');

  nCtx.fillStyle = 'rgb(128, 128, 255)';
  nCtx.fillRect(0, 0, width, height);

  // 18 spiral overlap ribs along the tube UV.x axis + subtle leather micro-perforations
  const wraps = 18;
  const stepX = width / wraps;
  for (let w = -2; w <= wraps + 2; w++) {
    const x0 = w * stepX;
    const grad = nCtx.createLinearGradient(x0, 0, x0 + stepX, 0);
    grad.addColorStop(0.0, 'rgb(92, 128, 245)');
    grad.addColorStop(0.18, 'rgb(132, 128, 255)');
    grad.addColorStop(0.82, 'rgb(132, 128, 255)');
    grad.addColorStop(1.0, 'rgb(164, 128, 245)');
    nCtx.fillStyle = grad;
    nCtx.fillRect(x0, 0, stepX, height);
  }

  const normalMap = new THREE.CanvasTexture(nCanvas);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  return { normalMap };
}

/**
 * 7. SRAM RED AXS E1 Textured Silicone Hood Cover Maps (matches cockpit.jpg & front.jpg!)
 * - Features the signature SRAM RED E1 longitudinal/transverse ergonomic grip ribs across the hood body & flanks
 * - Molded elastomer seam line and micro-pebble tactile silicone roughness
 */
export function createSramHoodMaps() {
  const width = 512;
  const height = 512;

  const nCanvas = document.createElement('canvas');
  nCanvas.width = width;
  nCanvas.height = height;
  const nCtx = nCanvas.getContext('2d');

  const rCanvas = document.createElement('canvas');
  rCanvas.width = width;
  rCanvas.height = height;
  const rCtx = rCanvas.getContext('2d');

  // Base flat normal & matte elastomer roughness
  nCtx.fillStyle = 'rgb(128, 128, 255)';
  nCtx.fillRect(0, 0, width, height);

  rCtx.fillStyle = 'rgb(138, 138, 138)';
  rCtx.fillRect(0, 0, width, height);

  // Micro-pebble vulcanized silicone elastomer grain
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const nx = 122 + Math.floor(Math.random() * 12);
    const ny = 122 + Math.floor(Math.random() * 12);
    nCtx.fillStyle = `rgb(${nx}, ${ny}, 255)`;
    nCtx.fillRect(x, y, 2, 2);
  }

  // Signature SRAM RED E1 Parallel Ergonomic Grip Ribs across the palm and side flanks (v in [0.16..0.78])
  // In cockpit.jpg, these clean parallel ribs run across the upper palm & flanks of the hood body
  const startY = Math.floor(height * 0.16);
  const endY = Math.floor(height * 0.78);
  const ribPitch = 11;

  for (let y = startY; y <= endY; y += ribPitch) {
    // Rib normal bevel (top edge lit, bottom edge shadowed)
    nCtx.fillStyle = 'rgb(128, 174, 242)';
    nCtx.fillRect(28, y, width - 56, 3.2);
    nCtx.fillStyle = 'rgb(128, 82, 242)';
    nCtx.fillRect(28, y + 3.2, width - 56, 3.2);

    // Slightly rougher matte finish in the rib troughs
    rCtx.fillStyle = 'rgb(165, 165, 165)';
    rCtx.fillRect(28, y + 3, width - 56, 4);
    rCtx.fillStyle = 'rgb(118, 118, 118)';
    rCtx.fillRect(28, y, width - 56, 3);
  }

  // Smooth upper pommel crown mask (v > 0.80 is the smooth rounded top of the hydraulic pommel)
  // with the subtle molded SRAM contour seam line at v = 0.79
  nCtx.fillStyle = 'rgb(128, 92, 244)';
  nCtx.fillRect(0, Math.floor(height * 0.795), width, 3);
  nCtx.fillStyle = 'rgb(128, 164, 244)';
  nCtx.fillRect(0, Math.floor(height * 0.795) + 3, width, 3);

  const normalMap = new THREE.CanvasTexture(nCanvas);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.ClampToEdgeWrapping;
  normalMap.anisotropy = 16;

  const roughnessMap = new THREE.CanvasTexture(rCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.ClampToEdgeWrapping;
  roughnessMap.anisotropy = 16;

  return { normalMap, roughnessMap };
}


