# IDEA & DESIGN SPECIFICATION: `MiseFlow AR` (v2.0 Grandmaster Edition)
**A Zero-Touch Spatial Choreography, True-Scale Metrology, & Thermodynamic Vision Co-Pilot for Snap SPECS**

**Target Hackathon:** [Learn AR with SPECS on Devpost](https://learn-specs.devpost.com/)  
**Architecture Paradigm:** Closed-Loop Agentic Development (CLAD) + Lens Studio 5.22+ MCP + Spectacles Interaction Kit (SIK) + Spectacles UI Kit + LEAF Automated Testing  
**Cognitive Design Protocol:** Engineered via the 6-Gate `deep-cognitive-preflight` Architecture (`S0` $\to$ `S12`)

---

## 1. Executive Vision & The Grandmaster Thesis

### 1.1 The Core Problem: Why Screens Fail in Physical Craft
Cooking a multi-component meal—such as **Crispy-Skin Pan-Seared Salmon, Bias-Cut Garlic Asparagus, and Shallot-Lemon Beurre Blanc**—is not a reading problem. It is a **real-time, multi-surface spatial-temporal coordination problem** executed with occupied, messy hands:
1. **Sensory & Motor Lockout:** Your dominant hand holds an 8-inch chef's knife or hot skillet handle; your non-dominant hand is covered in raw fish protein, olive oil, or lemon juice. Touching an iPad, smartphone, or laptop trackpad is unsanitary, clumsy, and breaks physical flow.
2. **Spatial-Temporal Desynchronization:** A recipe is a Directed Acyclic Graph (DAG) spread across three physical zones (Prep Board, Primary Sear Burner, Sauce/Simmer Burner). When dicing shallots takes 35 seconds longer than planned, a traditional timer on Burner 1 keeps ticking blindly—causing the butter to burn before the shallots ever leave the cutting board.
3. **Metrology & Thermal Blindness:** Beginners ruin dishes because they cannot eyeball a true $1.5\text{ cm}$ dice versus a $0.4\text{ cm}$ julienne, hate dirtying extra measuring cups for a $45\text{ g}$ pile of aromatics, and cannot tell when a pan surface or protein crust has hit the exact Maillard browning window ($140^\circ\text{C}–165^\circ\text{C}$).

### 1.2 The Solution: `MiseFlow AR` (v2.0 Grandmaster Edition)
**`MiseFlow AR`** transforms any kitchen countertop and stove (as well as the Lens Studio Simulator room) into a **living, zero-touch spatial instrument**. It completely eliminates floating 2D recipe windows. Instead, it anchors interactive 3D geometry, procedural shader fields, volumetric depth gauges, and acoustic/vision sensors directly onto the physical surfaces where your hands work:

* **On the Cutting Board (`PrepBoardStation`):** Projects a **Metric-Locked 3D Laser Cut-Curtain** ($1.5\text{ cm}$ cubes, $0.4\text{ cm}$ julienne, or $45^\circ$ diagonal bias planes) that **automatically steps forward across the vegetable on every acoustic *"thunk"* of your knife blade hitting the board**, paired with a **Depth-Diff Volumetric Portion Dome** that fills with liquid-gold light as your real chopped pile grows inside it.
* **Over the Stove (`SkilletStation` & `SaucepotStation`):** Projects **Concentric Additive Thermal Rings** and **Navier-Stokes Inspired Convection Steam Ribbons** that visualize heat intensity and countdown convergence, plus a **60 FPS Chromatic Maillard Spectroscopy Overlay** that highlights under-seared vs. crispy-browned zones directly on the food inside the pan.
* **Across the Countertop (`SpatialConduitsRoot`):** Connects stations with **Parabolic 3D Energy Transfer Arcs** that physically bridge the cutting board to the exact burner where chopped ingredients belong, governed by a **Backward-Scheduled Reactive DAG** that automatically adjusts burner hold-times whenever prep runs fast or slow.
* **On the Chef (`Deictic Multimodal & Ghost-Hand Coach`):** Keeps both hands 100% free via **Deictic Gaze + Voice (`/specs-asr`)** and **1.2-Second Gaze-Dwell Rings**, spawns an articulated **3D Holographic Ghost Hand** to demonstrate knife angles and spoon-basting motion at 1:1 scale, and places a 3-button **Chef's Chrono-Band** on the non-dominant wrist with a **`10x Demo Time-Warp`** toggle for instant end-to-end review.

---

## 2. Deep Cognitive Preflight (`S10` $\to$ `S12`): The 5 "Impossible-Sounding Yet 100% Feasible" Moonshot Upgrades

To elevate `MiseFlow AR` beyond anything ever submitted to a Snap Spectacles hackathon, we ran the **6-Gate `deep-cognitive-preflight` protocol** specifically targeting features that look like futuristic SIGGRAPH demos to judges, while proving their **deterministic, 100% feasible implementation** inside Lens Studio 5.22+ using CLAD skills.

### Preflight Synthesis Matrix: Breaking the "Unfeasible" Barrier

| Moonshot Feature | Why It Sounds Impossible at First Glance | The First-Principles Feasibility Proof in Lens Studio 5.22+ (CLAD) |
| :--- | :--- | :--- |
| **1. Acoustic Knife-Strike Auto-Stepping (`AcousticCadenceTracker.ts`)** | *"How can AR glasses know every time my physical chef's knife slices through an onion on the cutting board without hardware sensors on the knife?"* | **100% Feasible via Audio Envelope Follower + Spectral Transient Gate:** Every chop on a cutting board produces a sharp acoustic impulse ($800\text{ Hz}–3.2\text{ kHz}$, $<25\text{ ms}$ attack). Using `/specs-audio` microphone input (with a deterministic timer/pinch impulse generator in Preview/LEAF), a 20-line TypeScript transient detector spots peak amplitude spikes above the ambient noise floor with a $180\text{ ms}$ debounce and increments `u_ActiveSliceIndex` in `MetricPrepBlueprint.ts`—making the 3D laser cut-line step across the board on every chop! |
| **2. Depth-Diff Volumetric Pile Gauge (`DepthVolumeScanner.ts`)** | *"How can glasses weigh or measure 45 grams of chopped shallots on a flat board without a digital kitchen scale?"* | **100% Feasible via `/specs-depth` Baseline Subtraction ($\Delta D$):** When `PrepBoardStation` is placed, we sample a $5 \times 5$ raycast/depth grid inside the $8\text{ cm}$ Portion Dome footprint to record the flat board height $H_0$. As the user piles chopped food inside the ring (or drags the simulated pile slider in Preview/LEAF), the height difference $\Delta H_i = H_t(x_i, z_i) - H_0$ integrated over the circle area yields the volume $V \approx \sum \Delta H_i \cdot \Delta A$. We feed normalized $V / V_{\text{target}} \in [0, 1]$ into `u_DomeFillLevel` in `/shader-graph`! |
| **3. 60 FPS Maillard Browning Spectroscopy Shader (`MaillardTomography.mat` + Gemini RSG)** | *"How can optical glasses show a live thermal browning heat-map on food inside a skillet without an infrared FLIR camera?"* | **100% Feasible via GPU Chromaticity LUT + `/specs-ai-remote-service` Calibration:** The Maillard reaction ($140^\circ\text{C}–165^\circ\text{C}$) causes a deterministic shift in visible surface reflectance from pale/pink (high R/B ratio) to golden-amber (high R+G, low B) to carbonized char (low luminance). Using Snap's `Crop Camera Texture` fed into a `/shader-graph` HSV/YCbCr band-pass node inside the skillet ring, the GPU highlights golden-brown crust zones in real time at 60 FPS, while `/specs-ai-remote-service` (Gemini Vision) periodically calibrates the exact readiness percentage! |
| **4. Holographic Ghost-Hand Technique Coach (`GhostHandAnimator.ts`)** | *"How can a user learn the exact $45^\circ$ roll-cut knife angle or tilt-and-baste pan motion without watching a 2D video?"* | **100% Feasible via `/build-mesh` + Procedural Transform Choreography:** Instead of a complex full-body avatar, we spawn a sleek, translucent Fresnel-rim-lit **Articulated Ghost Hand & Tool Twin** (Chef's Knife or Basting Spoon) right above the station for 4 seconds at the start of a technique. Driven by a lightweight mathematical Hermite spline in TypeScript (`GhostHandAnimator.ts`), it performs the exact 1:1 physical motion path in 3D space right where your real hand goes! |
| **5. Thermodynamic Curl-Noise Convection Ribbons (`ConvectionVortex.vfx`)** | *"How do you show exact heat intensity (Low Simmer vs. Hard Sear vs. Smoke Point Danger) without floating numbers?"* | **100% Feasible via `/vfx-graph` Vector Fields:** Instead of generic smoke sprites, we author a GPU particle ribbon emitter anchored to each burner ring. A single normalized parameter `u_ThermalEnergy` ($0.0 \to 1.0$) drives vertical velocity, curl-noise turbulence frequency, and additive color ramp—morphing smoothly from lazy cyan laminar waves (Simmer) to tight golden spirals (Peak Sear) to rapid coral sparks (Overheat Alert). |

---

## 3. Complete 3D Asset & Procedural Geometry Specification

Every 3D element in `MiseFlow AR` is classified into one of two categories: **(A) AI/Static Ghost-Twin Station Props** generated via CLAD's `/build-mesh` (`SPECS text-to-3D` / `FAST3D`), and **(B) Runtime Parametric Metrology & Choreography Meshes** generated dynamically in TypeScript via `/mesh-builder-scripting` (`MeshBuilder`).

### 3.1 World-Scale Metric Convention & Coordinate System
* **Lens Studio Metric Standard:** $1.0\text{ scene unit} = 1.0\text{ centimeter}$ in physical world space.
* **Optimal Ergonomic Placement Zone:** Stations anchor to horizontal surfaces (`table` / `countertop`) at $65\text{ cm}–110\text{ cm}$ viewing distance, tilted $15^\circ–40^\circ$ below eye level to eliminate neck and arm fatigue (per [Snap's Designing for Movement guidelines](https://developers.snap.com/spectacles/best-practices/design-for-spectacles/designing-for-movement)).
* **Binocular Overlap Safe-Frame:** All primary focal elements fit comfortably inside the $53\text{ cm} \times 77\text{ cm}$ (3:4 portrait) full binocular overlap zone at $1.1\text{ m}$.

### 3.2 Catalog of 3D Assets (`/build-mesh` Static & Animated Twins)

| Asset Name | CLAD Generation Tool | Real-World Dimensions ($W \times H \times D$) | Polycount Budget | Visual Geometry & Structural Details |
| :--- | :--- | :--- | :--- | :--- |
| **`ButcherBlockBoard.glb`** | `/build-mesh` (`SPECS text-to-3D`) | $36\text{ cm} \times 3\text{ cm} \times 24\text{ cm}$ | $\le 1,800$ tris | Chamfered rectangular chef's cutting board with recessed juice groove and corner alignment notches. Pivot at bottom-center $(0, 0, 0)$ for instant surface snapping. |
| **`ChefSkillet.glb`** | `/build-mesh` (`SPECS text-to-3D`) | $26\text{ cm}$ pan $\varnothing$ ($44\text{ cm}$ w/ handle) $\times 5.5\text{ cm}$ | $\le 2,400$ tris | flared French carbon-steel skillet with ergonomic angled handle ($18\text{ cm}$ long) showing safe-grip zone vs. hot-metal collar. Pivot at base-center. |
| **`SimmerSaucepot.glb`** | `/build-mesh` (`SPECS text-to-3D`) | $18\text{ cm}\ \varnothing \times 11\text{ cm}$ height | $\le 2,000$ tris | Heavy-bottomed saucier pot with poured-lip rim and twin side loop handles. Includes an internal liquid-level disc mesh (`SauceSurfaceDisc`) at $Y = +4.5\text{ cm}$. |
| **`GhostChefKnife.glb` & `GhostBastingSpoon.glb`** | `/build-mesh` (`SPECS text-to-3D`) | Knife: $32\text{ cm}$ length; Spoon: $22\text{ cm}$ | $\le 1,200$ tris each | Stylized low-poly holographic culinary tools paired with a simplified ghost-hand grip cuff, animated along procedural spline paths by `GhostHandAnimator.ts`. |
| **`SimIngredientsPack.glb`** *(For Preview Rehearsal Mode)* | `/build-mesh` (`FAST3D` / `SPECS`) | Salmon fillet ($14 \times 6 \times 3\text{ cm}$), Shallot, Asparagus spears | $\le 1,500$ tris total | Interactive 3D rehearsal ingredients that sit inside the Prep Board and Skillet when `Rehearsal Mode` is active in Lens Studio Preview. |

### 3.3 Catalog of Runtime Parametric Geometry (`/mesh-builder-scripting`)

All procedural geometry is constructed at runtime using Lens Studio's `MeshBuilder` API (`Interleaved-Vertex` layout: `Position` vec3, `Normal` vec3, `UV0` vec2, `Color` vec4) so metric dimensions never distort when station boundaries are adjusted:

#### 1. `MetricCutGridMesh` & `LaserCutCurtainMesh` (`MetricPrepBlueprint.ts`)
* **Purpose:** Projects true-scale millimeter cutting lines and an active 3D vertical laser light-plane directly onto the cutting board.
* **Parametric Math:**
  - Given board active cutting width $W = 24.0\text{ cm}$ and depth $D = 16.0\text{ cm}$, and selected cut spacing $s \in \{0.4\text{ cm (Julienne)}, 0.8\text{ cm (Mince)}, 1.5\text{ cm (Dice)}, 2.5\text{ cm (Batonnet)}\}$ and bias angle $\theta \in \{0^\circ, 45^\circ\}$:
  - Number of slicing planes: $N = \lfloor W / s \rfloor$.
  - For each index $i \in [0, N]$, generate a $0.12\text{ cm}$ wide quad strip resting at $Y = +0.05\text{ cm}$ above the board surface, rotated by $\theta$.
  - **The Active Laser Cut-Curtain:** At the current slice index $k = \text{u\_ActiveSliceIndex} \pmod N$, extrude a vertical translucent quad plane of height $H_{\text{curtain}} = 5.5\text{ cm}$ perpendicular to the board with top-to-bottom UV gradient ($v = 0$ at board surface, $v = 1$ at top fade-out). Every acoustic knife chop increments $k \to k + 1$, sliding the vertical laser plane by exactly $s\text{ cm}$!

#### 2. `VolumetricPortionDomeMesh` (`MetricPrepBlueprint.ts`)
* **Purpose:** Replaces measuring cups and scales with a true-scale 3D geodesic hemisphere on the upper-right quadrant of the cutting board.
* **Parametric Math:**
  - For a target ingredient volume $V_{\text{target}}$ (e.g., $45\text{ ml}$ / $3\text{ tbsp}$ diced shallots), since the volume of a hemisphere is $V = \frac{2}{3}\pi r^3$, the exact world-space radius is computed dynamically as:
    $$r = \left(\frac{3 V_{\text{target}}}{2\pi}\right)^{1/3} \approx 2.78\text{ cm}\ (\text{or } 3.85\text{ cm for } 120\text{ ml})$$
  - Generates a $16\text{ (azimuth)} \times 8\text{ (elevation)}$ latitude-longitude dome mesh with vertex `UV0.y` mapped strictly to normalized height $y / r \in [0, 1]$ so the liquid-gold depth-fill shader rises accurately from the base to the apex.

#### 3. `ConcentricThermalRingMesh` (`ConcentricThermalRing.ts`)
* **Purpose:** Sits flat around the perimeter of `SkilletStation` ($R_{\text{outer}} = 16.0\text{ cm}, R_{\text{inner}} = 13.2\text{ cm}$) and `SaucepotStation` ($R_{\text{outer}} = 12.0\text{ cm}, R_{\text{inner}} = 9.5\text{ cm}$), leaving the center 100% unobstructed so the user clearly sees the real food.
* **Parametric Math:**
  - Consists of 3 concentric annular rings (64 radial segments):
    1. **Outer Station Bezel Ring:** Static ticks every $30^\circ$ (clock-face reference).
    2. **Middle Contracting Convergence Ring:** Radius interpolates smoothly from $R_{\text{outer}}$ down to $R_{\text{inner}}$ as station remaining time $t_{\text{rem}} \to 0$, so all active stations visually contract toward their inner golden target ring simultaneously.
    3. **Inner Golden Target Ring:** Fixed at $R_{\text{inner}}$; flashes with a harmonic bloom when the Contracting Ring locks into it at $T_0 = 00:00$.

#### 4. `ParabolicTransferArcMesh` & `AttentionConduitMesh` (`SpatialTransferArc.ts`)
* **Purpose:** Physically connects stations in 3D space when an ingredient must move from `PrepBoard` to `Skillet` or `Saucepot`, and guides gaze along the countertop when an off-screen burner needs attention.
* **Parametric Math:**
  - Given start anchor $\mathbf{P}_0$ (Cutting Board Portion Dome) and end anchor $\mathbf{P}_2$ (Target Burner Center), compute elevated apex control point:
    $$\mathbf{P}_1 = \frac{\mathbf{P}_0 + \mathbf{P}_2}{2} + \begin{bmatrix} 0 \\ \max(18.0\text{ cm}, 0.35 \|\mathbf{P}_2 - \mathbf{P}_0\|) \\ 0 \end{bmatrix}$$
  - Sample 32 points along the quadratic Bezier curve $\mathbf{B}(u) = (1-u)^2\mathbf{P}_0 + 2(1-u)u\mathbf{P}_1 + u^2\mathbf{P}_2$ for $u \in [0, 1]$, sweeping an 8-sided tubular cross-section of radius $r(u) = 0.6\text{ cm} \cdot \sin(\pi u)$ (tapered at both ends) with `UV0.x = u` so chevron energy pulses scroll smoothly from $\mathbf{P}_0 \to \mathbf{P}_2$.

---

## 4. Master Material, Shader Graph, & Optical Waveguide Specification (`/shader-graph`)

Because SPECS uses **additive stereo waveguide optics**, standard mobile PBR materials with white backgrounds or dark opaque colors fail. We define **5 custom Material/Shader Graph assets** engineered specifically for additive see-through optics following [Google Design's Jetpack Compose Glimmer principles](https://design.google/library/transparent-screens) and [Snap's UI Design color guidelines](https://developers.snap.com/spectacles/best-practices/design-for-spectacles/ui-design).

### 4.1 The Additive Optical Color Palette (Zero-Halation Tokens)

| Semantic Token | Hex Code | Linear RGB `(R, G, B)` | Optical Role on See-Through Waveguide |
| :--- | :--- | :--- | :--- |
| **`CleanPlateOccluder`** | `#080A0E` | `(0.008, 0.011, 0.018)` | Near-black backing pill with 88% alpha under 3D text labels; absorbs background clutter without causing light bleed. |
| **`GlimmerChalkText`** | `#F4F7FA` | `(0.91, 0.94, 0.97)` | Desaturated warm-white for $\ge 0.85^\circ$ typography; avoids 100% pure `#FFFFFF` peak halation while maintaining $>11:1$ perceived contrast. |
| **`CryoPrepCyan`** | `#64FFDA` | `(0.13, 1.00, 0.71)` | High-visibility mint-cyan for raw prep grids, active laser cut-curtains, and low-heat simmer states. |
| **`MaillardAmberGold`** | `#FFD54F` | `(1.00, 0.66, 0.08)` | Luminous golden-amber for optimal sear temperature ($155^\circ\text{C}$), volumetric dome fill, and `T-Zero Plating` convergence. |
| **`PyroAlertCoral`** | `#FF6E6E` | `(1.00, 0.16, 0.16)` | Desaturated high-luminance coral-red for urgent `<10s` flip windows and overheat warnings (pure `#FF0000` is avoided as it looks dim on waveguides). |
| **`HoldSyncViolet`** | `#B388FF` | `(0.45, 0.25, 1.00)` | Soft electric lavender indicating automatic DAG lag-compensation hold state (`HEAT HOLD • SYNCED`). |

### 4.2 Detailed Node-by-Node Shader Graph Specifications (`/shader-graph`)

#### Shader 1: `Mat_GhostTwinWireframe.mat` (Applied to `ButcherBlockBoard`, `ChefSkillet`, `SimmerSaucepot`, `GhostChefHand`)
* **Blend Mode:** `Additive` (in Live Overlay Mode) / `Premultiplied Alpha` (in Rehearsal Mode), `Depth Write: Off`, `Two-Sided: On`.
* **Shader Graph Node Topology:**
  1. **`Fresnel / Facing Ratio Node`**: Computes $(1.0 - \max(0, \mathbf{N} \cdot \mathbf{V}))^{2.8}$ so the center of the pan/board is 95% transparent (never blocking real food!) while the silhouette rim glows crisply.
  2. **`World Position Grid Modulo Node`**: Takes `WorldPosition.xz`, multiplies by `u_GridScale`, and passes through `frac()` + `smoothstep(0.02, 0.0, ...)` to draw subtle technical CAD wireframe contours across the vessel surface.
  3. **`Mode Interpolation (`u_RehearsalBlend` $\in [0, 1]$)`**: When `u_RehearsalBlend = 1.0` (Lens Studio Preview Rehearsal Mode), blends in a stylized dark-slate metallic PBR base (`Roughness: 0.35, Metallic: 0.8`) so the 3D vessels look solid and rich against the simulator room; when `u_RehearsalBlend = 0.0` (Live Stove Mode), collapses to pure rim-wireframe so only the real physical pan is seen inside the ring.

#### Shader 2: `Mat_LaserCutCurtain.mat` (Applied to `LaserCutCurtainMesh` & `VolumetricPortionDomeMesh`)
* **Blend Mode:** `Additive`, `Depth Test: LessEqual`, `Depth Write: Off`.
* **Shader Graph Node Topology:**
  1. **`Vertical Curtain Curtain Attenuation`**: Multiplies base color `CryoPrepCyan` (`#64FFDA`) by $(1.0 - \text{UV0.y})^{2.2}$ so the laser plane is razor-bright right where it touches the cutting board ($v=0$) and fades smoothly into thin air $5.5\text{ cm}$ above the board ($v=1$).
  2. **`Acoustic Chop Ripple Impulse (`u_ChopImpulseTime`)`**: Whenever `AcousticCadenceTracker.ts` detects a knife chop, it resets `u_ChopImpulseTime = getTime()`. The shader expands a radial sine-wave ring from the cut line (`sin((dist - dt * 25.0) * 12.0) * exp(-dt * 6.0)`), giving instant visual confirmation of every physical knife strike!
  3. **`Volumetric Dome Liquid Fill (`u_DomeFillLevel` $\in [0, 1]$)`**: On the Portion Dome mesh, uses `smoothstep(u_DomeFillLevel + 0.03, u_DomeFillLevel - 0.03, UV0.y)` to fill the lower portion of the hemisphere up to the measured depth-diff volume with shimmering `MaillardAmberGold` (`#FFD54F`) and a glowing meniscus ring right at the current fill line.

#### Shader 3: `Mat_ThermodynamicRing.mat` (Applied to `ConcentricThermalRingMesh`)
* **Blend Mode:** `Additive`, `Depth Write: Off`.
* **Shader Graph Node Topology:**
  1. **`Radial Polar Progress Mask`**: Converts `UV0` to polar angle $\phi = \text{atan2}(y, x) \in [0, 2\pi]$ and compares against `u_CountdownProgress * 2\pi` with anti-aliased `fwidth()` edges.
  2. **`Tri-State Thermal Color Ramp`**: Driven by `u_ThermalState` ($0.0 = \text{Prep/Cool Cyan}$, $0.5 = \text{Active Sear Gold}$, $1.0 = \text{Urgent Flip/Overheat Coral}$, $-1.0 = \text{DAG Hold Violet}$).
  3. **`Harmonic Urgency Pulse`**: Modulates emissive intensity by $1.0 + 0.35 \sin(\text{Time} \cdot \omega)$, where angular frequency $\omega$ scales dynamically from $2.0\text{ rad/s}$ (calm simmer) to $14.0\text{ rad/s}$ during the final 10-second flip window.

#### Shader 4: `Mat_MaillardSpectroscopy.mat` (Applied to the Inner Inspection Disc of `SkilletStation`)
* **Blend Mode:** `Additive`, `Depth Write: Off`.
* **Shader Graph Node Topology:**
  1. **`Camera Region Texture Sample`**: Samples the cropped camera texture (`u_SkilletCameraCropTex`) projected into the skillet's inner circle during an active `"Check Sear"` scan.
  2. **`Maillard Chromaticity Isolator`**: Computes the golden-brown reflectance index:
     $$I_{\text{Maillard}} = \text{saturate}\left(\frac{(R - B) \cdot (G - 0.5B)}{R + G + B + \epsilon} \cdot 3.2\right)$$
  3. **`False-Color Contour Overlay & Laser Sweep`**: Sweeps a horizontal scan-line (`u_ScanSweepY`) across the pan over 1.2 seconds, illuminating high-$I_{\text{Maillard}}$ seared crust contours in `MaillardAmberGold` and under-seared raw zones in `CryoPrepCyan`.

#### Shader 5: `Mat_ParabolicFlowArc.mat` (Applied to `ParabolicTransferArcMesh` & `AttentionConduitMesh`)
* **Blend Mode:** `Additive`, `Depth Write: Off`.
* **Shader Graph Node Topology:**
  1. **`Scrolling Chevron Energy Wave`**: Computes `frac(UV0.x * 6.0 - Time * 2.4)` combined with `abs(UV0.y - 0.5)` to generate directional light chevrons racing along the parabolic tube from the cutting board directly into the target skillet.
  2. **`Endpoint Soft Fade`**: Multiplies alpha by `sin(UV0.x * PI)` so the arc emerges seamlessly from the cutting board dome and dissolves smoothly into the center of the pan.

---

## 5. VFX Graph & Spatial Audio Synthesis Bible (`/vfx-graph`, `/build-sfx`, `/build-music`, `/specs-audio`)

### 5.1 GPU Particle Systems (`/vfx-graph`)

1. **`VFX_ThermodynamicConvection` (Attached to `SkilletStation` & `SaucepotStation`):**
   * **Spawn Rate:** $18\text{ particles/sec}$ (Ribbon trail mode, 12 trail segments per particle).
   * **Physics & Curl Noise:** Upward buoyancy $v_y = \text{lerp}(4\text{ cm/s}, 16\text{ cm/s}, \text{u\_ThermalEnergy})$ + 3D Curl Noise field (Amplitude: $\text{lerp}(1.5, 8.0, \text{u\_ThermalEnergy})$, Frequency: $0.4\text{ Hz}$).
   * **Visual Read:** At low heat, ribbons rise in calm, translucent cyan-white laminar waves; at peak sear ($155^\circ\text{C}$), they twist into golden convection vortices; if overheating occurs, small high-velocity coral micro-sparks (`Lifetime: 0.4s`) eject radially from the ring perimeter.
2. **`VFX_TransferPayloadBurst` (Attached to `ParabolicTransferArcMesh`):**
   * **Behavior:** When a prep step completes (`"PrepConfirmButton"` triggered), emits a 1.1-second stream of 40 luminous golden motes that travel along the parabolic Bezier curve $\mathbf{B}(u)$ and burst into a soft radial ripple upon landing in the skillet.
3. **`VFX_PlatingConvergenceBloom` (Triggered at `T-Zero = 00:00`):**
   * **Behavior:** When all 3 stations reach `00:00` simultaneously, all three concentric rings emit a synchronized golden shockwave ring and ascending celebratory shimmer particles.

### 5.2 3D Positional Spatial Audio & Acoustic Feedback (`/build-sfx`, `/build-music`, `/specs-audio`)

Following [Microsoft's Holographic Frame audio-first wayfinding](https://learn.microsoft.com/en-us/windows/mixed-reality/design/holographic-frame) and [Google Glimmer's peripheral cue principles](https://design.google/library/transparent-screens), every visual transition is paired with a bespoke spatial audio asset attached to the exact 3D `SceneObject` in world space:

| Audio Asset Name | CLAD Skill | Acoustic Profile & Frequency Design | Spatial Trigger & Purpose |
| :--- | :--- | :--- | :--- |
| **`sfx_chop_step_tick.wav`** | `/build-sfx` | Crisp, warm marimba/woodblock harmonic click ($1.1\text{ kHz}$ fundamental, $45\text{ ms}$ decay). | Plays at `PrepBoardStation` every time the laser cut-curtain advances by one slice increment. |
| **`sfx_dome_target_chime.wav`** | `/build-sfx` | Ascending major-fifth glass bell chord ($523\text{ Hz}\ \text{C5} \to 784\text{ Hz}\ \text{G5}$). | Plays when the Depth-Diff Volumetric Portion Dome reaches `100% (45g)` fill capacity. |
| **`sfx_transfer_arc_whoosh.wav`** | `/build-sfx` | Doppler-panned airy crystalline swoosh ($1.1\text{ s}$ duration) moving in 3D space from $\mathbf{P}_0 \to \mathbf{P}_2$. | Physically pans across the user's ears from the cutting board to the target stove burner along the 3D Transfer Arc. |
| **`sfx_offscreen_burner_beacon.wav`** | `/build-sfx` | Gentle, pulsing warm brass/sizzle ping ($660\text{ Hz}$, 3 pulses over $1.8\text{ s}$) with HRTF 3D spatialization. | Fires when an off-FOV burner enters a `<10s` action window, pulling the user's head turn before the countertop conduit pulse arrives. |
| **`sfx_dag_hold_shift.wav`** | `/build-sfx` | Smooth down-tempo synth chord swell ($440\text{ Hz} \to 330\text{ Hz}$). | Confirms that `ChoreographyDAG` automatically shifted downstream burner timers to prevent burning during a prep delay. |
| **`bgm_culinary_flow_pulse.mp3`** | `/build-music` | Minimalist, low-volume ($12\%$ mix gain) ambient acoustic lo-fi pulse at $96\text{ BPM}$ with zero vocals (never interferes with `/specs-asr`). | Provides a subtle rhythmic tempo during active prep and smoothly resolves to a warm chord at `T-Zero Plating`. |

---

## 6. End-to-End Spatial Experience & User Journey (Act I $\to$ Act V)

### Act I: The 5-Second Task-Free Spatial Orientation & Station Snap (`0:00 – 0:20`)
1. **Launch & Gaze-Guided Welcome:** Upon launching `MiseFlow AR`, there are zero pop-up text walls. A soft spatial chime plays as the **Non-Dominant Wrist Command Pill** briefly illuminates with a subtle hand-glance hint (`"GLANCE AT LEFT WRIST FOR CONTROLS"`).
2. **Surface Locking (`/specs-world-query` + `/specs-depth`):** The user looks at their kitchen counter (or the Lens Studio Preview table). Three luminous Ghost-Twin anchors (`PrepBoardStation`, `SkilletStation`, `SaucepotStation`) snap onto the horizontal surface at 1:1 metric scale. Users can fine-tune station positions via SIK pinch-drag (`Container` manipulators) or immediately lock them via a 1.2-second Gaze-Dwell or saying `"Lock stations"`.
3. **Sequential Wave Orientation:** A 3-second introductory light wave pulses sequentially from `1. Prep Board (Cyan)` $\to$ `2. Skillet (Gold)` $\to$ `3. Saucepot (Cyan)`, establishing spatial mental mapping before any timer begins.

### Act II: True-Scale Metric Prep, Acoustic Blade-Stepping, & Volumetric Portioning (`0:20 – 0:55`)
1. **Ghost-Hand Technique Preview (`4 Seconds`):** Above `PrepBoardStation`, the translucent **`GhostChefKnife`** materializes for 4 seconds, demonstrating the exact $45^\circ$ bias slice on the asparagus and $1.5\text{ cm}$ dice on the shallots, then fades cleanly out of the way.
2. **Acoustic Blade-Strike Auto-Stepping:** The **3D Laser Cut-Curtain** projects a razor-sharp $1.5\text{ cm}$ slicing grid across the cutting board. As the chef chops with both hands holding the knife and food, `AcousticCadenceTracker.ts` listens to each blade strike on the wood—sending a cyan ripple across the board and stepping the active vertical laser plane forward by $1.5\text{ cm}$ per chop!
3. **Depth-Diff Volumetric Portioning:** As the chef sweeps the diced shallots into the glowing **Volumetric Portion Dome** ($r = 2.78\text{ cm}, 45\text{ g}$) on the corner of the board, `DepthVolumeScanner.ts` measures the rising pile height ($\Delta D$) and fills the hemisphere with liquid golden light up to the `100%` meniscus ring (`sfx_dome_target_chime.wav`).
4. **Zero-Touch Step Completion & 3D Transfer Arc:** Without lifting a messy hand to pinch a button, the chef glances at `PrepConfirmButton` for 1.2 seconds (or says `"Done"`). Instantly, the **`ParabolicTransferArcMesh`** erupts from the Portion Dome and arches through 3D space right into the center of `SaucepotStation`, accompanied by `sfx_transfer_arc_whoosh.wav` and the 4-word surface badge: **`DROP SHALLOTS IN POT`**.

### Act III: Multi-Burner DAG Choreography & Reactive Lag Compensation (`0:55 – 1:30`)
1. **Backward-Scheduled Convergence:** `ChoreographyDAG.ts` runs all three stations backward from a single synchronized `T-Zero Plating` clock so the salmon (6 min sear), asparagus (4 min sauté), and beurre blanc sauce (5 min reduction) finish at the exact same second.
2. **Live Lag Compensation Stress-Test:** Suppose the chef takes an extra 25 seconds on the cutting board (or triggers `"Hold"` via voice / `HoldDagButton`). Instead of letting the preheating skillet burn the oil, `ChoreographyDAG.ts` immediately recalculates the dependency graph, shifts `SkilletStation`'s drop window by `+25s`, switches its ring shader to `HoldSyncViolet` (`#B388FF`), lowers its convection VFX to calm waves, and updates its clean-plate badge to **`HEAT HOLD • SYNCED +25S`**.

### Act IV: Holographic Frame Wayfinding & 60 FPS Maillard Vision Spectroscopy (`1:30 – 2:05`)
1. **Off-FOV Burner Alert (`HolographicFrameDirector.ts`):** While the chef is looking right at `PrepBoardStation`, `SkilletStation` (off-screen to the left, outside the 3:4 holographic frame) enters its critical 10-second flip window. First, `sfx_offscreen_burner_beacon.wav` pings from the left in 3D space; 150ms later, the **`AttentionConduitMesh`** fires a 1.8-second coral-gold light pulse *along the physical countertop surface* from the cutting board to the skillet, smoothly guiding the chef's head turn without any screen-locked HUD clutter!
2. **Closed-Loop Maillard Spectroscopy & Gemini Check (`SpatialVisionInspector.ts`):** Looking at `SkilletStation`, the chef says *"Check sear"* (or triggers `SkilletConfirmButton`). Immediately (<16ms), `Mat_MaillardSpectroscopy.mat` sweeps a laser line across the skillet interior, illuminating golden-brown Maillard crust contours in `MaillardAmberGold` while `/specs-camera` + `/specs-ai-remote-service` (Gemini Vision) returns structured JSON telemetry (`{ "status": "UNDER_SEARED", "deltaSeconds": 25, "badge": "EXTEND SEAR +25S" }`), automatically extending the skillet timer by 25 seconds and syncing the saucepot!

### Act V: `10x Demo Time-Warp` & Golden Plating Convergence (`2:05 – 2:45`)
1. **Continuous-Take Convergence (`TimeWarpToggleButton`):** Toggling **`10x Time-Warp`** on the non-dominant wrist accelerates the entire reactive DAG by $10\times$. Viewers watch all three concentric thermal rings contract in unison toward their inner golden target rings as transfer arcs fire across the counter.
2. **Golden Plating Zero (`T = 00:00`) & Debrief Card:** As all three rings lock into their inner golden bezels at `00:00`, `VFX_PlatingConvergenceBloom` triggers a synchronized golden celebration across the stove, and the **Plating Convergence Summary Card** appears above the prep board: **`3/3 STATIONS SYNCED (±0.8S) • READY TO PLATE`**.

---

## 7. Complete System Architecture, Event Bus Contracts, & LEAF Test Matrix

### 7.1 Decoupled Event Bus Architecture (`MiseFlowEventBus.ts`)

Per CLAD's strict architectural boundary rules, `/specs-build-ui` (`UIKit` components on the Wrist Command Pill) and `/specs-interaction-recipes` (`SIK` 3D station interactables, voice, and gaze-dwell) never mutate each other directly. All communication flows through typed events on `MiseFlowEventBus`:

| Event Channel Name | Payload Schema | Emitted By | Consumed By |
| :--- | :--- | :--- | :--- |
| **`STATION_STEP_COMPLETED`** | `{ stationId: "PREP" \| "SKILLET" \| "SAUCEPOT", triggerSource: "SIK" \| "DWELL" \| "VOICE" \| "ACOUSTIC" }` | `StationInteractableController.ts`, `GazeContextTracker.ts`, `AcousticCadenceTracker.ts` | `ChoreographyDAG.ts`, `SpatialTransferArc.ts` |
| **`DAG_HOLD_TOGGLED`** | `{ isHeld: boolean, lagDeltaSeconds: number }` | `WristUIController.ts` (`HoldDagButton`), `/specs-asr` (`"Hold"`) | `ChoreographyDAG.ts`, `ConcentricThermalRing.ts` |
| **`GHOST_MODE_CHANGED`** | `{ mode: "REHEARSAL_SOLID" \| "LIVE_WIREFRAME", blend: number }` | `WristUIController.ts` (`GhostModeToggleButton`) | `Mat_GhostTwinWireframe.mat` uniform controller |
| **`TIME_WARP_TOGGLED`** | `{ multiplier: 1.0 \| 10.0 }` | `WristUIController.ts` (`TimeWarpToggleButton`) | `ChoreographyDAG.ts`, `VFX_ThermodynamicConvection` |
| **`MAILLARD_VISION_RESULT`** | `{ stationId: string, status: "UNDER_SEARED" \| "OPTIMAL", deltaSeconds: number, badgeText: string }` | `SpatialVisionInspector.ts` (Gemini RSG / Deterministic LEAF Mock) | `ChoreographyDAG.ts`, `Mat_MaillardSpectroscopy.mat` |
| **`ACOUSTIC_CHOP_DETECTED`** | `{ sliceIndex: number, totalSlices: number, spacingCm: number }` | `AcousticCadenceTracker.ts` | `MetricPrepBlueprint.ts`, `Mat_LaserCutCurtain.mat` |
| **`VOLUME_DOME_UPDATED`** | `{ fillRatio: number, gramsEstimated: number, isComplete: boolean }` | `DepthVolumeScanner.ts` | `MetricPrepBlueprint.ts`, `Mat_LaserCutCurtain.mat` |

### 7.2 Deterministic 7-Scenario LEAF Automated Test Suite (`Assets/Tests/MiseFlowLeafSuite.ts`)

Every single feature—including the 5 Grandmaster Moonshots—is wired to a deterministic SIK `Interactable` or script trigger so **LEAF (`Leaf.lspkg`)** can verify the entire experience autonomously in Lens Studio Preview and print `PASSED` in the Logger during the demo video:

| Scenario ID | Scenario Class Name | What LEAF Simulates (`DefaultLeafInteractor` / `LeafHandInteractor`) | Deterministic `expect()` Assertions Verified |
| :--- | :--- | :--- | :--- |
| **`01_station_surface_calibration`** | `StationCalibrationScenario` | Verifies all 3 station `SceneObject` containers spawn at 1:1 metric scale and toggles `GhostModeToggleButton`. | `expect(prepBoard.enabled).toBe(true)` and `expect(ghostMaterial.mainPass.u_RehearsalBlend).toBeCloseTo(0.0, 2)` in Live mode. |
| **`02_metric_grid_and_acoustic_chop`** | `AcousticBladeSteppingScenario` | Triggers simulated chop impulse on `PrepBoardInteractable` 3 times and switches cut mode from `1.5cm Dice` to `0.4cm Julienne`. | `expect(laserCurtain.getTransform().getLocalPosition().x)` steps by exact $+1.5\text{ cm}$ per impulse; grid line count updates without transform stretch. |
| **`03_depth_diff_volumetric_dome`** | `VolumetricDomeFillScenario` | Simulates depth-pile accumulation inside `VolumetricPortionDome` from $0\% \to 100\%$ ($45\text{ g}$). | `expect(domeMaterial.mainPass.u_DomeFillLevel).toBeCloseTo(1.0, 2)` and `expect(prepLabel.text).toBe("DOME FULL 45G • READY")`. |
| **`04_prep_to_skillet_transfer_arc`** | `PrepToSkilletTransferScenario` | `await interactor.trigger(prepConfirm)` to complete the Prep step. | `expect(transferArcMesh.enabled).toBe(true)` and `expect(skilletLabel.text).toBe("DROP INTO SKILLET NOW")`. |
| **`05_dag_reactive_lag_compensation`** | `DagLagCompensationScenario` | `await interactor.trigger(holdDagButton)` to inject a $+25\text{ s}$ prep delay. | `expect(skilletLabel.text).toBe("HEAT HOLD • SYNCED +25S")` and `expect(skilletRingMat.mainPass.u_ThermalState).toBe(-1.0)`. |
| **`06_maillard_vision_spectroscopy`** | `MaillardVisionCheckScenario` | Triggers `SpatialVisionInspector` on `SkilletInteractable` using the deterministic test provider. | `expect(skilletLabel.text).toBe("EXTEND SEAR +25S")` and `expect(dag.getRemainingSeconds("SKILLET")).toBeGreaterThan(prevRemaining)`. |
| **`07_time_warp_plating_convergence`** | `TimeWarpConvergenceScenario` | `await interactor.trigger(timeWarpButton)` (`10x` speed) and awaits convergence. | All 3 stations reach `00:00` within $\pm 0.05\text{ s}$ delta and `expect(debriefCard.enabled).toBe(true)`. |

---

## 8. Master Prompt to Generate `/devpost` Docs & Build `MiseFlow AR v2.0` with CLAD

### 8.1 Step 1: Run `plan-lens` (`challengepost/learn-specs`)
After running `npx skills add challengepost/learn-specs --all -y`, invoke `Run the plan-lens skill` and paste this summary when prompted:

```text
We are building MiseFlow AR (v2.0 Grandmaster Edition) for Snap SPECS: a zero-touch spatial culinary choreography, 1:1 metric metrology, and thermodynamic vision co-pilot.
- Problem & User: Home cooks and culinary learners coordinating multi-burner dishes (Pan-Seared Salmon, Bias-Cut Garlic Asparagus, Shallot Beurre Blanc) whose hands are occupied with knives and raw ingredients, making phones, tablets, or floating 2D browser windows unusable.
- How it fulfills the 3 Laws of Glasses AR:
  1. Shares Your View: Uses /specs-camera, Maillard Chromaticity Spectroscopy shaders, /specs-depth volumetric pile scanning, and /specs-ai-remote-service (Gemini Vision) to inspect real-world sear browning and chopped ingredient volume, directly mutating 3D timers and shader states in place.
  2. Draws in the World at Real Size: Zero floating 2D recipe panels. Uses /specs-world-query and /mesh-builder-scripting to project a metric-locked 1.5cm/0.4cm 3D Laser Cut-Curtain (which steps forward automatically on every acoustic knife chop via /specs-audio transient detection), a true-scale 3D Volumetric Portion Dome (r = 2.78cm for 45g), concentric additive thermal burner rings, a 4-second 3D Ghost-Hand Technique Coach, and parabolic 3D transfer arcs connecting the cutting board to the exact target pan.
  3. Leaves Your Body Free: Uses Deictic Gaze Context + /specs-asr voice commands ("Done", "Hold", "Check sear"), 1.2s Gaze-Dwell confirmation rings, and acoustic blade-strike auto-stepping, plus a 3-button non-dominant Wrist Command Pill (/specs-build-ui) featuring Ghost-Twin Rehearsal Mode and a 10x Demo Time-Warp toggle.
- Optical & Spatial UX Compliance: Strictly follows Google Glimmer additive display rules (dark #080A0E clean-plates, desaturated high-luminance tokens #64FFDA / #FFD54F / #FF6E6E, >=0.85° bold typography at the 1.1m binocular overlap plane), John Cheng's Scene-Over-Screen, and Microsoft's Holographic Frame wayfinding (3D HRTF spatial audio beacon + 1.8s countertop attention conduit for off-FOV burners).
```

### 8.2 Step 2: Closed-Loop CLAD Build Execution Prompt
Once `plan-lens` writes your `/devpost` planning folder, feed this orchestration prompt to your coding agent:

```text
Read the /devpost planning docs and IDEA_AND_DESIGN.md, and let's build MiseFlow AR (v2.0 Grandmaster Edition) using CLAD skills in strict sequence:
1. Run /specs-project-init, /reset-preview-environment, and /ensure-package-installed for SpectaclesInteractionKit, SpectaclesUIKit, and Leaf.
2. Run /icon-selector and /font-selector first, then use /specs-build-ui to create WristCommandContainer (GhostModeToggleButton, HoldDagButton, TimeWarpToggleButton) and PlatingDebriefCard, wired exclusively through MiseFlowEventBus.ts.
3. Use /build-mesh to create our Ghost-Twin station models (ButcherBlockBoard, ChefSkillet, SimmerSaucepot, GhostChefKnife) and assemble StationsRoot (PrepBoardStation, SkilletStation, SaucepotStation) with SIK Interactables ("PrepBoardInteractable", "SkilletInteractable", "SaucepotInteractable", "PrepConfirmButton", "SkilletConfirmButton", "SaucepotConfirmButton") and clean-plate 3D labels ("PrepStatusLabel", "SkilletStatusLabel", "SaucepotStatusLabel").
4. Use /mesh-builder-scripting to build MetricPrepBlueprint.ts (MetricCutGridMesh, vertical LaserCutCurtainMesh that steps per chop, and VolumetricPortionDomeMesh with exact r = (3V / 2pi)^(1/3) metric radius), ConcentricThermalRing.ts, and SpatialTransferArc.ts (ParabolicTransferArcMesh + countertop AttentionConduitMesh).
5. Use /shader-graph and /vfx-graph to build Mat_GhostTwinWireframe, Mat_LaserCutCurtain (with u_ChopImpulseTime ripple and u_DomeFillLevel meniscus), Mat_ThermodynamicRing, Mat_MaillardSpectroscopy, Mat_ParabolicFlowArc, and VFX_ThermodynamicConvection.
6. Implement ChoreographyDAG.ts (backward-scheduled multi-burner DAG with automatic lag compensation and 10x Time-Warp), AcousticCadenceTracker.ts (audio transient chop detector + deterministic preview trigger), DepthVolumeScanner.ts (/specs-depth delta volume scanner), GazeContextTracker.ts (1.2s gaze-dwell + deictic gaze focus), GhostHandAnimator.ts (4s spline technique demo), and SpatialVisionInspector.ts (/specs-camera + Gemini RSG + deterministic LEAF fallback).
7. Add spatial audio cues via /build-sfx and /build-music, verify every visual state in Preview with /verify-preview, and run all 7 automated scenarios in Assets/Tests/MiseFlowLeafSuite.ts via /specs-leaf-run-in-preview until all 7 log PASSED.
```
