# Master Implementation Plan: `MiseFlow AR v5.0` (Universal AI Culinary Mastery & OS Page-Table Architecture)

**Target Competition:** [Learn AR with SPECS Hackathon (Devpost)](https://learn-specs.devpost.com/) | **Submission Deadline:** November 9, 2026 @ 2:00 PM PST  
**Target Runtime:** Snap Spectacles (`targetPlatform: Spectacles` • Snap OS 5.62+ / SPECS 2026 • Lens Studio 5.24.1)  
**Repository Base:** `louji2308/miseflow` (Upgrading from WS10/WS11 Single-Dish State $\to$ WS12–WS17 Universal AI Multi-Dish State)  
**Verification Standard:** `0` TypeScript Compiler Errors • `12/12` Passing LEAF Automated Scenarios (`Leaf.lspkg`)

## 1. Executive Architecture & Hard Invariants

### 1.1 The Core Architectural Upgrade
`MiseFlow AR v5.0` transforms the project from a hardcoded single-dish simulator (*Pan-Seared Salmon*) into a **Universal AI Culinary Mastery & Spatial Sous-Chef Platform** capable of cooking and teaching **any dish on Earth** using an OS/Computer Architecture pattern:
1. **Latency-Hidden Spatial Cookbook Briefing Deck (`SpatialBriefingDeck.ts`):** When a dish is requested via voice ([`LensStudio:AsrModule`](https://developers.snap.com/spectacles/about-spectacles-features/apis/asr-module)) or the Director HUD (`AI Dish` / `Key 8`), the AI immediately returns a lightweight **Cookbook Briefing JSON** displayed in a sleek diegetic 4-card bar with **`<` (Previous)**, **`>` (Next)**, and **`Skip / Start Cook`** buttons, shining a 3D spotlight onto each physical station as you flip through the cards.
2. **Parallel DMA Batch Loaders + 3D Asset Page Table (`AssetPageTable.ts`):** While the user reads the briefing cards (or before they tap `Skip`), two parallel loaders resolve integer `access_number` keys concurrently via `Promise.all()`:
   - **Loader A (`IngredientPageTable`, `#101–#299`):** Batch-loads all 5 cutting-board ingredients (`Whole`, `Partial`, `Diced` 3-stage meshes) and the primary skillet protein (`Top` + `Underside Crust`). Pre-stored items (`#101–#115`) hit the **TLB Cache in `<1 ms`**. Unknown exotic items (`#200+`) trigger a **Page Fault Handler** that synthesizes the 3-stage mesh via API key (`claude-sonnet-5-5` / Fable / parametric generator) and caches it in the Page Table for future hits.
   - **Loader B (`VesselToolPageTable`, `#301–#342`):** Simultaneously loads and configures all required cookware and utensils (`#301 Cast-Iron Skillet`, `#302 Carbon-Steel Wok/Kadai`, `#303 Biryani Handi`, `#311 Tri-Ply Saucier`, `#321 Santoku Knife`, `#323 Prep Bowl`, `#331 Slotted Spatula`, `#332 Gravy Ladle`, `#341 Coupe Plate`).
3. **Deterministic Spatial Slot Allocator & 6 Kinematic Primitives:** Every loaded asset snaps into a pre-verified, collision-free **Physical Countertop Register** (`y_min = 0` bottom-center pivot, normalized to slot radius $R_{\max} = 1.05\text{ cm}$), and executes one of **6 Parameterized Kinematic Primitives** (`KINE_ROCK_CHOP`, `KINE_TWO_STAGE_POUR`, `KINE_SPATULA_FLIP_180`, `KINE_PAN_TOSS_ROLL`, `KINE_LADLE_ORBITAL_STIR`, `KINE_CONVERGENCE_PLATING`).

### 1.2 Hard Invariants (Never Violate During Implementation)
- **Invariant 1 (10/10 Existing LEAF Scenarios Pass Untouched):** Never rename or delete `StationsRoot`, `PrepBoardStation`, `SkilletStation`, `SaucepotStation`, `PrepStatusLabel`, `SkilletStatusLabel`, `SaucepotStatusLabel`, `LaserCutCurtain`, `VolumetricPortionDome`, `TransferArcTube`, `PlatingDebriefCard`, `DriftDecisionCard`, `Btn_StepChop`, `Btn_FillPortion`, `Btn_Transfer`, `Btn_CheckSear`, `Btn_ToggleHold`, `Btn_ToggleTimeWarp`, `Btn_Reset`, `Btn_AutoCook`, `EdgeBeacon_Left`, `EdgeBeacon_Right`, `SpatulaGuideRoot`, or `VisionScanReticle`.
- **Invariant 2 (Boot & Reset Default State):** On startup and on `Btn_Reset`, the active dish defaults to `01_salmon_beurre_blanc` with the Briefing Deck closed (`READY` state) so all 10 existing LEAF scenarios run without interruption.
- **Invariant 3 (Preview Camera Pose):** Keep the `-30°` Chef POV camera pose (`MovePreviewCamera` position `(0, 25.1, -21.4)`, lookAt `(0, -4.9, -73.4)`).
- **Invariant 4 (Safe Clean-Clone Compilation):** Commit a safe default `Miseflow/Assets/Scripts/AI/LocalSecrets.ts` with empty string keys (`export const ANTHROPIC_API_KEY = ""; export const FABLE_API_KEY = "";`) so TypeScript compiles with `0` errors even before `tools/sync-env.ps1` is run.

## 2. Exceptional Spatial UX & Visual Design Specification

### 2.1 Z-Zoned Countertop Layout & Spatial Memory Registers (`StationsRoot` Local Space, cm)

| Spatial Register ID | Local Coordinates `(X, Y, Z)` | Bound Cookware / Ingredient Assets | Bounding Radius & Collision Rule |
| :--- | :--- | :--- | :--- |
| **`SLOT_BOARD_LANE[0..4]`** | `PrepBoardStation` `(10.5, 0.64, -3.0)` $\to$ `BoardMesh` local `X = [-7.0, -4.75, -2.5, 0.5, 2.75]`, `Y = 0.905`, `Z = 1.2` | 5 active prep ingredients (`Veg_RedOnion` .. `Veg_YellowChilli` containers, re-meshed by `#101–#299`) | Max lane radius $R_{\max} = 1.05\text{ units}$; auto-scaled via $s = \min(1.2, 1.05 / r_{\text{mesh}})$ with bottom pivot at $y = 0$. |
| **`SLOT_BOARD_RAIL`** | `PrepBoardStation` local `X = -8.5 + sliceIdx * spacingCm`, `Y = 0.93`, `Z = 1.0` | `#321 Santoku Chef Knife` (`LaserCutCurtain` / `KnifeRoot`) + `CuttingGridLaser` | Steps $+s\text{ cm}$ across 8 cuts; laser grid dynamically adjusts width (`0.4–2.0 cm`) and bias angle ($0^\circ$ or $45^\circ$). |
| **`SLOT_PREP_BOWL`** | `BoardMesh` local `(6.2, -1.279, 11.0)` (rests on slab front-right) | `#323 Stainless Prep Bowl` (`PortionRamekinBowl`) + `BowlPortionLiquid` + `VolumetricPortionDome` | 5 internal radial stack slots `BOWL_SLOTS` hold diced veg; Slot 2 (`GARNISH_VEG`) reserved for plating sprinkle. |
| **`SLOT_PRIMARY_BURNER`** | `StationsRoot` local `(-11.2, -0.22, -1.5)` | `#301 Cast-Iron Skillet` or `#302 Carbon-Steel Wok/Kadai` + Primary Protein (`#110–#115`) | Surrounded by `BurnerArcs_Sear` (`R = 7.2..8.6 cm`) and 24-tick `Chrono_Skillet` (`R = 7.75 cm`). |
| **`SLOT_PRIMARY_TOOL_REST`** | `SkilletStation` local `(-8.6, 0.02, 14.4)`, yaw `-90°` | `#331 Slotted Fish Spatula` (`SpatulaProp`) | Rests flat on left slab when idle; glides into pan during `KINE_SPATULA_FLIP_180`. |
| **`SLOT_SECONDARY_BURNER`** | `StationsRoot` local `(0.0, -0.22, -10.5)` | `#311 Tri-Ply Saucier` or `#303 Biryani Handi` + `SaucierStockBase` + `SimmeringLemonSauce` | Surrounded by `BurnerArcs_Simmer` (`R = 4.4..5.6 cm`) and `Chrono_Saucier` (`R = 4.85 cm`). |
| **`SLOT_SECONDARY_TOOL_REST`** | `SaucepotStation` local `(6.8, 0.04, 2.2)`, yaw `35°` | `#332 Stainless Gravy Ladle` (`LadleProp`) | Rests beside saucier/handi; dips into pot for `KINE_LADLE_ORBITAL_STIR` and plating ladle pour. |
| **`SLOT_SERVICE_PLATE`** | `StationsRoot` local `(0.0, -0.22, 4.5)` | `#341 Stoneware Coupe Plate` (`PorcelainCoupePlate`) + `PlatedDishFx` (`PlateSaucePool`, `SalmonSauceStreak`, `GarnishFlake_0..15`) | Front-center service zone receiving convergence conduits from all 3 stations. |
| **`SLOT_BRIEFING_DECK`** | `StationsRoot` local `(0.0, 2.4, 9.2)`, pitched toward `CAM_LOCAL` | `BriefingDeckUI` (`<` `Btn_BriefingPrev`, `>` `Btn_BriefingNext`, `Skip` `Btn_BriefingSkip`) + `BriefingSpotlightRing` | Compact `16.4 × 3.2 cm` dark-glass capsule low in the foreground; never occludes cookware; auto-hides on `Skip` or Card 4 completion. |

### 2.2 Additive Waveguide Color Tokens (Zero-Halation Optical Palette)
Because Snap Spectacles uses an additive see-through display where pure black (`#000000`) renders transparent:
- **Glass Backplates (`COLOR_GLASS`):** `vec4(0.04, 0.06, 0.10, 0.90)` with `0.065 cm` high-luminance borders.
- **Cryo Prep & Laser Cyan (`COLOR_CYAN_PREP`):** `#00F0FF` (`vec4(0.0, 0.94, 1.0, 1.0)`) — cutting guides, prep spotlight, and simmer base ticks.
- **Maillard Sear Gold (`COLOR_GOLD_HEAT`):** `#FFC247` (`vec4(1.0, 0.76, 0.28, 1.0)`) — active sear timer, spatula trajectory arc, and briefing spotlight.
- **Drift Shockwave Amber (`COLOR_AMBER_DRIFT`):** `#FFB000` (`vec4(1.0, 0.69, 0.0, 1.0)`) — `Conduit_PrepToSauce` shockwave and Heat Guard ring.
- **AI Compiler & Vision Violet (`COLOR_VIOLET_AI`):** `#C28AFF` (`vec4(0.76, 0.54, 1.0, 1.0)`) — Cookbook Briefing Deck border, Page-Table DMA badge, and Vision Reticle.
- **Convergence Emerald (`COLOR_EMERALD_DONE`):** `#3DF29E` (`vec4(0.24, 0.95, 0.62, 1.0)`) — Cache Hit confirmation, unlocked conduits, and `DISH READY` state.

## 3. End-to-End User Experience & State Machine Flow

### Stage 1: Dish Request (`Voice` or `AI Dish` Button / `Key 8`)
1. The cook says *"Chef, prepare Mushroom Biryani"* (captured by `LensStudio:AsrModule` in `VoiceSousChefController.ts`) or taps **`AI Dish` (`Btn_CycleDish` / `Key 8`)** on the Director Dock.
2. `MiseFlowEventBus` emits `DISH_COMPILE_REQUESTED({ query: "Mushroom Biryani", source: "VOICE" })`.
3. `RecipeCompilerService.ts` resolves the dish in `<1 ms` (if in `DishLibraryConfig.ts`) or `<1.2 s` via `InternetModule.fetch` (Anthropic `claude-sonnet-5-5` with structured JSON schema), returning the `UniversalDishBlueprint`.

### Stage 2: Spatial Cookbook Briefing Deck (`<` `>` `Skip`) + Parallel DMA Asset Loading
1. **Immediate Briefing Presentation:** `SpatialBriefingDeck.ts` enables `BriefingDeckUI` at `(0.0, 2.4, 9.2)` showing:
   - **Top Line:** `MUSHROOM BIRYANI [1/4] • PREP & 0.8CM BRUNOISE`
   - **Middle Line:** `"Slice red onion, ginger, mint, tomato & green chilli along 0.8cm laser guides."`
   - **Bottom DMA Status Bar:** `DMA PAGE TABLE: 5/5 VEG HIT (#101..#108) • 6/6 VESSELS READY (<2ms)` (or `PAGE FAULT #201 -> SYNTHESIZING VIA API...`).
   - **Controls:** `[ < Prev ]` (`Btn_BriefingPrev`), `[ Next > ]` (`Btn_BriefingNext`), and `[ Skip -> Cook ]` (`Btn_BriefingSkip`).
2. **Parallel Background DMA Execution (Runs Immediately During Card 1):**
   - **Loader A (`IngredientPageTable.batchLoad`):** Resolves `bp.ingredientAccessNumbers` in parallel, rebuilding the 5 `Veg_*` (`_Whole`, `_Partial`, `_Diced`) meshes on the butcher block and the primary skillet protein/mushrooms (`SalmonFillet` + `SalmonCrispySkin`).
   - **Loader B (`VesselToolPageTable.batchLoad`):** Simultaneously morphs `SkilletPan` (`#301 Skillet` vs. `#302 Wok`), `SaucepotPot` (`#311 Saucier` vs. `#303 Biryani Handi`), `SaucierStockBase` / `SimmeringLemonSauce` colors, and enables `#331 Spatula` + `#332 Ladle`.
3. **Interactive Card Walkthrough (`<` / `>`) with 3D Station Spotlights:**
   - **Card 1/4 (Prep Station):** `BriefingSpotlightRing` highlights `PrepBoardStation` (`(10.5, 0.02, -3.0)`) in glowing Cyan as the 5 new vegetables pop onto the board and `CuttingGridLaser` adjusts to `0.8 cm`.
   - **Card 2/4 (Primary Burner):** Clicking `>` glides `BriefingSpotlightRing` to `SkilletStation` (`(-11.2, 0.02, -1.5)`) in Gold, highlighting the vessel (`#302 Wok/Skillet`) and the raw marinated mushrooms/protein.
   - **Card 3/4 (Simmer Burner & Tools):** Clicking `>` glides `BriefingSpotlightRing` to `SaucepotStation` (`(0.0, 0.02, -10.5)`) in Violet, highlighting the `#303 Biryani Handi` and `#332 Gravy Ladle`.
   - **Card 4/4 (Convergence & Plating) or Clicking `Skip` (`Btn_BriefingSkip`):** Collapses `BriefingDeckUI` and `BriefingSpotlightRing`, emits `BRIEFING_COMPLETED`, speaks the opening coaching cue via `VoiceSousChefController`, and arms the live cooking stations!

### Stage 3: Active Multi-Burner Cooking, Mastery Teaching & Plating
1. **Prep & Knife Mastery (`Step Cut` / `Key 1`):** 8 knife cuts rock-chop along the custom-spaced laser grid (`KINE_ROCK_CHOP`), converting each ingredient `Whole -> Partial -> Diced`, filling the portion dome to `100%`, and displaying/speaking the culinary science cue in `ChefVoiceBannerUI`.
2. **Two-Stage Bowl Transfer (`Transfer` / `Key 3`):** `KINE_TWO_STAGE_POUR` lifts `#323 Prep Bowl` to pour the base stock/ghee (`Pour 1`) into the pot, collects the diced aromatics from the board, and tips them into the pot (`Pour 2`) while `#332 Ladle` performs `KINE_LADLE_ORBITAL_STIR` (2 orbital stirring revolutions with a steam burst).
3. **Prep Drift Resolver (`+25s Drift` / `Key 5`):** Fires the amber shockwave along `Conduit_PrepToSauce`, shifts the saucier start-arc $+25\text{s}$ leaving a ghost arc, flashes the skillet Heat Guard ring, and activates `GazeEdgeBeacon` when looking $>20^\circ$ away.
4. **AI Vision Gate & Active Pan Kinematics (`AI Vision` / `Key 4`):** Evaluates doneness through `ProposalGate.ts` (`0.55` confidence floor). When optimal crust is reached (or $\le 10\text{s}$ remain on the sear timer):
   - If `bp.primaryKine === "KINE_SPATULA_FLIP_180"`, `#331 Spatula` slides under at $45^\circ$, lifts, and flips the protein $180^\circ$ so the seared crust lands facing up.
   - If `bp.primaryKine === "KINE_PAN_TOSS_ROLL"` (e.g., Mushroom Biryani or Stir-Fry), the skillet/wok pitches $-14^\circ/+8^\circ$ while the pieces hop along staggered parabolic arcs and roll $180^\circ$ in mid-air!
5. **Plating Convergence (`10x Warp` / `Key 6` or `Auto Cook` / `Key 7`):** At $T_0 = 00:00$, `PlatingFinisher.ts` executes `KINE_CONVERGENCE_PLATING`: the seared protein/mushrooms arc onto `#341 Coupe Plate`, the saucier tilts (with `#332 Ladle` assist) to drizzle the dish's sauce pool and streak, and the reserved Slot 3 herb flakes sprinkle over the top with rising steam wisps (`DISH READY`).

## 4. Workstream-by-Workstream Code Implementation Plan (`WS12` $\to$ `WS17`)

### WS12: Safe Secrets, Event Bus Contracts & Universal Schema (`Assets/Scripts/AI/`)

#### 1. Create `Miseflow/Assets/Scripts/AI/LocalSecrets.ts`
Create this file with empty default strings so fresh clones compile with `0` errors before `tools/sync-env.ps1` is run:

```typescript
// Default commit-safe stub. tools/sync-env.ps1 overwrites this locally from .env.
export const ANTHROPIC_API_KEY = "";
export const GEMINI_API_KEY = "";
export const OPENAI_API_KEY = "";
export const FABLE_API_KEY = "";
```

#### 2. Extend `Miseflow/Assets/Scripts/MiseFlowEventBus.ts`
Add the following event types to `MiseFlowEventType`:

```typescript
  | "DISH_COMPILE_REQUESTED"   // { query?: string, presetIndex?: number, source: "HUD" | "VOICE" | "LEAF" }
  | "DISH_BLUEPRINT_APPLIED"   // { blueprint: any, cacheHits: number, pageFaults: number, showBriefing: boolean }
  | "BRIEFING_CARD_CHANGED"    // { cardIndex: number, totalCards: number, stationFocus: string }
  | "BRIEFING_COMPLETED"       // { dishId: string, skipped: boolean }
  | "CHEF_COACH_SPEAK"         // { text: string, category: "PREP" | "SEAR" | "SAUCE" | "DRIFT" | "VISION" }
  | "LADLE_STIR_REQUESTED"     // { revolutions?: number }
  | "PAN_TOSS_REQUESTED"       // { hops?: number }
```

#### 3. Create `Miseflow/Assets/Scripts/AI/UniversalDishSchema.ts`
Define the complete data structures for the Cookbook Briefing Cards, Page Table access numbers, and 3D parameters:

```typescript
export type PrepArchetype =
  | "BULB_ALLIUM"      // #101 Onion/Shallot, #102 Lobed Garlic
  | "CYLINDER_STALK"   // #105 Chilli, #106 Cucumber/Zucchini, #107 Carrot/Asparagus
  | "SPHERE_CROWN"     // #104 Tomato, #108 Cremini/Button Mushroom
  | "LEAFY_HERB"       // #103 Parsley/Mint/Cilantro/Shiso
  | "CUBED_BLOCK";     // #109 Ginger Root / Paneer / Tofu Block

export type ProteinArchetype =
  | "FILLET_SLAB"      // #110 Salmon Fillet, #112 Paneer Steak, #113 Tofu Slab
  | "MARBLED_STEAK"    // #111 Prime Ribeye Steak
  | "MEDALLION_SCALLOP"// #114 Diver Scallops
  | "CUBED_SEAR";      // #115 Marinated Mushroom / Paneer / Chicken Pieces

export type PrimaryKinematicType = "KINE_SPATULA_FLIP_180" | "KINE_PAN_TOSS_ROLL";

export interface CookbookCardSpec {
  stepNumber: number;            // 1..4
  stationFocus: "PREP" | "SKILLET" | "SAUCEPOT" | "PLATING";
  headline: string;              // <= 28 chars, e.g., "1/4 PREP: 0.8CM BRUNOISE"
  instruction: string;           // <= 75 chars, shown on the briefing card
  masteryWhy: string;            // <= 65 chars, spoken via TTS / shown on ChefVoiceBannerUI
}

export interface PrepSlotEntry {
  accessNumber: number;          // #101..#109 (Cache Hit) or #200+ (Page Fault Synthesis)
  name: string;
  archetype: PrepArchetype;
  colorRgb: [number, number, number];
  stemColorRgb?: [number, number, number];
  scaleMultiplier: number;
}

export interface UniversalDishBlueprint {
  dishId: string;
  dishTitle: string;             // e.g., "MUSHROOM DUM BIRYANI"
  cuisineTag: string;            // e.g., "HYDERABADI DUM"
  // Timing & Metrology
  prepDurationSec: number;
  searDurationSec: number;
  sauceDurationSec: number;
  cutSpacingCm: number;          // 0.4 to 2.0 cm
  cutAngleDeg: number;           // 0 (straight) or 45 (diagonal bias cut)
  cutLabel: string;              // e.g., "0.8cm Brunoise", "2.0cm 45° Bias"
  // Page Table Access Arrays (Batch Loaded by Loader A & Loader B)
  ingredientAccessNumbers: [number, number, number, number, number];
  vesselAccessNumbers: number[]; // e.g., [302, 303, 321, 323, 331, 332, 341]
  // Detailed 5-Lane Prep Overrides
  prepSlots: [PrepSlotEntry, PrepSlotEntry, PrepSlotEntry, PrepSlotEntry, PrepSlotEntry];
  // Primary Skillet / Wok Spec
  protein: {
    accessNumber: number;        // #110..#115 or #250+
    name: string;
    archetype: ProteinArchetype;
    primaryKine: PrimaryKinematicType;
    lengthCm: number;
    widthCm: number;
    heightCm: number;
    rawTopRgb: [number, number, number];
    searedCrustRgb: [number, number, number];
    flipCalloutText: string;     // e.g., "45 DEG ENTRY" or "PAN TOSS 180"
  };
  // Secondary Saucier / Handi Two-Pour Spec
  sauce: {
    name: string;
    vesselAccessNumber: number;  // #311 Saucier or #303 Biryani Handi
    baseLiquidRgb: [number, number, number];
    reducedSauceRgb: [number, number, number];
    useLadleStir: boolean;       // Triggers #332 Ladle orbital stir on Pour 2
  };
  // 4-Card Cookbook Briefing Deck
  cookbookCards: [CookbookCardSpec, CookbookCardSpec, CookbookCardSpec, CookbookCardSpec];
  // AI Vision Context
  visionPromptContext: string;
  skilletPillVerb: string;       // e.g., "SEAR", "SAUTE", "CHAR"
  saucePillVerb: string;         // e.g., "SAUCE", "DUM", "GRAVY"
}
```

### WS13: The 4 Deterministic Tables (`Miseflow/Assets/Scripts/AI/AssetPageTable.ts`)

Create `AssetPageTable.ts` implementing:
1. **`IngredientPageTable` (`#101–#115` Pre-Registered + `#200+` Dynamic Page-Fault Cache):**
   - Stores pre-configured `PrepSlotEntry` records for:
     - `#101`: Red Onion (`BULB_ALLIUM`, `[0.66, 0.30, 0.50]`)
     - `#102`: Garlic Bulb (`BULB_ALLIUM`, `[0.96, 0.92, 0.78]`)
     - `#103`: Fresh Herb Bunch — Parsley/Mint/Cilantro (`LEAFY_HERB`, `[0.16, 0.50, 0.14]`)
     - `#104`: Roma Tomato (`SPHERE_CROWN`, `[0.90, 0.13, 0.07]`)
     - `#105`: Chilli Pepper (`CYLINDER_STALK`, `[1.0, 0.80, 0.08]`)
     - `#106`: Cucumber / Zucchini (`CYLINDER_STALK`, `[0.18, 0.52, 0.22]`)
     - `#107`: Carrot / Asparagus Spear (`CYLINDER_STALK`, `[0.95, 0.45, 0.12]`)
     - `#108`: Cremini / Button Mushroom (`SPHERE_CROWN`, `[0.76, 0.68, 0.58]`)
     - `#109`: Ginger Root / Paneer Block (`CUBED_BLOCK`, `[0.94, 0.86, 0.62]`)
   - **`resolveIngredientBatch(entries: PrepSlotEntry[]): Promise<{ resolved: PrepSlotEntry[]; hits: number; faults: number }>`:**
     - Checks each `accessNumber` in `this.pageTable`.
     - If present (`Cache Hit`), returns immediately in `<0.1 ms`.
     - If missing (`Page Fault`), invokes `synthesizeMissingIngredient(entry)` (calling the configured AI/Fable endpoint or procedural archetype fallback), assigns a new `accessNumber = this.nextDynamicAddress++` (`#200+`), stores it in `this.pageTable`, and resolves the batch via `Promise.all()`.
2. **`VesselToolPageTable` (`#301–#342`):**
   - `#301`: Cast-Iron Skillet (`wallFlare: 1.0, rimHeight: 1.86`)
   - `#302`: Carbon-Steel Wok / Kadai (`wallFlare: 1.18, rimHeight: 2.35`)
   - `#303`: Brass/Steel Biryani Handi (`bellyBulge: 1.15, rimFlare: 1.08`)
   - `#311`: Tri-Ply Stainless Saucier (`bellyBulge: 1.0, rimFlare: 1.0`)
   - `#321`: Japanese Santoku Knife
   - `#323`: Stainless Prep Mixing Bowl
   - `#331`: Slotted Fish Turner Spatula (`SpatulaProp`)
   - `#332`: Stainless Gravy Ladle (`LadleProp`)
   - `#341`: Matte Stoneware Coupe Plate

### WS14: Pre-Verified Global Dish Library & AI Compiler (`DishLibraryConfig.ts` & `RecipeCompilerService.ts`)

1. **`Miseflow/Assets/Scripts/AI/DishLibraryConfig.ts`:**
   Define 5 complete `UniversalDishBlueprint` presets that cycle on `Btn_CycleDish` (`Key 8`) or match by voice keyword in `<1 ms`:
   - **Preset 0 (`01_salmon_beurre_blanc` — Default Boot Dish):** Uses `[#101, #102, #103, #104, #105]`, `#110` Atlantic Salmon (`KINE_SPATULA_FLIP_180`), `#301` Skillet, `#311` Saucier, `1.5 cm` straight dice.
   - **Preset 1 (`02_mushroom_dum_biryani` — Showcase New Dish):** Uses `[#101 Red Onion, #109 Ginger-Garlic Block, #103 Mint & Coriander, #104 Roma Tomato, #105 Green Slit Chilli]`, `#115` Marinated Button Mushrooms (`CUBED_SEAR`, `KINE_PAN_TOSS_ROLL`), `#302` Carbon-Steel Wok/Skillet, `#303` Biryani Handi + `#332` Gravy Ladle (`useLadleStir: true`), `0.8 cm` brunoise, Saffron-Ghee Pour 1 (`#F7CA45`) $\to$ Spiced Biryani Masala Pour 2 (`#8C381E`).
   - **Preset 2 (`03_ribeye_au_poivre`):** Uses `[#101 Shallot, #102 Black Garlic, #103 Fresh Thyme, #108 Cremini Mushroom, #107 Asparagus]`, `#111` Prime Ribeye Steak (`MARBLED_STEAK`, `KINE_SPATULA_FLIP_180`), `2.0 cm` $45^\circ$ diagonal bias cut, Cognac Base $\to$ Peppercorn Au Poivre.
   - **Preset 3 (`04_paneer_tikka_makhani`):** Uses `[#101 Red Onion, #109 Ginger Block, #103 Kasuri Methi & Cilantro, #104 Heirloom Tomato, #106 Cucumber/Capsicum]`, `#112` Spiced Paneer Steak (`FILLET_SLAB`, `KINE_SPATULA_FLIP_180`), `#303` Handi + `#332` Ladle, `0.8 cm` brunoise, Cashew-Butter Base $\to$ Velvety Orange Makhani Gravy.
   - **Preset 4 (`05_miso_tofu_stirfry`):** Uses `[#107 Carrot/Scallion, #109 Ginger, #103 Shiso Greens, #108 Shiitake Cap, #106 Cucumber/Zucchini]`, `#113` Scored Miso Tofu (`KINE_PAN_TOSS_ROLL`), `#302` Wok, `0.4 cm` fine julienne, Dashi Base $\to$ Glossy Mirin-Miso Tare.
2. **`Miseflow/Assets/Scripts/AI/RecipeCompilerService.ts`:**
   - Listens for `DISH_COMPILE_REQUESTED`.
   - If `useLiveAiCompiler` is enabled and `ANTHROPIC_API_KEY` is non-empty, sends a `POST` request via `LensStudio:InternetModule` (`fetch`) to `https://api.anthropic.com/v1/messages` (`claude-sonnet-5-5`) with `UniversalDishBlueprint` JSON schema and a `4500 ms` timeout; otherwise resolves the matching or next preset from `DishLibraryConfig.ts`.
   - Runs `AssetPageTable.batchLoad(blueprint)` (Loader A + Loader B in parallel), validates through `ProposalGate.validateDishBlueprint()`, and emits `DISH_BLUEPRINT_APPLIED`.

### WS15: Spatial Cookbook Briefing Deck (`Miseflow/Assets/Scripts/SpatialBriefingDeck.ts`)

Create `SpatialBriefingDeck.ts` attached to `StationsRoot/DiegeticLayer`:
1. **UI Hierarchy (`BriefingDeckUI` under `StationsRoot`):**
   - Positioned at `(0.0, 2.4, 9.2)`, rotated via `faceDirectorCamera`.
   - Rounded dark-glass capsule (`16.4 × 3.2 cm`, border `COLOR_VIOLET_AI`).
   - **Text Nodes:**
     - `BriefingDeck_Header`: e.g., `"MUSHROOM DUM BIRYANI • STEP 1/4"` (32pt bold, Violet/Gold).
     - `BriefingDeck_Body`: e.g., `"Slice onion, ginger, mint, tomato & chilli on 0.8cm guides"` (28pt White).
     - `BriefingDeck_DmaStatus`: e.g., `"PAGE TABLE: 5/5 VEG HIT (#101..#109) • 6/6 VESSELS LOADED"` (24pt Emerald).
   - **3 Interactive Buttons (`SpectaclesUIKit` `Button` + `MiseFlowButtonTrigger` for LEAF):**
     - `Btn_BriefingPrev` (`"< Prev"`, left `X = -5.8`)
     - `Btn_BriefingNext` (`"Next >"`, center `X = 0.0`)
     - `Btn_BriefingSkip` (`"Skip -> Cook"`, right `X = +5.4`, Emerald border)
2. **3D Countertop Spotlight Ring (`BriefingSpotlightRing`):**
   - Built with `buildAnnulusMesh(0.88, 1.0, 64)` flush on the countertop (`Y = -0.02`).
   - Smoothly interpolates (`vec3.lerp` at `dt * 8.0`) between station centers as `cardIndex` changes:
     - Card 0 (`PREP`): `(10.5, -0.02, -3.0)`, scale `9.5`, Cyan.
     - Card 1 (`SKILLET`): `(-11.2, -0.02, -1.5)`, scale `8.8`, Gold.
     - Card 2 (`SAUCEPOT`): `(0.0, -0.02, -10.5)`, scale `6.2`, Violet.
     - Card 3 (`PLATING`): `(0.0, -0.02, 4.5)`, scale `5.5`, Emerald.
3. **Keyboard & Voice Shortcuts:**
   - `[` or `LeftArrow` $\to$ `prevCard()`
   - `]` or `RightArrow` $\to$ `nextCard()` (advancing past Card 4 automatically calls `skipAndStartCook()`)
   - `Enter` or `Space` $\to$ `skipAndStartCook()`

### WS16: Upgrading `StationPropsBuilder.ts`, `ChoreographyDAG.ts`, `MiseFlowSpatialUI.ts`, & Adding `LadleProp` / `PanToss`

1. **`StationPropsBuilder.ts` Upgrades:**
   - **Add `applyDishBlueprint(bp: UniversalDishBlueprint)`:**
     - Rebuilds `CuttingGridLaser` with 9 lines spaced at `bp.cutSpacingCm` and rotated by `bp.cutAngleDeg * (Math.PI / 180)`.
     - Iterates `i = 0..4` over `this.vegItems` and calls `this.rebuildVegSlot(i, bp.prepSlots[i])` to update `_Whole`, `_Partial`, and `_Diced` meshes (`BULB_ALLIUM`, `CYLINDER_STALK`, `SPHERE_CROWN`, `LEAFY_HERB`, `CUBED_BLOCK`) and materials (`makePbrMaterial(...rgb)`).
     - Rebuilds `SalmonFillet` and `SalmonCrispySkin` meshes according to `bp.protein.archetype` (`FILLET_SLAB`, `MARBLED_STEAK`, `MEDALLION_SCALLOP`, or `CUBED_SEAR` — which places 7 plump mushroom caps or paneer cubes across the pan floor!) and tints them to `rawTopRgb` and `searedCrustRgb`.
     - Updates `SaucierStockBase` (`BowlPortionLiquid`) to `bp.sauce.baseLiquidRgb` and `SimmeringLemonSauce` (`PlateSaucePool`, `SalmonSauceStreak`) to `bp.sauce.reducedSauceRgb`.
   - **Add `#332 Stainless Gravy Ladle (`LadleProp`)` & `KINE_LADLE_ORBITAL_STIR`:**
     - Under `SaucepotStation`, build `LadleProp` (`MeshAcc` hemispherical cup `R = 1.35` + curved hooked handle `L = 9.2` in `MAT_CHROME`), resting at `(6.8, 0.8, 2.2)`.
     - When Pour 2 completes (or `LADLE_STIR_REQUESTED` fires), animate `LadleProp` dipping into `SaucepotPot` and tracing 2 smooth orbital revolutions `(1.6 * cos(wt), 2.8, 1.6 * sin(wt))` over `2.2 seconds`.
   - **Add `KINE_PAN_TOSS_ROLL` (For Mushrooms / Stir-Fry / Cubed Items):**
     - When `bp.protein.primaryKine === "KINE_PAN_TOSS_ROLL"` and `SpatulaTechniqueGuide.playFlip()` triggers, tilt `SkilletPan` forward `-14°` and back while hopping `SalmonFillet` along a parabolic arc (`apex 3.2 cm`) and rotating it `180°` so `SalmonCrispySkin` (the golden sautéed side) lands facing up!
2. **`ChoreographyDAG.ts` Upgrades:**
   - Add `public applyDishBlueprint(bp: UniversalDishBlueprint): void` to update `prepDurationSeconds`, `skilletDurationSeconds`, `saucepotDurationSeconds`, and task titles/instructions while preserving the 4 map keys (`prep_shallots`, `skillet_sear_skin`, `sauce_reduction`, `plating_garnish`).
3. **`MiseFlowSpatialUI.ts` Upgrades:**
   - Add **`AI Dish` (`Btn_CycleDish`, shortcut `Key 8`)** to the Director Dock (`AUTO` group alongside `Auto Cook`).
   - Add **`ChefVoiceBannerUI`** (`14.8 × 1.35 cm` dark-glass pill just below `PlateAnchorUI` at `(0.0, 16.6, -15.0)`) that displays the active dish title and spoken AI Sous-Chef mastery cues (`CHEF AI: "8mm brunoise melts into dum gravy"`).

### WS17: Automated LEAF Verification (`10/10` $\to$ `12/12` Scenarios)

Register two new scenarios in `Miseflow/Assets/Tests/LeafIndex.ts`:
1. **Scenario 11 (`UniversalDishPageTableScenario.ts` — ID: `"universal-dish-page-table"`):**
   - Taps `Btn_CycleDish` (`Key 8`) to request *Mushroom Dum Biryani*.
   - Asserts `BriefingDeckUI.enabled === true`, asserts `AssetPageTable` reports `5/5` ingredient cache hits and `6/6` vessel hits, taps `Btn_BriefingNext` twice (verifying `BriefingSpotlightRing` moves from `PrepBoardStation` to `SkilletStation` to `SaucepotStation`), taps `Btn_BriefingSkip`, and asserts `BriefingDeckUI.enabled === false` and `MetricPrepBlueprint.spacingCm === 0.8`.
   - Taps `Btn_Reset` and asserts the scene restores `01_salmon_beurre_blanc` (`spacingCm === 1.5`).
2. **Scenario 12 (`MultiDishAutoCookScenario.ts` — ID: `"multi-dish-auto-cook"`):**
   - Switches to *Mushroom Dum Biryani*, skips the briefing deck, runs `Btn_AutoCook` at `speed = 8`, and verifies that all 8 cuts, the 2-stage pour + `#332 Ladle` orbital stir, the pan toss/flip, and `PlatingFinisher` complete with `DISH_PLATED` and `PlatingDebriefCard.enabled === true`.

## 5. Master Prompt to Execute in Your Coding Agent (CLAD + Lens Studio MCP)

Copy and paste the block below directly into Claude Code / Cursor / Codex inside your `Miseflow` repository:

```text
Read IMPLEMENTATION_PLAN.md and devpost/design-brief.md, and inspect Miseflow/Assets/Scripts/.
We are executing the MiseFlow AR v5.0 upgrade (Spatial Cookbook Briefing Deck < > Skip + OS Page-Table Parallel Batch Loaders + Universal Dish Morphing + Ladle/Toss Kinematics).

HARD INVARIANTS:
1. All 10 existing LEAF scenarios in Miseflow/Assets/Tests/LeafIndex.ts MUST continue to pass 10/10. Never rename or remove any LEAF-asserted SceneObject or substring.
2. On startup and on Btn_Reset, default to dish "01_salmon_beurre_blanc" with the Briefing Deck closed so existing LEAF scenarios run without interruption.

Execute WS12 through WS17 in strict order, recompiling TypeScript via the Lens Studio MCP after each workstream:
1. WS12: Create Miseflow/Assets/Scripts/AI/LocalSecrets.ts (empty string defaults), Miseflow/Assets/Scripts/AI/UniversalDishSchema.ts, and add the new event types to Miseflow/Assets/Scripts/MiseFlowEventBus.ts.
2. WS13 & WS14: Create Miseflow/Assets/Scripts/AI/AssetPageTable.ts (IngredientPageTable #101-#299 with Page-Fault API fallback + VesselToolPageTable #301-#342), Miseflow/Assets/Scripts/AI/DishLibraryConfig.ts (5 flagship dishes including 01 Salmon and 02 Mushroom Dum Biryani), and Miseflow/Assets/Scripts/AI/RecipeCompilerService.ts.
3. WS15: Create Miseflow/Assets/Scripts/SpatialBriefingDeck.ts implementing BriefingDeckUI (< Btn_BriefingPrev, > Btn_BriefingNext, Skip Btn_BriefingSkip, DMA Page-Table status line) and BriefingSpotlightRing under StationsRoot/DiegeticLayer.
4. WS16: Upgrade StationPropsBuilder.ts (add applyDishBlueprint, rebuildVegSlot for all 5 PrepArchetypes, CUBED_SEAR mushroom/paneer mesh, LadleProp orbital stir, and KINE_PAN_TOSS_ROLL), ChoreographyDAG.ts (add applyDishBlueprint), and MiseFlowSpatialUI.ts (add Btn_CycleDish / Key 8 and ChefVoiceBannerUI, and attach RecipeCompilerService + SpatialBriefingDeck in ensureHeroComponents).
5. WS17: Add UniversalDishPageTableScenario.ts and MultiDishAutoCookScenario.ts to Miseflow/Assets/Tests/, register them in LeafIndex.ts, recompile TypeScript (0 errors), and run all 12 LEAF scenarios in Lens Studio Preview until 12/12 pass.
```
