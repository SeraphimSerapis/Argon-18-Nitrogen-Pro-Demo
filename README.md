# Argon 18 Nitrogen Pro — Interactive 3D Aero Archive & CFD Windtunnel

An interactive, museum-grade 3D industrial design showcase and real-time aerodynamic CFD windtunnel simulation of the **Argon 18 Nitrogen Pro (Size M · Aurora Charcoal)** equipped with **SRAM RED AXS E1** and **ATTEN × Scope Artech 6.A+ (65mm)** wheels.

Built with **100% procedural Three.js geometry and procedural HTML5 Canvas PBR textures** — zero external `.glb`/`.gltf` models or image files required.

---

## Quick Start (Run Locally)

### Prerequisites
- **Node.js** `>= 18` and **npm**

### 1. Clone & Install
```bash
git clone git@github.com:SeraphimSerapis/Argon-Demo.git
cd Argon-Demo
npm install
```

### 2. Start the Interactive Dev Server
```bash
npm run dev
```
This launches Vite and opens the 3D exhibit in your browser at `http://localhost:5173`.

### 3. Build & Preview Production Bundle
```bash
npm run build
npm run preview
```
The self-contained static build is output to `dist/` with relative asset paths (`base: './'`), so it can be hosted on **GitHub Pages**, **Cloudflare Pages**, **Vercel**, **Netlify**, or any static file server.

---

## Key Features

- **100% Procedural CAD-Grade Geometry (`src/bikeGeometry.js`):**
  - Lofted Kamm-tail airfoil and superellipse cross-sections (`createLoftedAeroMesh`) for the Argon 18 Nitrogen Pro monocoque frame, hourglass "Speed Sniffer" head tube, bayonet Aero fork, and signature horizontal double-bend dropped seatstays.
  - **ATTEN CHB-01 One-Piece Aero Carbon Cockpit** with integrated out-front computer mount, Ciclovation spiral-wrapped bar tape, and multi-part sculpted **SRAM RED AXS E1 (`ED-RED-E1`)** shift-brake controls (textured silicone grip ribs, medial AXS Bonus Button, high-pivot carbon LFRT brake lever blades with vertical silver `Red` graphics, and nested eTap shift paddles).
  - **ATTEN × Scope Artech 6.A+ 65mm Wheelset** with fish-scale *Aeroscale* carbon dimples, Carbonlite Aero spokes, Vittoria Corsa Pro 30c cotton tan-wall tires, and SRAM Paceline X Centerlock rotors.
  - **SRAM RED AXS E1 12-Speed Drivetrain** with alpha-perforated 48/35T direct-mount aero chainring & Quarq powermeter spider, hollow-pin 114-link Flattop chain, XG-1290 10-33T cassette, and X-Sync pulley cage.
- **Procedural Canvas PBR Textures (`src/textures.js`):**
  - Aurora Charcoal metallic micro-flake normal/roughness maps, Scope Aeroscale dimple normal maps, iridescent holographic sliced `ARGON 18` & top-tube prism decals, and CNC-perforated chainring/cassette masks.
- **Real-Time 3D Aerodynamic Windtunnel (`src/windTunnel.js`):**
  - Potential-flow velocity & Bernoulli pressure coefficient ($C_p$) streamline solver around the bike's actual 3D aerodynamic stations, plus Kármán vortex wake shedding, animated floor boundary-layer grid, and live telemetry HUD ($C_dA$, drag in Newtons, aero power, and watt savings).
- **Interactive Controls & URL Deep-Linking (`src/main.js`):**
  - **5 Studio & Outdoor Lighting Environments:** Museum Gallery, Evening Sun, Morning Sun, Aero Lab, and Daylight Cyclorama (`5600K Pure`).
  - **Adjustable Wheel Spin Speed Slider:** Dial wheel & coupled drivetrain cadence continuously from `0 km/h` (Static Pose) to `75 km/h` (Full Sprint).
  - **Deep-Link Query Parameters:** Share exact states via URL parameters, e.g. `?view=cockpit&light=studio&spin=28` or `?view=hero&wind=1&flow=cfd&yaw=7.5`.

---

## Keyboard Shortcuts
- **`W`** — Toggle 3D Aerodynamic Windtunnel
- **`R`** — Toggle 360° Turntable Orbit
- **`H`** — Hide/Show UI Overlay (Pure Museum View)
