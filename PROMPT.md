# Master Prompt — Interactive 3D Aero Road Bike Showcase & Real-Time CFD Windtunnel

Copy and paste the prompt below into an agentic coding environment (along with 3–5 reference studio photos of the target bicycle: side profile, 3/4 hero, cockpit close-up, front view, and drivetrain/frame detail) to replicate this entire 100% procedural WebGL/Three.js exhibition from scratch.

---

```markdown
Build a museum-grade, ultra-realistic interactive 3D web exhibition and real-time aerodynamic CFD windtunnel simulation of the **Argon 18 Nitrogen Pro (Size M: 54–56, Aurora Charcoal / Gloss Carbon)** road bike equipped with **SRAM RED AXS E1 (12-speed 48/35T)**, **ATTEN CHB-01 integrated one-piece carbon aero cockpit**, **ATTEN integrated aero carbon bottle cages**, **ATTEN × Scope Artech 6.A+ (65mm) Aeroscale wheels**, and **Vittoria Corsa Pro 30c tan-wall tires**.

### 1. Core Architectural Constraint: 100% Procedural Geometry & Canvas PBR Textures
Do NOT rely on any external `.glb`/`.gltf` 3D assets or external image files. Every component and texture must be generated mathematically at runtime using **Three.js** (`BufferGeometry`, lofted cross-sections, `TubeGeometry`, `ExtrudeGeometry`, `InstancedMesh`) and **HTML5 2D Canvas PBR textures** (`CanvasTexture` for color, normal, roughness, alpha, and iridescent decals):

1. **Watertight Lofted Airfoil & Superellipse Tube Engine (`createLoftedAeroMesh`):**
   - Implement a custom cross-section lofting builder that takes an array of 3D stations `{ pos, chord, width, kamm, power, chordDir, widthDir }` and generates smooth-shaded `BufferGeometry` tubes using superellipse exponents (`power` 2.0–2.65) and Kamm-tail trailing-edge truncation (`kamm` 0.0–0.36).
   - **Critical Triangle Winding Rule:** Verify outward triangle winding analytically via the exact cross-product determinant `(chordDir × widthDir) · tangent < 0` so that every lofted tube (regardless of local axis orientation) has 100% outward-facing normals and never suffers from inside-out front-face culling.
   - Ensure watertight monocoque junctions where tubes meet: embed child tube start stations coaxially inside parent tube cross-sections with matching diameters and disable flat end caps (`capEnds = false`) on internal joints so no flat circular discs or gaps ever appear.

2. **Exact Argon 18 Nitrogen Pro (Size M) Coordinate Landmarks (in meters, origin at Bottom Bracket `[0, 0.263, 0]`):**
   - **Wheelbase:** `990mm` (`rearAxle = [-0.4023, 0.342, 0]`, `frontAxle = [0.5877, 0.342, 0]`, wheel outer radius `0.342m`).
   - **Frame Stack & Reach:** `headTop = [0.392, 0.818, 0]`, `headBot = [0.433, 0.686, 0]` (`72.7°` head tube angle with hourglass "Speed Sniffer" aero waist), `seatCluster = [-0.1434, 0.7472, 0]` (`73.5°` wheel-hugging aero seat tube).
   - **Signature Horizontal Dropped Seatstays:** Exit the seat tube horizontally at `Y = 0.566m`, sweep through a sculpted aero knee at `X = -0.198m`, and angle down to the rear thru-axle dropouts with 5-bar iridescent speed stripes below the knee.
   - **Dual-Finish Paint & Conformed 3D Decals:**
     - Upper/front frame & upper fork blades in **Aurora Charcoal** (`MeshPhysicalMaterial` with procedural micro-flake normal/roughness maps, `clearcoat: 1.0`, and subtle `iridescence`).
     - Lower downtube, BB shell, seat tube, chainstays, and lower fork in **Deep Gloss Piano Black Carbon**.
     - Conformed 3D surface-wrapped decals (`FrontSide` + `alphaTest` + `polygonOffset`) for the iridescent sliced **ARGON 18** downtube logo, the top-tube **NITROGEN PRO** + holographic prism band with molecular cluster emblems, and the headtube molecular badge.

3. **Steerable Front Assembly (`SteeringPivot` aligned with the `72.7°` Head Tube Axis):**
   - **Bayonet Aero Fork:** Wide aero fork crown and blades with mid-blade diagonal paint transition, 5-bar iridescent speed graphic, and front flat-mount SRAM RED AXS Paceline X brake caliper.
   - **ATTEN CHB-01 One-Piece Aero Cockpit:** Contoured aero spacer stack, horizontal stem body (`Y = 0.862m`), swept aero wing tops (`Z = -0.155m .. +0.155m`), out-front computer mount, Ciclovation spiral-wrapped bar tape on the compact drops, satin finishing tape collars, and 3-dot Argon 18 bar-end plugs.
   - **Sculpted Multi-Part SRAM RED AXS E1 (`ED-RED-E1`) Shift-Brake Controls:**
     - Coaxial bar-tape figure-8 clamp collar + 9-station lofted ergonomic silicone hood body rising at the E1 upward ramp into a tall, flat-fronted hydraulic pommel with `7.2°` inward toe-in cant and horizontal ergonomic grip ribs (`createSramHoodMaps`).
     - Flush medial AXS Bonus Button on the inner thumb flank of the pommel.
     - High-pivot 7-station sculpted carbon LFRT brake lever blade flaring outboard toward the drops with a concave one-finger braking saddle, curled lower tip, upper recessed pivot window, and vertical silver metallic `Red` speed-line graphic.
     - Nested composite eTap AXS electronic shift paddle tucked cleanly behind the carbon brake blade.

4. **ATTEN × Scope Artech 6.A+ (65mm) Wheelset & Vittoria Corsa Pro 30c Tires:**
   - 65mm deep aero carbon rims (`outerRadius = 0.313m`, `innerRadius = 0.248m`) mapped with procedural **Aeroscale** fish-scale dimple normal maps, directional `SCOPE` wordmarks, `ATTEN` valve decals, and `A` emblems at 12 o'clock.
   - 18/21 aero bladed carbon spokes laced tangentially to CNC hubs + alpha-perforated 160mm SRAM Paceline X Centerlock brake rotors.
   - Vittoria Corsa Pro 30c tires (`TorusGeometry` with exact V-coordinate mapping so vulcanized black tread sits on the outer crown, warm Para cotton tan sits on both sidewalls with `vittoria CORSA PRO` badges at 12/6 o'clock, and dark bead sits on the rim bed).

5. **SRAM RED AXS E1 12-Speed Drivetrain & Coupled Mechanical Animation:**
   - Alpha-perforated 1024×1024 **48/35T Direct-Mount Aero Chainring** + Quarq powermeter spider with green AXS LED, hollow-body carbon crank arms with silver `Red` graphics, and 12-speed **XG-1290 (10–33T)** skeletonized X-Dome cassette.
   - **114-Link 3D Hollow-Pin Flattop Chain:** Rendered via `InstancedMesh` along the exact closed-loop tangent/arc path over the 48T chainring, cassette cogs, and 12T X-Sync derailleur pulleys.
   - **Coupled Real-Time Kinematics:** Rotating the wheels at any target speed (`0–75 km/h`) accurately drives the tires, rims, spokes, rotors, crankset, cassette, derailleur pulleys, and individual 3D chain links along the arc-length parameterized path.

6. **Real-Time 3D Aerodynamic CFD Windtunnel (`src/windTunnel.js`):**
   - Multi-cylinder potential-flow + Kamm-tail wake velocity solver computing local airspeed ratio ($U/U_\infty$) and Bernoulli pressure coefficient ($C_p = 1 - (U/U_\infty)^2$) across 28 volumetric 3D streamlines, an animated floor boundary-layer grid, and a Kármán vortex wake particle system.
   - **3 Visualization Modes:** `CFD Pressure` ($C_p$ heatmap from stagnation red to suction cyan), `Laminar Smoke` (titanium-white windtunnel smoke rakes), and `Vortex Wake` (shedding wake turbulence).
   - **Live Aero Telemetry HUD:** Real-time calculation of effective $C_dA$ ($\text{m}^2$), aerodynamic drag force ($\text{N}$), aero power ($\text{W}$), and watt savings vs. baseline as the user adjusts **Wind Velocity (`20–70 km/h`)**, **Crosswind Yaw (`-15°` to `+15°`)**, **Smoke Rake Focus**, and **ATTEN Hydration trim** (`Aero Cages`, `Cages + Bidons`, `Stripped Race`).

7. **Curated Studio Environments, Camera Presets & Glassmorphic UI Dock:**
   - **4x MSAA + Half-Float HDR Post-Processing** (`EffectComposer`, `RenderPass`, `UnrealBloomPass`, `OutputPass` with ACES Filmic tone mapping) and a procedural studio environment lighting rig with 5 one-click presets (`Museum`, `Evening Sun`, `Morning Sun`, `Aero Lab`, and `5600K Pure White Cyclorama`).
   - **6 Camera Viewpoint Presets** (`3/4 Gallery`, `Pure Profile`, `ATTEN Cockpit`, `SRAM RED AXS`, `Scope Artech 6.A+`, `Dropped Stays`) with smooth quintic camera flight + **7 interactive 3D engineering hotspot pins**.
   - **Interactive Mechanics Dock:** Includes a **Wheel Spin Speed slider (`0–75 km/h`)**, **ATTEN Hydration** mode cycler, **Drivetrain Motion** toggle, and **Cockpit Pose** (`0°` straight vs. `+16°` showroom steer).
```
