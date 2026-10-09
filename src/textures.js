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
  // Note on UV aspect ratio: circumference (2048px) is ~1.79m (0.87mm/px), radial flank height is ~0.28mm/px.
  // Scaling X by ~0.36..0.55 compensates for the ~3.1x circumferential stretch so logos have true studio proportions!
  const stampBothFlanks = (uPos, drawCallback) => {
    const x = (((uPos % 1) + 1) % 1) * width;
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

  // 1. Top (12 o'clock, u = 0.25): Iconic tall architectural ATTEN "A" emblem with curved underline (matches 7_speed_sniffer.jpg!)
  stampBothFlanks(0.25, (c) => {
    c.save();
    c.scale(0.36, 1.38); // Compensate for radial vs circumferential UV aspect ratio
    c.fillStyle = '#f4f6fa';
    // Draw architectural stencil 'A' with sharp apex and internal triangular window
    c.beginPath();
    c.moveTo(-6, -42);
    c.lineTo(6, -42);
    c.lineTo(24, 20);
    c.lineTo(12, 20);
    c.lineTo(8, 6);
    c.lineTo(-8, 6);
    c.lineTo(-12, 20);
    c.lineTo(-24, 20);
    c.closePath();
    // Inner triangle cutout
    c.moveTo(0, -24);
    c.lineTo(-5.5, -4);
    c.lineTo(5.5, -4);
    c.closePath();
    c.fill('evenodd');

    // Slightly arched underline bar beneath the A (matches 7_speed_sniffer.jpg)
    c.beginPath();
    c.moveTo(-22, 30);
    c.quadraticCurveTo(0, 25, 22, 30);
    c.lineTo(20, 38);
    c.quadraticCurveTo(0, 33, -20, 38);
    c.closePath();
    c.fill();
    c.restore();
  });

  // 2. Bottom (6 o'clock, u = 0.75): Sleek narrow UD carbon valve reinforcement patch + radial "ATTEN" (matches crop_front_hub.png!)
  stampBothFlanks(0.75, (c, isDrive) => {
    // Narrow 24px (~21mm) glossy unidirectional carbon reinforcement strip spanning radially from tire bead to inner rim nose
    c.fillStyle = 'rgba(10, 11, 14, 0.96)';
    c.fillRect(-13, -118, 26, 236);
    // Smooth out the Aeroscale fish-scale normal map inside the narrow valve patch
    const ny = isDrive ? height * 0.76 : height * 0.24;
    const nx = 0.75 * width;
    nCtx.fillStyle = 'rgb(128, 128, 255)';
    nCtx.fillRect(nx - 13, ny - 118, 26, 236);

    c.save();
    c.rotate(-Math.PI / 2);
    // After -90deg rotation: local X is radial (0.28mm/px), local Y is circumferential (0.87mm/px)
    c.scale(2.15, 0.42);
    c.fillStyle = '#f2f5fa';
    c.font = '800 26px "Inter", "Arial Black", sans-serif';
    c.letterSpacing = '2px';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('ATTEN', 0, 0);
    c.restore();
  });

  // 3. Two bold "SCOPE" wordmarks on the flanks (matches 1_profil.png & 8_cages.jpg)
  const drawScopeLogo = (c) => {
    c.save();
    c.scale(0.56, 1.32); // Taller radial presence across the 65mm rim depth
    c.transform(1, 0, -0.26, 1, 0, 0); // sleek aerodynamic forward slant
    c.fillStyle = '#f4f6fa';
    c.font = '800 50px "Syne", "Arial Black", sans-serif';
    c.letterSpacing = '6px';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('SCOPE', 0, 0);
    c.restore();
  };

  stampBothFlanks(0.43, drawScopeLogo);
  stampBothFlanks(0.93, drawScopeLogo);

  // 4. Micro technical callout at u = 0.58 ("ARTECH 6.A+ // ATTEN BY SCOPE")
  stampBothFlanks(0.58, (c) => {
    c.save();
    c.scale(0.48, 1.22);
    c.fillStyle = 'rgba(235, 240, 248, 0.76)';
    c.font = '600 13px "JetBrains Mono", monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('ARTECH 6.A+', 0, -8);
    c.fillText('ATTEN BY SCOPE', 0, 9);
    c.restore();
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

  // Authentic Vittoria Corsa Pro 320 TPI Corespun Cotton Sidewall Palette (matches 7_speed_sniffer.jpg & 8_cages.jpg):
  // - Tread crown: v in [0.0, 0.155] and [0.845, 1.0] -> matte vulcanized graphene-silica black (#141518)
  // - Cotton sidewall: v in [0.165, 0.385] and [0.615, 0.835] -> natural pale oat-champagne cotton (#d4be8c)
  // - Black vulcanized bead chafer strip right at the carbon rim hook: v in [0.39, 0.44] and [0.56, 0.61] (#121316)
  const vGrad = ctx.createLinearGradient(0, 0, 0, height);
  vGrad.addColorStop(0.0, '#131417');
  vGrad.addColorStop(0.145, '#16181b');
  vGrad.addColorStop(0.165, '#c4ad7a');
  vGrad.addColorStop(0.26, '#d8c394'); // Authentic natural Corsa Pro pale-champagne cotton peak
  vGrad.addColorStop(0.375, '#c2aa76');
  vGrad.addColorStop(0.392, '#141518'); // Crisp black vulcanized bead chafer line above rim edge!
  vGrad.addColorStop(0.50, '#101114');
  vGrad.addColorStop(0.608, '#141518'); // Crisp black vulcanized bead chafer line above rim edge!
  vGrad.addColorStop(0.625, '#c2aa76');
  vGrad.addColorStop(0.74, '#d8c394'); // Authentic natural Corsa Pro pale-champagne cotton peak
  vGrad.addColorStop(0.835, '#c4ad7a');
  vGrad.addColorStop(0.855, '#16181b');
  vGrad.addColorStop(1.0, '#131417');

  ctx.fillStyle = vGrad;
  ctx.fillRect(0, 0, width, height);

  // Fine 320 TPI diagonal cotton-casing cord texture on the tan sidewalls
  ctx.strokeStyle = 'rgba(78, 58, 26, 0.085)';
  ctx.lineWidth = 1.2;
  for (let x = -height; x < width + height; x += 6) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + height, height);
    ctx.stroke();
  }
  // Re-mask the black tread center and black bead chafer strips so cotton threads stay strictly on the sidewall
  ctx.fillStyle = '#141518';
  ctx.fillRect(0, 0, width, height * 0.152);
  ctx.fillRect(0, height * 0.848, width, height * 0.152);
  ctx.fillRect(0, height * 0.392, width, height * 0.216);

  // Stamp "J vittoria" at 12 o'clock (u = 0.25) and "J vittoria CORSA PRO + GRAPHENE + spec patch" at 6 o'clock (u = 0.75)
  // Note: on TorusGeometry (R=0.301, r=0.015), 1px in X is ~5x wider in 3D than 1px in Y.
  // Scaling by (0.30, 1.55) produces razor-sharp, true-to-life sidewall typography!
  const stampTopVittoria = (uPos) => {
    const x = uPos * width;
    [0.27, 0.73].forEach((vPos, idx) => {
      ctx.save();
      ctx.translate(x, vPos * height);
      if (idx === 1) ctx.scale(-1, -1);
      ctx.scale(0.30, 1.55);

      // Iconic Vittoria two-tone 'J' wing mark (orange-gold + crimson-red)
      ctx.strokeStyle = '#e42313';
      ctx.lineWidth = 4.2;
      ctx.beginPath();
      ctx.moveTo(-88, 6);
      ctx.quadraticCurveTo(-80, 10, -74, -10);
      ctx.stroke();

      ctx.strokeStyle = '#f39800';
      ctx.lineWidth = 3.6;
      ctx.beginPath();
      ctx.moveTo(-82, 9);
      ctx.quadraticCurveTo(-72, 11, -65, -10);
      ctx.stroke();

      ctx.fillStyle = '#18181b';
      ctx.font = 'italic 800 22px "Inter", "Arial Black", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('vittoria', -56, 0);
      ctx.restore();
    });
  };

  const stampBottomCorsaPro = (uPos) => {
    const x = uPos * width;
    [0.27, 0.73].forEach((vPos, idx) => {
      ctx.save();
      ctx.translate(x, vPos * height);
      if (idx === 1) ctx.scale(-1, -1);
      ctx.scale(0.30, 1.55);

      // Left technical barcode / QR patch (visible in crop_front_hub.png!)
      ctx.fillStyle = '#f4f5f7';
      ctx.fillRect(-310, -8, 28, 16);
      ctx.fillStyle = '#16171a';
      ctx.fillRect(-307, -5, 10, 10);
      ctx.fillRect(-293, -5, 8, 4);
      ctx.fillRect(-293, 1, 8, 4);

      // Pressure & size micro-markings ("30-622 // 700x30c")
      ctx.fillStyle = 'rgba(24, 24, 27, 0.78)';
      ctx.font = '700 11px "JetBrains Mono", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('700x30c  30-622', -268, 0);

      // Red/Orange "GRAPHENE" hot-patch badge
      ctx.fillStyle = '#d9291c';
      ctx.fillRect(-156, -6, 62, 12);
      ctx.fillStyle = '#f7e5b8';
      ctx.font = '800 9px "Inter", sans-serif';
      ctx.fillText('GRAPHENE', -151, 0);

      // Main "CORSA PRO" + "vittoria" hot patch straddling 6 o'clock (matches crop_front_hub.png!)
      ctx.fillStyle = '#16171a';
      ctx.font = 'italic 900 21px "Inter", "Arial Black", sans-serif';
      ctx.fillText('CORSA PRO', -82, 0);

      ctx.font = 'italic 800 20px "Inter", sans-serif';
      ctx.fillText('vittoria', 66, 0);

      // Vittoria twin 'J' slash on right end
      ctx.strokeStyle = '#e42313';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(156, 6);
      ctx.lineTo(166, -9);
      ctx.stroke();
      ctx.strokeStyle = '#f39800';
      ctx.beginPath();
      ctx.moveTo(163, 7);
      ctx.lineTo(173, -9);
      ctx.stroke();

      ctx.restore();
    });
  };

  stampTopVittoria(0.25);
  stampBottomCorsaPro(0.75);

  const rCanvas = document.createElement('canvas');
  rCanvas.width = width;
  rCanvas.height = height;
  const rCtx = rCanvas.getContext('2d');

  // Dual-Roughness Map:
  // - Black vulcanized graphene-silica tread crown (v in [0..0.155] & [0.845..1.0]): deep satin rubber sheen (roughness ~ 0.42 -> rgb 107)
  // - Natural 320 TPI corespun cotton sidewall (v in [0.165..0.385] & [0.615..0.835]): dry fibrous matte cotton (roughness ~ 0.83 -> rgb 212)
  // - Black vulcanized bead chafer strip (v in [0.39..0.61]): satin rubber chafer (roughness ~ 0.52 -> rgb 132)
  const rGrad = rCtx.createLinearGradient(0, 0, 0, height);
  rGrad.addColorStop(0.0, 'rgb(106, 106, 106)');
  rGrad.addColorStop(0.148, 'rgb(110, 110, 110)');
  rGrad.addColorStop(0.168, 'rgb(212, 212, 212)');
  rGrad.addColorStop(0.375, 'rgb(212, 212, 212)');
  rGrad.addColorStop(0.395, 'rgb(132, 132, 132)');
  rGrad.addColorStop(0.605, 'rgb(132, 132, 132)');
  rGrad.addColorStop(0.625, 'rgb(212, 212, 212)');
  rGrad.addColorStop(0.832, 'rgb(212, 212, 212)');
  rGrad.addColorStop(0.852, 'rgb(110, 110, 110)');
  rGrad.addColorStop(1.0, 'rgb(106, 106, 106)');
  rCtx.fillStyle = rGrad;
  rCtx.fillRect(0, 0, width, height);

  // Fine 320 TPI diagonal cotton-cord micro-roughness on the tan sidewalls
  rCtx.strokeStyle = 'rgba(240, 240, 240, 0.28)';
  rCtx.lineWidth = 1.2;
  for (let x = -height; x < width + height; x += 6) {
    rCtx.beginPath();
    rCtx.moveTo(x, height * 0.165);
    rCtx.lineTo(x + height * 0.22, height * 0.385);
    rCtx.moveTo(x, height * 0.615);
    rCtx.lineTo(x + height * 0.22, height * 0.835);
    rCtx.stroke();
  }

  // Centerline vulcanization molding seam along the tire crown apex (v = 0.0 / 1.0)
  ctx.fillStyle = '#0a0b0d';
  ctx.fillRect(0, 0, width, 2.2);
  ctx.fillRect(0, height - 2.2, width, 2.2);
  rCtx.fillStyle = 'rgb(76, 76, 76)';
  rCtx.fillRect(0, 0, width, 2.5);
  rCtx.fillRect(0, height - 2.5, width, 2.5);

  // Normal map: fine longitudinal Corsa Pro racing tread grooves on the tire crown + center moldingflash rib
  nCtx.fillStyle = 'rgb(128, 128, 255)';
  nCtx.fillRect(0, 0, width, height);

  // Center molding seam normal bevel
  nCtx.fillStyle = 'rgb(128, 168, 245)';
  nCtx.fillRect(0, 0, width, 2.0);
  nCtx.fillStyle = 'rgb(128, 88, 245)';
  nCtx.fillRect(0, height - 2.0, width, 2.0);

  const grooveRows = [0.015, 0.035, 0.055, 0.075, 0.095, 0.115, 0.135, 0.865, 0.885, 0.905, 0.925, 0.945, 0.965, 0.985];
  grooveRows.forEach((vr) => {
    const y = vr * height;
    nCtx.fillStyle = 'rgb(128, 92, 245)';
    nCtx.fillRect(0, y - 1.5, width, 1.5);
    nCtx.fillStyle = 'rgb(128, 164, 245)';
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

  const roughnessMap = new THREE.CanvasTexture(rCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = 16;

  return { map, normalMap, roughnessMap };
}

/**
 * 5. Argon 18 Nitrogen Pro Frame & Component Decal Textures
 * - Downtube Holographic Sliced "ARGON 18" Logo
 * - Top Tube "NITROGEN PRO" + Holographic Prism Band
 * - Head Tube Molecular Cluster Emblem
 * - SRAM RED AXS Crankset & Chainring Graphics
 */
export function createFrameDecalTextures() {
  // Helper for authentic 6-node Argon 18 molecular cluster icon (matches 9_tire_clearance.jpg & 7_speed_sniffer.jpg!)
  const drawMolecule = (c, mx, my, scale, color, withMicroStripes = false) => {
    c.save();
    c.translate(mx, my);
    c.scale(scale, scale);
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = 3.2;
    c.lineCap = 'round';

    // Exact 6-node Argon 18 molecular graph coordinates:
    // Central main atom at (-2, 1), top-left atom at (-6, -15), bottom-left atom at (-6, 15),
    // mid-right atom at (11, 5), upper-right small satellite at (15, -2), far-right atom at (22, 3)
    const nodes = [
      [-6, -15, 4.8], // top-left
      [-2, 1, 6.8],   // central hub
      [-6, 15, 5.2],  // bottom-left
      [11, 5, 4.4],   // mid-right
      [15, -2.5, 2.5],// upper-right satellite
      [22, 3, 4.0],   // far-right
    ];

    // Bonds
    c.beginPath();
    c.moveTo(-6, -15);
    c.lineTo(-2, 1);
    c.lineTo(-6, 15);
    c.moveTo(-2, 1);
    c.lineTo(11, 5);
    c.lineTo(15, -2.5);
    c.moveTo(11, 5);
    c.lineTo(22, 3);
    c.stroke();

    // Atoms
    nodes.forEach(([px, py, r]) => {
      c.beginPath();
      c.arc(px, py, r, 0, Math.PI * 2);
      c.fill();
    });

    // In 9_tire_clearance.jpg, the atoms feature subtle vertical holographic micro-striation shimmer lines
    if (withMicroStripes) {
      c.save();
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = 'rgba(255, 255, 255, 0.24)';
      for (let sx = -14; sx <= 28; sx += 2.0) {
        c.fillRect(sx, -20, 0.75, 42);
      }
      c.restore();
    }
    c.restore();
  };

  // A. Downtube "ARGON 18" Holographic Sliced Speed Logo (matches 8_cages.jpg & crop_crank.png)
  const dtCanvas = document.createElement('canvas');
  dtCanvas.width = 2048;
  dtCanvas.height = 384;
  const dtCtx = dtCanvas.getContext('2d');

  dtCtx.clearRect(0, 0, dtCanvas.width, dtCanvas.height);

  // High-luminance Iridescent Aurora Prism Foil gradient (matches 8_cages.jpg!)
  const holoGrad = dtCtx.createLinearGradient(140, 20, 1900, 280);
  holoGrad.addColorStop(0.0, '#7ce8ff');
  holoGrad.addColorStop(0.16, '#f6bcd4');
  holoGrad.addColorStop(0.38, '#fcedc2');
  holoGrad.addColorStop(0.62, '#c8f7ec');
  holoGrad.addColorStop(0.84, '#88e8ff');
  holoGrad.addColorStop(1.0, '#c0dcff');

  dtCtx.save();
  dtCtx.fillStyle = holoGrad;
  dtCtx.font = '800 206px "Syne", "Arial Black", sans-serif';
  dtCtx.textAlign = 'center';
  dtCtx.textBaseline = 'middle';
  dtCtx.transform(1, 0, -0.16, 1, dtCanvas.width * 0.51, dtCanvas.height * 0.52);
  dtCtx.fillText('ARGON 18', 0, 0);
  dtCtx.restore();

  // Slice the lower 54% of each glyph with crisp parallel speed-line cutouts (matches 8_cages.jpg!)
  dtCtx.globalCompositeOperation = 'destination-out';
  const startY = dtCanvas.height * 0.44;
  const endY = dtCanvas.height * 0.95;
  const stripeStep = 12.5;
  for (let y = startY; y < endY; y += stripeStep) {
    const progress = (y - startY) / (endY - startY);
    const cutH = 3.5 + progress * 4.2;
    dtCtx.fillRect(0, y, dtCanvas.width, cutH);
  }
  dtCtx.globalCompositeOperation = 'source-over';

  const downtubeLogoMap = new THREE.CanvasTexture(dtCanvas);
  downtubeLogoMap.colorSpace = THREE.SRGBColorSpace;
  downtubeLogoMap.anisotropy = 16;

  // B. Conformed 3D Top Tube Wrap Decal (Matches 5_logo.jpg & crop_seat_toptube.png!)
  // UV Layout on conformed top-tube wrap:
  // - U (horizontal, 0..1024): runs along the top tube from Rear (u=0) to Front (u=1)
  // - V (vertical, 0..512): wraps across the top tube perimeter:
  //   - y = 256 (v = 0.50) is the TOP CENTER RIDGE of the top tube
  //   - y = 115 (v ≈ 0.78) is the DRIVE-SIDE (+Z) FLANK
  //   - y = 397 (v ≈ 0.22) is the NON-DRIVE-SIDE (-Z) FLANK
  const ttCanvas = document.createElement('canvas');
  ttCanvas.width = 1024;
  ttCanvas.height = 512;
  const ttCtx = ttCanvas.getContext('2d');
  ttCtx.clearRect(0, 0, ttCanvas.width, ttCanvas.height);

  // 1. Planar-Cut Iridescent Holographic Prism Band (matches 5_logo.jpg & crop_seat_toptube.png!)
  // A flat diagonal plane cutting across a cylinder (with top forward at larger U and bottom rearward at smaller U)
  // traces a cosine curve in unwrapped (U, V) coordinates so BOTH side flanks slant at the exact same forward angle
  // and there is ZERO seam/kink across the top ridge!
  ttCtx.save();
  const bandRearTopU = 695;
  const bandFrontTopU = 895;
  const bandSlantU = 68; // Top is 68px further forward (+U) than bottom flanks, matching crop_seat_toptube.png!
  const stepsV = 64;

  ttCtx.beginPath();
  for (let i = 0; i <= stepsV; i++) {
    const y = (i / stepsV) * 512;
    const cosProfile = Math.cos(((y - 256) / 256) * Math.PI); // +1 at top ridge (y=256), -1 at bottom (y=0, 512)
    const uRear = bandRearTopU + bandSlantU * 0.5 * (cosProfile - 1);
    if (i === 0) ttCtx.moveTo(uRear, y);
    else ttCtx.lineTo(uRear, y);
  }
  for (let i = stepsV; i >= 0; i--) {
    const y = (i / stepsV) * 512;
    const cosProfile = Math.cos(((y - 256) / 256) * Math.PI);
    const uFront = bandFrontTopU + bandSlantU * 0.5 * (cosProfile - 1);
    ttCtx.lineTo(uFront, y);
  }
  ttCtx.closePath();

  const prismGrad = ttCtx.createLinearGradient(620, 30, 900, 480);
  prismGrad.addColorStop(0.0, '#7ce8fa');
  prismGrad.addColorStop(0.24, '#f2b8d0');
  prismGrad.addColorStop(0.50, '#faf0d6');
  prismGrad.addColorStop(0.76, '#f2b8d0');
  prismGrad.addColorStop(1.0, '#7ce8fa');
  ttCtx.fillStyle = prismGrad;
  ttCtx.fill();

  // Dark 6-node molecular cluster emblem on BOTH side flanks (NOT on top ridge, matching 5_logo.jpg & crop_seat_toptube.png!)
  drawMolecule(ttCtx, 762, 118, 1.28, '#14161b');
  drawMolecule(ttCtx, 762, 394, 1.28, '#14161b');

  // Tiny black circular drainage/rivet pinhole dot near the lower flank edge of the prism band (visible in 5_logo.jpg!)
  ttCtx.fillStyle = '#0d0f13';
  ttCtx.beginPath();
  ttCtx.arc(696, 52, 3.2, 0, Math.PI * 2);
  ttCtx.arc(696, 460, 3.2, 0, Math.PI * 2);
  ttCtx.fill();
  ttCtx.restore();

  // 2. Authentic Argon 18 Geometric Stencil "NITR⊐GEN" + Inline Superscript "PR⊐" on Top Crown (matches 5_logo.jpg 1:1!)
  ttCtx.save();
  const textGrad = ttCtx.createLinearGradient(80, 240, 420, 272);
  textGrad.addColorStop(0.0, '#dce8f4');
  textGrad.addColorStop(0.5, '#c8f0f8');
  textGrad.addColorStop(1.0, '#ead0e4');
  ttCtx.fillStyle = textGrad;
  ttCtx.strokeStyle = textGrad;
  ttCtx.font = 'italic 800 32px "Inter", "Arial Black", sans-serif';
  ttCtx.textBaseline = 'middle';

  const startX = 92;
  const centerY = 258;
  ttCtx.fillText('NITR', startX, centerY);
  const wNitr = ttCtx.measureText('NITR').width;

  // Draw Argon 18's signature squared stencil 'O' (open left gap '⊐') immediately after 'NITR'
  const oCenterX = startX + wNitr + 14;
  ttCtx.lineWidth = 4.5;
  ttCtx.lineJoin = 'round';
  ttCtx.save();
  ttCtx.translate(oCenterX, centerY);
  ttCtx.transform(1, 0, -0.20, 1, 0, 0);
  ttCtx.beginPath();
  ttCtx.moveTo(-8.5, -5.5);
  ttCtx.lineTo(-8.5, -10.2);
  ttCtx.lineTo(8.5, -10.2);
  ttCtx.lineTo(8.5, 10.2);
  ttCtx.lineTo(-8.5, 10.2);
  ttCtx.lineTo(-8.5, 4.0);
  ttCtx.stroke();
  ttCtx.restore();

  // Draw 'GEN' immediately after the squared '⊐'
  const genX = oCenterX + 14;
  ttCtx.fillText('GEN', genX, centerY);
  const wGen = ttCtx.measureText('GEN').width;

  // Inline superscript hollow geometric stencil "PR⊐" immediately to the upper-right of 'GEN' (matches 5_logo.jpg!)
  const proX = genX + wGen + 6;
  const proY = centerY - 8;
  ttCtx.font = 'italic 800 17px "Inter", "Arial Black", sans-serif';
  ttCtx.fillStyle = '#111318';
  ttCtx.strokeStyle = 'rgba(220, 234, 248, 0.90)';
  ttCtx.lineWidth = 1.8;
  ttCtx.strokeText('PRO', proX, proY);
  ttCtx.fillText('PRO', proX, proY);
  ttCtx.restore();

  const toptubeDecalMap = new THREE.CanvasTexture(ttCanvas);
  toptubeDecalMap.colorSpace = THREE.SRGBColorSpace;
  toptubeDecalMap.anisotropy = 16;

  // C. Head Tube Iridescent 6-Node Molecular Emblem (matches 7_speed_sniffer.jpg & 9_tire_clearance.jpg!)
  const htCanvas = document.createElement('canvas');
  htCanvas.width = 512;
  htCanvas.height = 512;
  const htCtx = htCanvas.getContext('2d');
  htCtx.clearRect(0, 0, 512, 512);

  const mGrad = htCtx.createLinearGradient(110, 110, 402, 402);
  mGrad.addColorStop(0.0, '#7ce8fa');
  mGrad.addColorStop(0.32, '#f5e2c0');
  mGrad.addColorStop(0.65, '#f0a8cf');
  mGrad.addColorStop(1.0, '#82ecff');
  drawMolecule(htCtx, 240, 256, 7.6, mGrad, true);

  const headtubeLogoMap = new THREE.CanvasTexture(htCanvas);
  headtubeLogoMap.colorSpace = THREE.SRGBColorSpace;
  headtubeLogoMap.anisotropy = 16;

  // D. Horizontal Holographic 6-Stripe Speed Graphic (Lower Fork & Dropped Seatstay Knee - matches crop_front_hub.png & crop_rd.png!)
  const stripeCanvas = document.createElement('canvas');
  stripeCanvas.width = 256;
  stripeCanvas.height = 256;
  const sCtx = stripeCanvas.getContext('2d');
  sCtx.clearRect(0, 0, 256, 256);
  const sGrad = sCtx.createLinearGradient(0, 0, 256, 256);
  sGrad.addColorStop(0.0, '#84ecff');
  sGrad.addColorStop(0.55, '#d6f4f8');
  sGrad.addColorStop(1.0, '#f2d8c2');
  sCtx.fillStyle = sGrad;
  for (let i = 0; i < 6; i++) {
    const y = 26 + i * 36;
    sCtx.fillRect(18, y, 220, 7.5);
  }
  const aeroStripesMap = new THREE.CanvasTexture(stripeCanvas);
  aeroStripesMap.colorSpace = THREE.SRGBColorSpace;
  aeroStripesMap.anisotropy = 16;

  // E. SRAM RED E1 Crank Arm Graphic (matches crop_crank.png 1:1: "- Red _________" along upper-center spine)
  const crankCanvas = document.createElement('canvas');
  crankCanvas.width = 1024;
  crankCanvas.height = 256;
  const cCtx = crankCanvas.getContext('2d');
  cCtx.clearRect(0, 0, 1024, 256);

  const crankSilGrad = cCtx.createLinearGradient(120, 0, 860, 0);
  crankSilGrad.addColorStop(0.0, '#e2e8f2');
  crankSilGrad.addColorStop(0.5, '#ffffff');
  crankSilGrad.addColorStop(1.0, 'rgba(215, 224, 238, 0.85)');

  cCtx.fillStyle = crankSilGrad;
  // Short leading silver bar before "Red" (matches crop_crank.png!)
  cCtx.fillRect(195, 125, 34, 6);
  // Long tapering trailing silver bar after "Red" (matches crop_crank.png!)
  cCtx.beginPath();
  cCtx.moveTo(418, 124);
  cCtx.lineTo(830, 126);
  cCtx.lineTo(815, 131);
  cCtx.lineTo(418, 131);
  cCtx.closePath();
  cCtx.fill();

  cCtx.fillStyle = '#f6f8fc';
  cCtx.font = 'italic 800 58px "Syne", "Arial Black", sans-serif';
  cCtx.textAlign = 'center';
  cCtx.textBaseline = 'middle';
  cCtx.fillText('Red', 324, 124);

  const sramRedCrankMap = new THREE.CanvasTexture(crankCanvas);
  sramRedCrankMap.colorSpace = THREE.SRGBColorSpace;
  sramRedCrankMap.anisotropy = 16;

  // F. High-Precision SRAM RED AXS E1 48/35T Direct-Mount Aero Chainring Map (matches crop_crank.png & 8_cages.jpg!)
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
  rCtx.fillStyle = '#d0d8e4';
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

  // Dark anodized inner 35T body with weight-relief windows (matches crop_crank.png!)
  rCtx.fillStyle = '#14161b';
  rCtx.beginPath();
  rCtx.arc(0, 0, 336, 0, Math.PI * 2);
  rCtx.fill();

  // 2. Outer 48T CNC Silver Tooth Ring (outer radius 498px, base 458px)
  const toothGrad = rCtx.createRadialGradient(0, 0, 445, 0, 0, 500);
  toothGrad.addColorStop(0.0, '#181a20');
  toothGrad.addColorStop(0.22, '#e4ebf5');
  toothGrad.addColorStop(0.75, '#ffffff');
  toothGrad.addColorStop(1.0, '#cfd8e6');
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

  // Bright silver CNC machined step ring at r = 450px
  rCtx.strokeStyle = '#e8eff8';
  rCtx.lineWidth = 4.5;
  rCtx.beginPath();
  rCtx.arc(0, 0, 450, 0, Math.PI * 2);
  rCtx.stroke();

  // 3. Punch out through-holes (Transparent Cutouts!) so inner 35T & background show through (matches crop_crank.png!)
  rCtx.globalCompositeOperation = 'destination-out';
  rCtx.beginPath();
  rCtx.arc(0, 0, 92, 0, Math.PI * 2);
  rCtx.fill();

  for (let k = 0; k < 4; k++) {
    const baseAng = (k / 4) * Math.PI * 2 + 0.18;
    rCtx.beginPath();
    rCtx.arc(0, 0, 422, baseAng + 0.14, baseAng + 1.12, false);
    rCtx.arc(0, 0, 358, baseAng + 1.06, baseAng + 0.20, true);
    rCtx.closePath();
    rCtx.fill();

    // Inner 35T ring cutouts visible inside the windows (matches crop_crank.png!)
    for (let m = 0; m < 4; m++) {
      const subA = baseAng + 0.22 + m * 0.22;
      rCtx.beginPath();
      rCtx.arc(0, 0, 304, subA, subA + 0.14, false);
      rCtx.arc(0, 0, 244, subA + 0.12, subA + 0.02, true);
      rCtx.closePath();
      rCtx.fill();
    }
  }
  rCtx.globalCompositeOperation = 'source-over';

  // 4. Signature SRAM RED E1 Silver CNC Machined Split-Spoke Diagonal Structural Ribs (matches crop_crank.png!)
  for (let k = 0; k < 4; k++) {
    rCtx.save();
    const armAng = (k / 4) * Math.PI * 2 - 0.12;
    rCtx.rotate(armAng);

    const silGrad = rCtx.createLinearGradient(160, -80, 440, 80);
    silGrad.addColorStop(0.0, '#e2eaf4');
    silGrad.addColorStop(0.5, '#ffffff');
    silGrad.addColorStop(1.0, '#cfd8e6');

    // Leading silver rib with recessed dark slot
    rCtx.fillStyle = silGrad;
    rCtx.beginPath();
    rCtx.moveTo(170, -20);
    rCtx.lineTo(448, -58);
    rCtx.lineTo(451, -18);
    rCtx.lineTo(178, 12);
    rCtx.closePath();
    rCtx.fill();

    rCtx.fillStyle = '#121418';
    rCtx.beginPath();
    rCtx.moveTo(202, -12);
    rCtx.lineTo(432, -43);
    rCtx.lineTo(434, -29);
    rCtx.lineTo(206, 0);
    rCtx.closePath();
    rCtx.fill();

    // Trailing silver rib joining at outer rim
    rCtx.fillStyle = silGrad;
    rCtx.beginPath();
    rCtx.moveTo(216, 24);
    rCtx.lineTo(445, 74);
    rCtx.lineTo(450, 36);
    rCtx.lineTo(226, -2);
    rCtx.closePath();
    rCtx.fill();

    rCtx.fillStyle = '#121418';
    rCtx.beginPath();
    rCtx.moveTo(242, 19);
    rCtx.lineTo(428, 59);
    rCtx.lineTo(430, 46);
    rCtx.lineTo(246, 8);
    rCtx.closePath();
    rCtx.fill();

    rCtx.restore();
  }

  // 5. "SRAM | 48/35T | 12SPD" Badge at 12 o'clock top of chainring (matches 8_cages.jpg!)
  rCtx.save();
  rCtx.rotate(-0.08);
  rCtx.fillStyle = '#14161b';
  rCtx.strokeStyle = 'rgba(235, 242, 250, 0.85)';
  rCtx.lineWidth = 2.5;
  rCtx.beginPath();
  rCtx.roundRect(-84, -428, 168, 22, 6);
  rCtx.fill();
  rCtx.stroke();

  rCtx.fillStyle = '#f4f7fc';
  rCtx.font = '800 13px "JetBrains Mono", sans-serif';
  rCtx.textAlign = 'center';
  rCtx.textBaseline = 'middle';
  rCtx.fillText('SRAM  48/35T  12SPD', 0, -417);
  rCtx.restore();

  // 6. Central Quarq AXS Spider Ring (no fake neon dot!)
  rCtx.strokeStyle = 'rgba(230, 238, 248, 0.55)';
  rCtx.lineWidth = 3.5;
  rCtx.beginPath();
  rCtx.arc(0, 0, 172, 0, Math.PI * 2);
  rCtx.stroke();
  rCtx.restore();

  const sramChainringMap = new THREE.CanvasTexture(ringCanvas);
  sramChainringMap.colorSpace = THREE.SRGBColorSpace;
  sramChainringMap.anisotropy = 16;

  // G. High-Luminance Alpha-Perforated CNC SRAM XG-1290 E1 12-Speed X-Dome Cassette Cog Map (matches crop_rd.png!)
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

  // Bright mirror-brushed silver-chrome tooth profile (matches crop_rd.png!)
  const casGrad = casCtx.createRadialGradient(0, 0, 50, 0, 0, 254);
  casGrad.addColorStop(0.0, '#d8e0ec');
  casGrad.addColorStop(0.35, '#edf2fa');
  casGrad.addColorStop(0.78, '#ffffff');
  casGrad.addColorStop(1.0, '#dce4f0');
  casCtx.fillStyle = casGrad;

  casCtx.beginPath();
  const numCasTeeth = 32;
  for (let i = 0; i < numCasTeeth; i++) {
    const a0 = (i / numCasTeeth) * Math.PI * 2;
    const a1 = ((i + 0.28) / numCasTeeth) * Math.PI * 2;
    const a2 = ((i + 0.58) / numCasTeeth) * Math.PI * 2;
    const a3 = ((i + 1.0) / numCasTeeth) * Math.PI * 2;
    casCtx.lineTo(Math.cos(a0) * 224, Math.sin(a0) * 224);
    casCtx.lineTo(Math.cos(a1) * 254, Math.sin(a1) * 254);
    casCtx.lineTo(Math.cos(a2) * 254, Math.sin(a2) * 254);
    casCtx.lineTo(Math.cos(a3) * 224, Math.sin(a3) * 224);
  }
  casCtx.closePath();
  casCtx.fill();

  // Concentric X-Dome laser-cut rectangular weight-relief perforations (matches crop_rd.png!)
  casCtx.globalCompositeOperation = 'destination-out';
  casCtx.beginPath();
  casCtx.arc(0, 0, 56, 0, Math.PI * 2);
  casCtx.fill();

  // 3 concentric rings of 18 rectangular X-Dome slots + 6 spider windows
  const ringSlots = [
    { rIn: 68, rOut: 108, count: 12 },
    { rIn: 120, rOut: 162, count: 18 },
    { rIn: 174, rOut: 210, count: 24 },
  ];
  ringSlots.forEach(({ rIn, rOut, count }) => {
    const step = (Math.PI * 2) / count;
    for (let k = 0; k < count; k++) {
      const aStart = k * step + step * 0.16;
      const aEnd = (k + 1) * step - step * 0.16;
      casCtx.beginPath();
      casCtx.arc(0, 0, rOut, aStart, aEnd, false);
      casCtx.arc(0, 0, rIn, aEnd, aStart, true);
      casCtx.closePath();
      casCtx.fill();
    }
  });
  casCtx.globalCompositeOperation = 'source-over';
  casCtx.restore();

  const sramCassetteMap = new THREE.CanvasTexture(casCanvas);
  sramCassetteMap.colorSpace = THREE.SRGBColorSpace;
  sramCassetteMap.anisotropy = 16;

  // H. ATTEN CHB-01 Cockpit Underlined "A" Emblem (matches 3_cockpit.jpg)
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

  // I. SRAM RED AXS E1 Carbon Brake Lever Blade Graphic & Pivot Window (matches 4_front.jpg & 7_speed_sniffer.jpg!)
  // Generates dedicated Right and Left maps so text is NEVER mirrored on the left lever!
  const buildLeverBladeTexture = (isLeft = false) => {
    const leverCanvas = document.createElement('canvas');
    leverCanvas.width = 512;
    leverCanvas.height = 1024;
    const lCtx = leverCanvas.getContext('2d');

    const lBgGrad = lCtx.createLinearGradient(0, 0, 512, 0);
    lBgGrad.addColorStop(0.0, '#16181e');
    lBgGrad.addColorStop(0.15, '#1e2129');
    lBgGrad.addColorStop(0.35, '#121419');
    lBgGrad.addColorStop(0.65, '#121419');
    lBgGrad.addColorStop(0.85, '#1e2129');
    lBgGrad.addColorStop(1.0, '#16181e');
    lCtx.fillStyle = lBgGrad;
    lCtx.fillRect(0, 0, 512, 1024);

    // Subtle longitudinal UD carbon fiber striations
    lCtx.strokeStyle = 'rgba(255, 255, 255, 0.028)';
    lCtx.lineWidth = 1.5;
    for (let x = 0; x < 512; x += 5) {
      lCtx.beginPath();
      lCtx.moveTo(x, 0);
      lCtx.lineTo(x, 1024);
      lCtx.stroke();
    }

    const drawBladeFaceDetails = (cx) => {
      lCtx.save();
      lCtx.translate(cx, 0);
      if (isLeft) lCtx.scale(-1, 1); // Un-mirror when applied to the -Z mirrored left lever!

      // 1. Upper High-Pivot Recessed Rectangular Slot Window (v ≈ 0.14..0.25, visible in 4_front.jpg!)
      lCtx.fillStyle = '#050608';
      lCtx.strokeStyle = 'rgba(220, 228, 242, 0.42)';
      lCtx.lineWidth = 3.5;
      lCtx.beginPath();
      lCtx.roundRect(-24, 138, 48, 88, 10);
      lCtx.fill();
      lCtx.stroke();

      const pinGrad = lCtx.createLinearGradient(-18, 162, 18, 198);
      pinGrad.addColorStop(0, '#2a2e37');
      pinGrad.addColorStop(0.5, '#8a94a8');
      pinGrad.addColorStop(1, '#1b1e24');
      lCtx.fillStyle = pinGrad;
      lCtx.fillRect(-18, 166, 36, 34);

      // 2. Vertical Silver "SRAM" Stencil & Speed Lines along front-outer face (matches 7_speed_sniffer.jpg & 4_front.jpg!)
      const silGrad = lCtx.createLinearGradient(0, 380, 0, 860);
      silGrad.addColorStop(0.0, 'rgba(230, 236, 248, 0.95)');
      silGrad.addColorStop(0.5, '#ffffff');
      silGrad.addColorStop(1.0, 'rgba(215, 224, 240, 0.92)');

      lCtx.strokeStyle = silGrad;
      lCtx.lineWidth = 4.5;
      lCtx.beginPath();
      lCtx.moveTo(-14, 390);
      lCtx.lineTo(-14, 515);
      lCtx.moveTo(14, 380);
      lCtx.lineTo(14, 845);
      lCtx.moveTo(-14, 735);
      lCtx.lineTo(-14, 855);
      lCtx.stroke();

      lCtx.save();
      lCtx.translate(-1, 625);
      lCtx.rotate(-Math.PI / 2);
      lCtx.fillStyle = '#f8faff';
      lCtx.font = 'italic 900 44px "Inter", "Arial Black", sans-serif';
      lCtx.letterSpacing = '3px';
      lCtx.textAlign = 'center';
      lCtx.textBaseline = 'middle';
      lCtx.fillText('SRAM', 0, 0);
      lCtx.restore();

      // 3. Lower finger-hook recess highlight near tip
      lCtx.fillStyle = 'rgba(235, 242, 252, 0.42)';
      lCtx.beginPath();
      lCtx.roundRect(-11, 892, 22, 32, 6);
      lCtx.fill();

      lCtx.restore();
    };

    drawBladeFaceDetails(0);
    drawBladeFaceDetails(512);

    const tex = new THREE.CanvasTexture(leverCanvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 16;
    return tex;
  };

  const sramLeverBladeMap = buildLeverBladeTexture(false);
  const sramLeverBladeMapLeft = buildLeverBladeTexture(true);

  // J. Alpha-Perforated + Normal-Mapped SRAM Paceline X Centerlock Disc Brake Rotor (matches crop_front_hub.png & crop_rd.png!)
  const rotSize = 1024;
  const rotCanvas = document.createElement('canvas');
  rotCanvas.width = rotSize;
  rotCanvas.height = rotSize;
  const rotCtx = rotCanvas.getContext('2d');

  const rotNormCanvas = document.createElement('canvas');
  rotNormCanvas.width = rotSize;
  rotNormCanvas.height = rotSize;
  const rnCtx = rotNormCanvas.getContext('2d');

  const rcx = rotSize * 0.5;
  const rcy = rotSize * 0.5;
  rotCtx.clearRect(0, 0, rotSize, rotSize);
  rnCtx.fillStyle = 'rgb(128, 128, 255)';
  rnCtx.fillRect(0, 0, rotSize, rotSize);

  rotCtx.save();
  rotCtx.translate(rcx, rcy);
  rnCtx.save();
  rnCtx.translate(rcx, rcy);

  // 1. Outer Scalloped Stainless Steel Braking Track (r = 344..492px)
  const trackGrad = rotCtx.createRadialGradient(0, 0, 340, 0, 0, 496);
  trackGrad.addColorStop(0.0, '#cfd6e2');
  trackGrad.addColorStop(0.35, '#eef3fa');
  trackGrad.addColorStop(0.72, '#ffffff');
  trackGrad.addColorStop(1.0, '#d5dde8');
  rotCtx.fillStyle = trackGrad;

  rotCtx.beginPath();
  const rotorSteps = 360;
  for (let i = 0; i <= rotorSteps; i++) {
    const a = (i / rotorSteps) * Math.PI * 2;
    // 12 outer Paceline X wave scallops
    const rOut = 486 + Math.cos(a * 12) * 8;
    if (i === 0) rotCtx.moveTo(Math.cos(a) * rOut, Math.sin(a) * rOut);
    else rotCtx.lineTo(Math.cos(a) * rOut, Math.sin(a) * rOut);
  }
  rotCtx.closePath();
  rotCtx.fill();

  // Concentric brushed stainless pad-contact score lines on braking track
  rotCtx.strokeStyle = 'rgba(150, 160, 176, 0.32)';
  rotCtx.lineWidth = 1.2;
  for (let r = 365; r <= 478; r += 4.5) {
    rotCtx.beginPath();
    rotCtx.arc(0, 0, r, 0, Math.PI * 2);
    rotCtx.stroke();
  }

  // Punch out inner boundary of the steel braking track (leaving 6 inward mounting tabs at the carrier pins)
  rotCtx.globalCompositeOperation = 'destination-out';
  rotCtx.beginPath();
  for (let i = 0; i <= rotorSteps; i++) {
    const a = (i / rotorSteps) * Math.PI * 2;
    // 6 inward lugs at the 6 carrier rivet positions (a * 6)
    const lug = Math.pow(Math.max(0, Math.cos(a * 6)), 4) * 44;
    const rIn = 382 - lug;
    if (i === 0) rotCtx.moveTo(Math.cos(a) * rIn, Math.sin(a) * rIn);
    else rotCtx.lineTo(Math.cos(a) * rIn, Math.sin(a) * rIn);
  }
  rotCtx.closePath();
  rotCtx.fill();

  // Punch out 36 slanted oblong Paceline X laser-cut cooling slots around the braking track!
  for (let s = 0; s < 36; s++) {
    const a = (s / 36) * Math.PI * 2;
    const row = s % 3;
    const rSlot = row === 0 ? 412 : row === 1 ? 434 : 454;
    const slotLen = row === 1 ? 38 : 30;
    rotCtx.save();
    rotCtx.rotate(a);
    rotCtx.translate(rSlot, 0);
    rotCtx.rotate(0.92); // Tangential forward slant matching SRAM Paceline X
    rotCtx.beginPath();
    rotCtx.roundRect(-slotLen * 0.5, -4.5, slotLen, 9, 4.5);
    rotCtx.fill();
    rotCtx.restore();

    // Normal bevel around each cooling slot
    rnCtx.save();
    rnCtx.rotate(a);
    rnCtx.translate(rSlot, 0);
    rnCtx.rotate(0.92);
    rnCtx.strokeStyle = 'rgb(95, 160, 240)';
    rnCtx.lineWidth = 2.5;
    rnCtx.beginPath();
    rnCtx.roundRect(-slotLen * 0.5 - 1, -5.5, slotLen + 2, 11, 5.5);
    rnCtx.stroke();
    rnCtx.restore();
  }
  rotCtx.globalCompositeOperation = 'source-over';

  // 2. Sculpted 6-Arm Black Anodized Aluminum Aero Spider Carrier (r = 128..362px, matches crop_front_hub.png!)
  rotCtx.fillStyle = '#14161b';
  rotCtx.strokeStyle = '#343a46';
  rotCtx.lineWidth = 3;

  // Inner carrier ring
  rotCtx.beginPath();
  rotCtx.arc(0, 0, 185, 0, Math.PI * 2);
  rotCtx.fill();

  // 6 tangential swept aero carrier arms connecting hub ring to the 6 steel track lugs
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    rotCtx.save();
    rotCtx.rotate(a);
    rotCtx.beginPath();
    rotCtx.moveTo(148, -42);
    rotCtx.quadraticCurveTo(245, -52, 342, -24);
    rotCtx.arc(342, 0, 24, -Math.PI / 2, Math.PI / 2, false);
    rotCtx.quadraticCurveTo(250, 22, 162, 46);
    rotCtx.closePath();
    rotCtx.fill();
    rotCtx.stroke();
    rotCtx.restore();
  }

  // Punch out 6 large weight-relief kidney windows inside the black carrier ring + center axle bore
  rotCtx.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.28;
    rotCtx.beginPath();
    rotCtx.arc(0, 0, 205, a, a + 0.56, false);
    rotCtx.arc(0, 0, 145, a + 0.50, a + 0.06, true);
    rotCtx.closePath();
    rotCtx.fill();
  }
  // Center thru-axle bore
  rotCtx.beginPath();
  rotCtx.arc(0, 0, 86, 0, Math.PI * 2);
  rotCtx.fill();
  rotCtx.globalCompositeOperation = 'source-over';

  // 3. 6 Bright CNC Silver Floating Stainless Steel Rivet Pins at r = 342px (unmistakable in crop_front_hub.png!)
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const px = Math.cos(a) * 342;
    const py = Math.sin(a) * 342;

    rotCtx.fillStyle = '#edf2fa';
    rotCtx.beginPath();
    rotCtx.arc(px, py, 16, 0, Math.PI * 2);
    rotCtx.fill();

    rotCtx.fillStyle = '#14171c';
    rotCtx.beginPath();
    rotCtx.arc(px, py, 6.5, 0, Math.PI * 2);
    rotCtx.fill();
  }

  // 4. Central Serrated Black Centerlock Lockring (r = 86..142px) with white laser-etched text
  rotCtx.fillStyle = '#101216';
  rotCtx.strokeStyle = '#3a404d';
  rotCtx.lineWidth = 2.5;
  rotCtx.beginPath();
  rotCtx.arc(0, 0, 142, 0, Math.PI * 2);
  rotCtx.arc(0, 0, 86, 0, Math.PI * 2, true);
  rotCtx.fill('evenodd');
  rotCtx.stroke();

  // 16 Centerlock tool notches around r = 94px
  rotCtx.strokeStyle = 'rgba(210, 220, 235, 0.35)';
  rotCtx.lineWidth = 3;
  for (let n = 0; n < 16; n++) {
    const na = (n / 16) * Math.PI * 2;
    rotCtx.beginPath();
    rotCtx.moveTo(Math.cos(na) * 88, Math.sin(na) * 88);
    rotCtx.lineTo(Math.cos(na) * 102, Math.sin(na) * 102);
    rotCtx.stroke();
  }

  rotCtx.fillStyle = 'rgba(235, 240, 248, 0.82)';
  rotCtx.font = '700 13px "JetBrains Mono", sans-serif';
  rotCtx.textAlign = 'center';
  rotCtx.textBaseline = 'middle';
  rotCtx.fillText('SRAM  •  40Nm', 0, -116);
  rotCtx.fillText('CENTERLOCK', 0, 116);

  rotCtx.restore();
  rnCtx.restore();

  const pacelineRotorMap = new THREE.CanvasTexture(rotCanvas);
  pacelineRotorMap.colorSpace = THREE.SRGBColorSpace;
  pacelineRotorMap.anisotropy = 16;

  const pacelineRotorNormalMap = new THREE.CanvasTexture(rotNormCanvas);
  pacelineRotorNormalMap.anisotropy = 16;

  // K. Authentic Micro-Decals (3_cockpit.jpg, 5_logo.jpg, 8_cages.jpg, 1_profil.png)
  // 1. Upper Downtube Spine Physics Formula: P_acc = (m_c + m_b + I_w / R_w^2) v dv/dt (visible in 3_cockpit.jpg!)
  const physCanvas = document.createElement('canvas');
  physCanvas.width = 512;
  physCanvas.height = 128;
  const pCtx = physCanvas.getContext('2d');
  pCtx.clearRect(0, 0, 512, 128);
  pCtx.fillStyle = 'rgba(235, 242, 250, 0.88)';
  pCtx.font = 'italic 600 22px "Georgia", "Times New Roman", serif';
  pCtx.textBaseline = 'middle';
  pCtx.fillText('P', 28, 64);
  pCtx.font = '600 14px "Inter", sans-serif';
  pCtx.fillText('acc', 42, 72);
  pCtx.font = '600 22px "Inter", sans-serif';
  pCtx.fillText('=  ( m   +  m   +         )  v', 74, 64);
  pCtx.font = '600 13px "Inter", sans-serif';
  pCtx.fillText('c', 132, 72);
  pCtx.fillText('b', 184, 72);
  // Fraction I_w / R_w^2
  pCtx.font = 'italic 600 16px "Georgia", serif';
  pCtx.fillText('I', 236, 48);
  pCtx.fillText('R', 232, 82);
  pCtx.font = '600 11px "Inter", sans-serif';
  pCtx.fillText('w', 244, 53);
  pCtx.fillText('w', 245, 87);
  pCtx.fillText('2', 252, 74);
  pCtx.fillRect(228, 62, 34, 2);
  // dv / dt
  pCtx.font = 'italic 600 16px "Georgia", serif';
  pCtx.fillText('dv', 332, 48);
  pCtx.fillText('dt', 334, 82);
  pCtx.fillRect(328, 62, 30, 2);
  const physicsFormulaMap = new THREE.CanvasTexture(physCanvas);
  physicsFormulaMap.colorSpace = THREE.SRGBColorSpace;
  physicsFormulaMap.anisotropy = 16;

  // 2. Top Tube Front Micro-Motto: "RIDE YOUR ELEMENT" behind stem (visible in 3_cockpit.jpg!)
  const rideCanvas = document.createElement('canvas');
  rideCanvas.width = 512;
  rideCanvas.height = 64;
  const rdCtx = rideCanvas.getContext('2d');
  rdCtx.clearRect(0, 0, 512, 64);
  rdCtx.fillStyle = 'rgba(236, 242, 250, 0.90)';
  rdCtx.font = '700 22px "JetBrains Mono", "Inter", sans-serif';
  rdCtx.letterSpacing = '4px';
  rdCtx.textAlign = 'center';
  rdCtx.textBaseline = 'middle';
  rdCtx.fillText('RIDE YOUR ELEMENT', 256, 32);
  const rideElementMap = new THREE.CanvasTexture(rideCanvas);
  rideElementMap.colorSpace = THREE.SRGBColorSpace;
  rideElementMap.anisotropy = 16;

  // 3. Integrated Seatpost Wedge Cover "6.5 Nm" + Recessed Angled Bolt Port (visible in 5_logo.jpg!)
  const wedgeCanvas = document.createElement('canvas');
  wedgeCanvas.width = 256;
  wedgeCanvas.height = 128;
  const wCtx = wedgeCanvas.getContext('2d');
  wCtx.fillStyle = '#15171c';
  wCtx.fillRect(0, 0, 256, 128);
  // Recessed oval bolt pocket at right
  wCtx.fillStyle = '#07080a';
  wCtx.strokeStyle = '#2c303a';
  wCtx.lineWidth = 3;
  wCtx.beginPath();
  wCtx.ellipse(182, 64, 28, 22, 0, 0, Math.PI * 2);
  wCtx.fill();
  wCtx.stroke();
  // Stainless steel hex bolt socket inside the pocket
  wCtx.fillStyle = '#9aa4b4';
  wCtx.beginPath();
  wCtx.arc(178, 64, 12, 0, Math.PI * 2);
  wCtx.fill();
  wCtx.fillStyle = '#14171c';
  wCtx.beginPath();
  wCtx.arc(178, 64, 6.5, 0, Math.PI * 2);
  wCtx.fill();
  // Molded "6.5 Nm" torque specification text
  wCtx.fillStyle = 'rgba(185, 195, 210, 0.62)';
  wCtx.font = '700 22px "JetBrains Mono", sans-serif';
  wCtx.textAlign = 'center';
  wCtx.textBaseline = 'middle';
  wCtx.fillText('6.5 Nm', 86, 64);
  const wedgeTorqueMap = new THREE.CanvasTexture(wedgeCanvas);
  wedgeTorqueMap.colorSpace = THREE.SRGBColorSpace;
  wedgeTorqueMap.anisotropy = 16;

  // 4. Inner Drive-Side Chainstay Canadian Maple Leaf Heritage Badge (visible in 8_cages.jpg!)
  const canCanvas = document.createElement('canvas');
  canCanvas.width = 512;
  canCanvas.height = 128;
  const cnCtx = canCanvas.getContext('2d');
  cnCtx.clearRect(0, 0, 512, 128);
  cnCtx.strokeStyle = 'rgba(235, 240, 248, 0.88)';
  cnCtx.fillStyle = 'rgba(235, 240, 248, 0.88)';
  cnCtx.lineWidth = 2.5;
  // Rounded square + inner circle + stylized Canadian Maple Leaf
  cnCtx.beginPath();
  cnCtx.roundRect(24, 22, 84, 84, 10);
  cnCtx.stroke();
  cnCtx.beginPath();
  cnCtx.arc(66, 64, 34, 0, Math.PI * 2);
  cnCtx.stroke();
  // Maple leaf silhouette
  cnCtx.beginPath();
  cnCtx.moveTo(66, 38);
  cnCtx.lineTo(72, 50);
  cnCtx.lineTo(86, 48);
  cnCtx.lineTo(78, 62);
  cnCtx.lineTo(84, 68);
  cnCtx.lineTo(68, 70);
  cnCtx.lineTo(68, 86);
  cnCtx.lineTo(64, 86);
  cnCtx.lineTo(64, 70);
  cnCtx.lineTo(48, 68);
  cnCtx.lineTo(54, 62);
  cnCtx.lineTo(46, 48);
  cnCtx.lineTo(60, 50);
  cnCtx.closePath();
  cnCtx.fill();
  // 3-line inscription
  cnCtx.font = '700 18px "JetBrains Mono", "Inter", sans-serif';
  cnCtx.textAlign = 'left';
  cnCtx.textBaseline = 'middle';
  cnCtx.fillText('ENGINEERED WITH PURPOSE', 124, 38);
  cnCtx.fillText('DESIGNED WITH PASSION', 124, 64);
  cnCtx.fillText('IN CANADA', 124, 90);
  const chainstayHeritageMap = new THREE.CanvasTexture(canCanvas);
  chainstayHeritageMap.colorSpace = THREE.SRGBColorSpace;
  chainstayHeritageMap.anisotropy = 16;

  // 5. Rear Seat Tube UCI Approval & Size "M" Badge (visible in 1_profil.png & 2_34.png!)
  const uciCanvas = document.createElement('canvas');
  uciCanvas.width = 128;
  uciCanvas.height = 256;
  const uCtx = uciCanvas.getContext('2d');
  uCtx.clearRect(0, 0, 128, 256);
  // White UCI approval box
  uCtx.fillStyle = '#f2f5fa';
  uCtx.beginPath();
  uCtx.roundRect(22, 24, 84, 96, 8);
  uCtx.fill();
  // UCI rainbow stripes + UCI text + ARGON 18 NITROGEN PRO code
  const uciColors = ['#0055a4', '#e4002b', '#111111', '#f5c400', '#009639'];
  uciColors.forEach((col, idx) => {
    uCtx.fillStyle = col;
    uCtx.fillRect(28, 64 + idx * 4, 72, 3.5);
  });
  uCtx.fillStyle = '#121418';
  uCtx.font = '800 22px "Inter", sans-serif';
  uCtx.textAlign = 'center';
  uCtx.fillText('UCI', 64, 52);
  uCtx.font = '700 9px "JetBrains Mono", sans-serif';
  uCtx.fillText('AR18-NPRO', 64, 100);
  uCtx.fillText('APPROVED', 64, 112);
  // Size "M" circle badge below UCI box
  uCtx.fillStyle = '#f2f5fa';
  uCtx.beginPath();
  uCtx.arc(64, 164, 22, 0, Math.PI * 2);
  uCtx.fill();
  uCtx.fillStyle = '#121418';
  uCtx.font = '800 22px "Inter", sans-serif';
  uCtx.fillText('M', 64, 172);
  const uciSeatTubeMap = new THREE.CanvasTexture(uciCanvas);
  uciSeatTubeMap.colorSpace = THREE.SRGBColorSpace;
  uciSeatTubeMap.anisotropy = 16;

  // 6. Bar Tape Finishing Collar Diagonal "ARGON 18" Embossed Pattern (visible in 3_cockpit.jpg & 7_speed_sniffer.jpg!)
  const finCanvas = document.createElement('canvas');
  finCanvas.width = 256;
  finCanvas.height = 128;
  const fCtx = finCanvas.getContext('2d');
  fCtx.fillStyle = '#121317';
  fCtx.fillRect(0, 0, 256, 128);
  fCtx.save();
  fCtx.fillStyle = '#282c36';
  fCtx.font = '800 15px "Inter", sans-serif';
  for (let y = -32; y < 160; y += 26) {
    for (let x = -64; x < 320; x += 98) {
      fCtx.save();
      fCtx.translate(x, y);
      fCtx.rotate(-0.32);
      fCtx.fillText('ARGON 18', 0, 0);
      fCtx.restore();
    }
  }
  fCtx.restore();
  const finishingTapeMap = new THREE.CanvasTexture(finCanvas);
  finishingTapeMap.wrapS = THREE.RepeatWrapping;
  finishingTapeMap.wrapT = THREE.RepeatWrapping;
  finishingTapeMap.colorSpace = THREE.SRGBColorSpace;

  // 7. Lower Aero Headset Spacer "ATTEN" Front Wordmark (visible in 3_cockpit.jpg & 7_speed_sniffer.jpg!)
  const spCanvas = document.createElement('canvas');
  spCanvas.width = 256;
  spCanvas.height = 64;
  const spCtx = spCanvas.getContext('2d');
  spCtx.clearRect(0, 0, 256, 64);
  spCtx.fillStyle = '#f2f5fa';
  spCtx.font = '800 28px "Inter", "Arial Black", sans-serif';
  spCtx.letterSpacing = '3px';
  spCtx.textAlign = 'center';
  spCtx.textBaseline = 'middle';
  spCtx.fillText('ATTEN', 128, 32);
  const attenSpacerMap = new THREE.CanvasTexture(spCanvas);
  attenSpacerMap.colorSpace = THREE.SRGBColorSpace;
  attenSpacerMap.anisotropy = 16;

  // 8. SRAM RED AXS E1 Brushed-Silver Parallelogram Outer Faceplate ("SRAM RED" Laser-Etched Stencil, matches crop_rd.png & crop_crank.png!)
  const dfCanvas = document.createElement('canvas');
  dfCanvas.width = 512;
  dfCanvas.height = 128;
  const dfCtx = dfCanvas.getContext('2d');
  const dfGrad = dfCtx.createLinearGradient(0, 0, 512, 128);
  dfGrad.addColorStop(0.0, '#d6dde8');
  dfGrad.addColorStop(0.45, '#f4f8ff');
  dfGrad.addColorStop(1.0, '#c8d1e0');
  dfCtx.fillStyle = dfGrad;
  dfCtx.fillRect(0, 0, 512, 128);

  // Fine horizontal CNC brushed metal grain
  dfCtx.strokeStyle = 'rgba(130, 142, 160, 0.22)';
  dfCtx.lineWidth = 1.0;
  for (let y = 2; y < 128; y += 3) {
    dfCtx.beginPath();
    dfCtx.moveTo(0, y);
    dfCtx.lineTo(512, y);
    dfCtx.stroke();
  }

  // Dark anodized beveled chamfer rim + laser-etched "SRAM RED" typography
  dfCtx.strokeStyle = '#20242c';
  dfCtx.lineWidth = 6;
  dfCtx.strokeRect(4, 4, 504, 120);

  dfCtx.fillStyle = '#181b22';
  dfCtx.font = 'italic 900 34px "Inter", "Arial Black", sans-serif';
  dfCtx.textAlign = 'left';
  dfCtx.textBaseline = 'middle';
  dfCtx.fillText('SRAM', 44, 42);
  dfCtx.font = 'italic 900 42px "Syne", "Arial Black", sans-serif';
  dfCtx.fillText('RED', 292, 82);

  const sramDerailleurFaceMap = new THREE.CanvasTexture(dfCanvas);
  sramDerailleurFaceMap.colorSpace = THREE.SRGBColorSpace;
  sramDerailleurFaceMap.anisotropy = 16;

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
    sramLeverBladeMapLeft,
    pacelineRotorMap,
    pacelineRotorNormalMap,
    physicsFormulaMap,
    rideElementMap,
    wedgeTorqueMap,
    chainstayHeritageMap,
    uciSeatTubeMap,
    finishingTapeMap,
    attenSpacerMap,
    sramDerailleurFaceMap,
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


