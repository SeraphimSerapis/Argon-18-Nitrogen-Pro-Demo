import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { buildArgon18NitrogenPro } from './bikeGeometry.js';
import { createWindTunnelSystem } from './windTunnel.js';
import { createMuseumEnvironment } from './environment.js';

// ============================================================================
// 1. SCENE, CAMERA & RENDERER INITIALIZATION
// ============================================================================
const container = document.getElementById('canvas-container');
const loadingBar = document.getElementById('loading-bar-fill');
const loadingStatus = document.getElementById('loading-status');
const loadingOverlay = document.getElementById('loading-overlay');

if (loadingBar) loadingBar.style.width = '55%';

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  34,
  window.innerWidth / window.innerHeight,
  0.05,
  40
);

// Curated Camera Viewpoints
const CAMERA_VIEWS = {
  hero: {
    pos: new THREE.Vector3(1.15, 0.76, 1.85),
    target: new THREE.Vector3(0.08, 0.50, 0.0),
  },
  profile: {
    // Exact orthographic-like telephoto side profile matching the official Argon 18 shot
    pos: new THREE.Vector3(0.09, 0.51, 2.58),
    target: new THREE.Vector3(0.09, 0.51, 0.0),
  },
  cockpit: {
    pos: new THREE.Vector3(0.18, 1.06, 0.56),
    target: new THREE.Vector3(0.45, 0.82, 0.0),
  },
  drivetrain: {
    pos: new THREE.Vector3(-0.08, 0.36, 0.78),
    target: new THREE.Vector3(-0.10, 0.31, 0.03),
  },
  wheel: {
    pos: new THREE.Vector3(0.76, 0.42, 0.82),
    target: new THREE.Vector3(0.58, 0.36, 0.0),
  },
  rear: {
    pos: new THREE.Vector3(-0.68, 0.65, 0.78),
    target: new THREE.Vector3(-0.20, 0.52, 0.0),
  },
  front: {
    pos: new THREE.Vector3(1.16, 0.80, 0.0),
    target: new THREE.Vector3(0.45, 0.78, 0.0),
  },
};

camera.position.copy(CAMERA_VIEWS.hero.pos);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
container.appendChild(renderer.domElement);

// Post-Processing Pipeline (4x Hardware MSAA + Half-Float HDR + Specular/CFD Bloom)
const msaaRenderTarget = new THREE.WebGLRenderTarget(
  window.innerWidth,
  window.innerHeight,
  {
    samples: 4,
    type: THREE.HalfFloatType,
  }
);
const composer = new EffectComposer(renderer, msaaRenderTarget);
composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.18, // Subtle bloom strength for metallic sparkles & CFD streamlines
  0.48, // Radius
  0.85  // High threshold so only bright specular glints & streamlines bloom
);
composer.addPass(bloomPass);

const outputPass = new OutputPass();
composer.addPass(outputPass);

// Orbit Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(CAMERA_VIEWS.hero.target);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.minDistance = 0.32;
controls.maxDistance = 5.2;
controls.maxPolarAngle = Math.PI * 0.505; // Prevent going under the museum floor
controls.autoRotate = false;
controls.autoRotateSpeed = 0.65;
controls.update();

// ============================================================================
// 2. BUILD MUSEUM ENVIRONMENT, ARGON 18 NITROGEN PRO & WINDTUNNEL
// ============================================================================
if (loadingStatus) loadingStatus.textContent = 'Calibrating museum lighting & Scope Aeroscale carbon…';
if (loadingBar) loadingBar.style.width = '82%';

const museumEnv = createMuseumEnvironment(scene, renderer);
const bike = buildArgon18NitrogenPro();
scene.add(bike.rootGroup);

const windTunnel = createWindTunnelSystem();
scene.add(windTunnel.windGroup);

if (loadingBar) loadingBar.style.width = '100%';
if (loadingOverlay) {
  loadingOverlay.classList.add('fade-out');
}

// ============================================================================
// 3. SMOOTH CAMERA FLIGHT & HOTSPOT ANNOTATIONS
// ============================================================================
let camFlight = null;

function flyToView(targetPos, targetLookAt, duration = 1.05) {
  camFlight = {
    startPos: camera.position.clone(),
    startTarget: controls.target.clone(),
    endPos: targetPos.clone(),
    endTarget: targetLookAt.clone(),
    elapsed: 0,
    duration,
  };
}

// Cancel programmatic camera flight if the user grabs the canvas
renderer.domElement.addEventListener('pointerdown', () => {
  camFlight = null;
});

// Create DOM pins for the 7 interactive 3D engineering hotspots
const hotspotsLayer = document.getElementById('hotspots-layer');
const hotspotCard = document.getElementById('hotspot-detail-card');
const hotspotNumEl = document.getElementById('hotspot-number');
const hotspotTagEl = document.getElementById('hotspot-tag');
const hotspotTitleEl = document.getElementById('hotspot-title');
const hotspotDescEl = document.getElementById('hotspot-desc');
const hotspotCloseBtn = document.getElementById('hotspot-close-btn');

const hotspotPins = [];

function selectHotspot(hs, fly = true) {
  hotspotPins.forEach((p) => p.el.classList.toggle('active', p.data.id === hs.id));
  if (hotspotCard) {
    hotspotCard.style.display = 'block';
    hotspotNumEl.textContent = hs.id;
    hotspotTagEl.textContent = hs.tag;
    hotspotTitleEl.textContent = hs.title;
    hotspotDescEl.textContent = hs.desc;
  }
  if (fly && hs.camPos && hs.camTarget) {
    flyToView(hs.camPos, hs.camTarget, 0.95);
    document.querySelectorAll('.cam-btn').forEach((b) => b.classList.remove('active'));
  }
}

bike.hotspots.forEach((hs, idx) => {
  const pin = document.createElement('button');
  pin.className = `hotspot-pin${idx === 0 ? ' active' : ''}`;
  pin.textContent = hs.id;
  pin.title = hs.title;
  pin.setAttribute('aria-label', `Inspect ${hs.title}`);
  pin.addEventListener('click', (e) => {
    e.stopPropagation();
    selectHotspot(hs, true);
  });
  hotspotsLayer.appendChild(pin);
  hotspotPins.push({ el: pin, data: hs });
});

if (hotspotCloseBtn) {
  hotspotCloseBtn.addEventListener('click', () => {
    hotspotCard.style.display = 'none';
    hotspotPins.forEach((p) => p.el.classList.remove('active'));
  });
}

// Project 3D hotspot coordinates onto 2D viewport each frame
const projVec = new THREE.Vector3();
function updateHotspotProjections() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  for (let i = 0; i < hotspotPins.length; i++) {
    const { el, data } = hotspotPins[i];
    projVec.copy(data.pos);
    projVec.project(camera);

    if (projVec.z > 1.0) {
      el.style.display = 'none';
      continue;
    }

    el.style.display = 'flex';
    const x = (projVec.x * 0.5 + 0.5) * w;
    const y = (-projVec.y * 0.5 + 0.5) * h;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }
}

// ============================================================================
// 4. UI CONTROLS & INTERACTIVITY BINDINGS
// ============================================================================

// 4.1 Camera Viewpoint Buttons
document.querySelectorAll('.cam-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const viewKey = btn.dataset.cam;
    const view = CAMERA_VIEWS[viewKey];
    if (!view) return;
    document.querySelectorAll('.cam-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    flyToView(view.pos, view.target, 1.0);
  });
});

// 4.2 Header Action Chips (Annotations, Turntable, Hide UI)
const toggleHotspotsBtn = document.getElementById('toggle-hotspots-btn');
toggleHotspotsBtn?.addEventListener('click', () => {
  const isHidden = hotspotsLayer.classList.toggle('hidden');
  toggleHotspotsBtn.classList.toggle('active', !isHidden);
});

const toggleAutorotateBtn = document.getElementById('toggle-autorotate-btn');
toggleAutorotateBtn?.addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate;
  toggleAutorotateBtn.classList.toggle('active', controls.autoRotate);
});

const toggleUiBtn = document.getElementById('toggle-ui-btn');
toggleUiBtn?.addEventListener('click', () => {
  document.body.classList.toggle('ui-hidden');
});

// 4.3 Lighting Atmosphere Presets & Sliders
const activeLightLabel = document.getElementById('active-light-label');
const sunAzimuthSlider = document.getElementById('sun-azimuth-slider');
const sunAzimuthVal = document.getElementById('sun-azimuth-val');
const sparkleSlider = document.getElementById('sparkle-slider');
const sparkleVal = document.getElementById('sparkle-val');

document.querySelectorAll('.light-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const presetKey = btn.dataset.light;
    document.querySelectorAll('.light-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    const az = parseFloat(sunAzimuthSlider?.value || '38');
    const preset = museumEnv.applyPreset(presetKey, az);
    if (activeLightLabel) activeLightLabel.textContent = preset.name;

    // Slightly boost bloom in Evening Sun & Aero Lab modes
    bloomPass.strength =
      presetKey === 'evening' ? 0.28 : presetKey === 'aerolab' ? 0.32 : presetKey === 'studio' ? 0.08 : 0.20;
  });
});

sunAzimuthSlider?.addEventListener('input', (e) => {
  const deg = parseFloat(e.target.value);
  if (sunAzimuthVal) sunAzimuthVal.textContent = `${deg}°`;
  museumEnv.setSunAzimuth(deg);
});

sparkleSlider?.addEventListener('input', (e) => {
  const pct = parseFloat(e.target.value);
  if (sparkleVal) sparkleVal.textContent = `${pct}%`;
  bike.setSparkleIntensity(pct / 85);
});

// 4.4 Aerodynamic Windtunnel Controls & Live Telemetry HUD
const wtToggleBtn = document.getElementById('windtunnel-toggle-btn');
const wtBtnText = document.getElementById('windtunnel-btn-text');
const aeroTelemetryPanel = document.getElementById('aero-telemetry-panel');
const teleSpeed = document.getElementById('tele-speed');
const teleYaw = document.getElementById('tele-yaw');
const teleCda = document.getElementById('tele-cda');
const teleWatts = document.getElementById('tele-watts');

const windSpeedSlider = document.getElementById('wind-speed-slider');
const windSpeedVal = document.getElementById('wind-speed-val');
const windYawSlider = document.getElementById('wind-yaw-slider');
const windYawVal = document.getElementById('wind-yaw-val');
const smokeElevSlider = document.getElementById('smoke-elevation-slider');
const smokeElevVal = document.getElementById('smoke-elevation-val');

function refreshTelemetryHUD() {
  const tele = windTunnel.getTelemetry();
  if (teleSpeed) teleSpeed.innerHTML = `${tele.speedKmh} <small>km/h</small>`;
  if (teleYaw) teleYaw.textContent = tele.yawDeg;
  if (teleCda) teleCda.innerHTML = `${tele.cda} <small>m&sup2;</small>`;
  if (teleWatts) teleWatts.innerHTML = `${tele.wattSavings} <small>W</small>`;
}

function toggleWindTunnel(forceState) {
  const nextState = forceState !== undefined ? forceState : !windTunnel.state.active;
  windTunnel.setActive(nextState);
  wtToggleBtn?.classList.toggle('active', nextState);
  wtToggleBtn?.setAttribute('aria-pressed', String(nextState));
  if (wtBtnText) {
    wtBtnText.textContent = nextState ? 'WINDTUNNEL ACTIVE' : 'ACTIVATE WINDTUNNEL';
  }
  if (aeroTelemetryPanel) {
    aeroTelemetryPanel.classList.toggle('hidden', !nextState);
  }
  refreshTelemetryHUD();
}

wtToggleBtn?.addEventListener('click', () => toggleWindTunnel());

windSpeedSlider?.addEventListener('input', (e) => {
  const v = parseFloat(e.target.value);
  if (windSpeedVal) windSpeedVal.textContent = `${v} km/h`;
  windTunnel.setParameters({ windSpeedKmh: v });
  refreshTelemetryHUD();
});

windYawSlider?.addEventListener('input', (e) => {
  const yaw = parseFloat(e.target.value);
  if (windYawVal) windYawVal.textContent = `${yaw >= 0 ? '+' : ''}${yaw.toFixed(1)}°`;
  windTunnel.setParameters({ yawDeg: yaw });
  refreshTelemetryHUD();
});

smokeElevSlider?.addEventListener('input', (e) => {
  const focus = parseFloat(e.target.value);
  if (smokeElevVal) {
    smokeElevVal.textContent = focus === 0 ? 'Full Field' : `Beam ${focus}%`;
  }
  windTunnel.setParameters({ smokeFocus: focus });
});

document.querySelectorAll('.sub-pill[data-flow]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.flow;
    document.querySelectorAll('.sub-pill[data-flow]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    windTunnel.setParameters({ flowMode: mode });
    if (!windTunnel.state.active) {
      toggleWindTunnel(true);
    }
  });
});

// 4.5 Mechanical & Trim Configuration Toggles
const toggleBottlesBtn = document.getElementById('toggle-bottles-btn');
const bottlesStateText = document.getElementById('bottles-state-text');
const hydrationModes = [
  { key: 'cages', label: 'Aero Cages' },
  { key: 'bottles', label: 'Cages + Bidons' },
  { key: 'stripped', label: 'Stripped Race' },
];
let hydrationIdx = 0;

toggleBottlesBtn?.addEventListener('click', () => {
  hydrationIdx = (hydrationIdx + 1) % hydrationModes.length;
  const mode = hydrationModes[hydrationIdx];
  bike.setHydrationMode(mode.key);
  windTunnel.setParameters({ hydrationMode: mode.key });
  refreshTelemetryHUD();
  if (bottlesStateText) bottlesStateText.textContent = mode.label;
});

let drivetrainStandbySpin = true;
let wheelSpinSpeedKmh = 18.0;
let lastNonZeroSpinKmh = 18.0;
let customSpinOverride = false;

const wheelSpeedSlider = document.getElementById('wheel-speed-slider');
const wheelSpeedVal = document.getElementById('wheel-speed-val');
const toggleDrivetrainBtn = document.getElementById('toggle-drivetrain-spin-btn');
const drivetrainStateText = document.getElementById('drivetrain-state-text');

function syncDrivetrainUI(speedKmh) {
  const rounded = Math.round(speedKmh);
  if (wheelSpeedSlider) wheelSpeedSlider.value = String(rounded);
  if (wheelSpeedVal) {
    wheelSpeedVal.textContent = rounded > 0 ? `${rounded} km/h` : '0 km/h';
  }
  if (drivetrainStateText) {
    drivetrainStateText.textContent = rounded > 0 ? `Active (${rounded} km/h)` : 'Static Pose';
  }
}

wheelSpeedSlider?.addEventListener('input', (e) => {
  const v = parseFloat(e.target.value);
  wheelSpinSpeedKmh = v;
  customSpinOverride = true;
  if (v > 0) {
    drivetrainStandbySpin = true;
    lastNonZeroSpinKmh = v;
  } else {
    drivetrainStandbySpin = false;
  }
  syncDrivetrainUI(v);
});

toggleDrivetrainBtn?.addEventListener('click', () => {
  drivetrainStandbySpin = !drivetrainStandbySpin;
  customSpinOverride = true;
  if (drivetrainStandbySpin) {
    wheelSpinSpeedKmh = lastNonZeroSpinKmh > 0 ? lastNonZeroSpinKmh : 18.0;
  } else {
    wheelSpinSpeedKmh = 0.0;
  }
  syncDrivetrainUI(wheelSpinSpeedKmh);
});

let isForkSteered = false;
const steerForkBtn = document.getElementById('steer-fork-btn');
const steerStateText = document.getElementById('steer-state-text');
steerForkBtn?.addEventListener('click', () => {
  isForkSteered = !isForkSteered;
  bike.setSteeringAngle(isForkSteered ? 16 : 0);
  if (steerStateText) {
    steerStateText.textContent = isForkSteered ? 'Showroom (+16°)' : 'Straight (0°)';
  }
});

// Keyboard Shortcuts (W = Windtunnel, H = Hide UI, R = Turntable)
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'w') toggleWindTunnel();
  if (k === 'h') document.body.classList.toggle('ui-hidden');
  if (k === 'r') toggleAutorotateBtn?.click();
});

// Responsive Window Resize
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
});

// Support deep-link URL query parameters (?view=profile&hotspot=01&light=evening&wind=1&flow=smoke&yaw=8&spin=0&ui=0)
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.toString().length > 0 && loadingOverlay) {
  loadingOverlay.style.display = 'none';
}
const paramView = urlParams.get('view');
if (paramView === 'toptube') {
  camera.position.set(0.06, 0.96, 0.34);
  controls.target.set(0.02, 0.76, 0.0);
  controls.update();
} else if (paramView && CAMERA_VIEWS[paramView]) {
  camera.position.copy(CAMERA_VIEWS[paramView].pos);
  controls.target.copy(CAMERA_VIEWS[paramView].target);
  controls.update();
  document.querySelectorAll('.cam-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.cam === paramView);
  });
}
const paramHotspot = urlParams.get('hotspot');
if (paramHotspot) {
  const hs = bike.hotspots.find((h) => h.id === paramHotspot);
  if (hs) {
    camera.position.copy(hs.camPos);
    controls.target.copy(hs.camTarget);
    controls.update();
  }
}
const paramLight = urlParams.get('light') || urlParams.get('lighting');
if (paramLight) {
  const lightBtn = document.querySelector(`.light-btn[data-light="${paramLight}"]`);
  lightBtn?.click();
}
const paramYaw = urlParams.get('yaw');
if (paramYaw !== null) {
  const yaw = parseFloat(paramYaw);
  if (windYawSlider) windYawSlider.value = String(yaw);
  if (windYawVal) windYawVal.textContent = `${yaw >= 0 ? '+' : ''}${yaw.toFixed(1)}°`;
  windTunnel.setParameters({ yawDeg: yaw });
}
const paramFlow = urlParams.get('flow');
if (paramFlow) {
  const flowBtn = document.querySelector(`.sub-pill[data-flow="${paramFlow}"]`);
  flowBtn?.click();
  windTunnel.update(0.35);
}
if (urlParams.get('wind') === '1') {
  toggleWindTunnel(true);
  windTunnel.update(0.35);
}
const paramSpin = urlParams.get('spin');
if (paramSpin !== null) {
  const spinVal = parseFloat(paramSpin);
  customSpinOverride = true;
  if (!Number.isNaN(spinVal) && spinVal > 0) {
    drivetrainStandbySpin = true;
    wheelSpinSpeedKmh = Math.min(75, Math.max(0, spinVal));
    lastNonZeroSpinKmh = wheelSpinSpeedKmh;
  } else {
    drivetrainStandbySpin = false;
    wheelSpinSpeedKmh = 0.0;
  }
  syncDrivetrainUI(wheelSpinSpeedKmh);
}
if (urlParams.get('ui') === '0') {
  document.body.classList.add('ui-hidden');
  hotspotsLayer.classList.add('hidden');
}

// ============================================================================
// 5. MAIN RENDER & SIMULATION LOOP
// ============================================================================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  // Smooth Camera Flight Interpolation
  if (camFlight) {
    camFlight.elapsed += dt;
    const t = Math.min(1.0, camFlight.elapsed / camFlight.duration);
    // Quintic ease-out
    const ease = 1 - Math.pow(1 - t, 4);
    camera.position.lerpVectors(camFlight.startPos, camFlight.endPos, ease);
    controls.target.lerpVectors(camFlight.startTarget, camFlight.endTarget, ease);
    if (t >= 1.0) camFlight = null;
  }

  controls.update();

  // Mechanical Drivetrain & Wheel Animation:
  // Uses the user-selected Wheel Spin Speed slider (or syncs with Windtunnel airspeed unless explicitly overridden)
  const activeBikeSpeedKmh = !drivetrainStandbySpin
    ? 0.0
    : windTunnel.state.active && !customSpinOverride
    ? windTunnel.state.windSpeedKmh
    : wheelSpinSpeedKmh;
  bike.updateMechanicalAnimation(dt, activeBikeSpeedKmh);

  // Update 3D Aerodynamic Windtunnel CFD Simulation
  windTunnel.update(dt);

  // Project 3D Hotspot Annotations
  updateHotspotProjections();

  // Render via Post-Processing Composer
  composer.render();
}

animate();

