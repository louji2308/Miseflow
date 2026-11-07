/**
 * SpatialSlotAllocator.ts  (v5 Part 2, implementation_plan WS13 / idea v5 section 3.3)
 * Hard-partitioned spatial registers for every object a dish can place, as typed constants plus pure functions.
 * No scene access: values are mirrored from StationPropsBuilder.ts (layout constants ~line 541+) and
 * SpatulaFlipRig.ts (REST_FRONT) and checked by assertCollisionFree().
 *
 * FRAMES. Each slot is authored in the local space of the object that owns it, exactly as in the plan table:
 *   BOARD             PrepBoardStation  origin (10.5, 0.64, -3.0) scale 0.68
 *   SKILLET_STATION   SkilletStation    origin (-11.2, -0.22, -1.5) scale 0.68
 *   SAUCEPOT_STATION  SaucepotStation   origin (0.0, -0.22, -10.5) scale 0.74
 *   STATIONS_ROOT     StationsRoot-local cm (counter slab top y = -0.23)
 * toRoot() converts to StationsRoot cm (station scale applied) so slots can be compared in one space.
 */

export interface Vec3Like { x: number; y: number; z: number; }

export type SlotFrame = "BOARD" | "SKILLET_STATION" | "SAUCEPOT_STATION" | "STATIONS_ROOT";

export type SlotId =
  | "SLOT_BOARD_LANE_0" | "SLOT_BOARD_LANE_1" | "SLOT_BOARD_LANE_2" | "SLOT_BOARD_LANE_3" | "SLOT_BOARD_LANE_4"
  | "SLOT_BOARD_RAIL"
  | "SLOT_PREP_BOWL"
  | "SLOT_PRIMARY_BURNER"
  | "SLOT_PRIMARY_TOOL_REST"
  | "SLOT_SECONDARY_BURNER"
  | "SLOT_SECONDARY_TOOL_REST"
  | "SLOT_SERVICE_PLATE"
  | "SLOT_BRIEFING_DECK"
  // D1 data-only rests for the master-catalogue ware (no scene prop yet, footprint false = excluded from collision checks)
  | "SLOT_SECONDARY_ACCESSORY"   // #306 strainer basket (sits in the stockpot)
  | "SLOT_TERTIARY_TOOL_REST"    // #333 wok chuan, #334 chopsticks, #335 tongs, #336 whisk (one per dish)
  | "SLOT_SPICE_RAMEKINS"        // #326 spice pinch ramekins (board side)
  | "SLOT_STARCH"                // A2 starch prop (#116-#118, #120) in its stoneware tray, front-right of the plate
  // A5 pantry rests (#160-#166), StationsRoot frame
  | "SLOT_PANTRY_SPICE"         // #160 whole garam masala dish (front-right, between bowl and ramekins)
  | "SLOT_PANTRY_FAT"           // #162 butter / ghee pat dish (back row, left of the saucier)
  | "SLOT_PANTRY_CHEESE"        // #163 grated cheese plate
  | "SLOT_PANTRY_CREAM"         // #164 cream / coconut / yogurt cup
  | "SLOT_PANTRY_OIL"           // #165 oil / glaze cruet
  | "SLOT_PANTRY_LEGUME";       // #166 dry lentil / chickpea jar (second back row)

/** Slots a cookware vessel can be morphed into (IDishAssetBuilder.morphVessel). */
export type VesselSlotId = "SLOT_PRIMARY_BURNER" | "SLOT_SECONDARY_BURNER";

export interface SlotRegister {
  id: SlotId;
  frame: SlotFrame;
  /** Position in the owning frame's local units (see frame table above). */
  x: number;
  y: number;
  z: number;
  /** Rest yaw in degrees (frame-local). */
  yawDeg: number;
  /** Footprint radius in FRAME-LOCAL units (multiplied by the frame scale for root-space checks). */
  radius: number;
  /** false = no floor footprint (floating HUD, or a 1-D rail): excluded from pairwise/slab checks. */
  footprint: boolean;
  /** Owning scene station / main occupant, for docs and builders. */
  owner: string;
}

export interface FrameXform { ox: number; oy: number; oz: number; scale: number; }

/** Mirrors StationPropsBuilder: PREP_POS/0.68, SKILLET_POS/0.68, SAUCIER_POS/0.74, root at the origin. */
export const FRAMES: { [f: string]: FrameXform } = {
  BOARD: { ox: 10.5, oy: 0.64, oz: -3.0, scale: 0.68 },
  SKILLET_STATION: { ox: -11.2, oy: -0.22, oz: -1.5, scale: 0.68 },
  SAUCEPOT_STATION: { ox: 0.0, oy: -0.22, oz: -10.5, scale: 0.74 },
  STATIONS_ROOT: { ox: 0, oy: 0, oz: 0, scale: 1 },
};

/** Counter slab (StationPropsBuilder COUNTER_CENTER/HALF): x -20..20, z -17..10.5, top y = -0.23. */
export const SLAB = { minX: -20.0, maxX: 20.0, minZ: -17.0, maxZ: 10.5, topY: -0.23 };

// ── Prep board constants (board-local units) ──
export const VEG_X: number[] = [-7.0, -4.75, -2.5, 0.5, 2.75];
export const VEG_Z = 1.2;
export const VEG_TOP_Y = 0.905;
/** Max horizontal lane radius (board-local units). */
export const LANE_MAX_RADIUS = 1.05;
/** Upper bound of the lane scale factor. */
export const LANE_MAX_SCALE = 1.2;
export const KNIFE_REST_X = -8.5;
export const RAIL_Y = 0.93;
export const RAIL_Z = 1.0;

function lane(i: number): SlotRegister {
  return {
    id: ("SLOT_BOARD_LANE_" + i) as SlotId,
    frame: "BOARD", x: VEG_X[i], y: VEG_TOP_Y, z: VEG_Z, yawDeg: 0,
    radius: LANE_MAX_RADIUS, footprint: true, owner: "PrepBoardStation/Veg_" + i,
  };
}

/** The slot table (plan WS13). Order is stable; do not reorder. */
export const SLOTS: SlotRegister[] = [
  lane(0), lane(1), lane(2), lane(3), lane(4),
  // Knife rail: runs along x as the blade steps (-8.5 + sliceIdx * spacing); a line, not a disk.
  { id: "SLOT_BOARD_RAIL", frame: "BOARD", x: KNIFE_REST_X, y: RAIL_Y, z: RAIL_Z, yawDeg: 0, radius: 0, footprint: false, owner: "PrepBoardStation/KnifeRoot" },
  // Prep bowl rim radius 3.0 (StationPropsBuilder ramekin lathe), board-local, rests on the slab.
  { id: "SLOT_PREP_BOWL", frame: "BOARD", x: 6.2, y: -1.279, z: 11.0, yawDeg: 0, radius: 3.0, footprint: true, owner: "PrepBoardStation/PortionRamekinBowl" },
  // Skillet footprint: pan body radius ~10 station units (0.68 cm each).
  { id: "SLOT_PRIMARY_BURNER", frame: "STATIONS_ROOT", x: -11.2, y: -0.22, z: -1.5, yawDeg: -66, radius: 6.8, footprint: true, owner: "SkilletStation" },
  // Spatula rest (anchor disk; the long handle may overhang): SpatulaFlipRig REST_FRONT (-8.6, SLAB_Y 0.02, 14.4) yaw -90.
  { id: "SLOT_PRIMARY_TOOL_REST", frame: "SKILLET_STATION", x: -8.6, y: 0.02, z: 14.4, yawDeg: -90, radius: 1.2 / 0.68, footprint: true, owner: "SkilletStation/SpatulaProp" },
  // Saucier footprint: pot body radius ~5.2 station units (0.74 cm each) = ~3.9 cm.
  { id: "SLOT_SECONDARY_BURNER", frame: "STATIONS_ROOT", x: 0.0, y: -0.22, z: -10.5, yawDeg: 0, radius: 3.9, footprint: true, owner: "SaucepotStation" },
  // Ladle rest (anchor = bowl), right-behind the saucier/handi, handle lying toward +X behind the board (A4a LadleProp).
  { id: "SLOT_SECONDARY_TOOL_REST", frame: "SAUCEPOT_STATION", x: 8.8, y: 0.04, z: -3.1, yawDeg: 8, radius: 1.2 / 0.74, footprint: true, owner: "SaucepotStation/LadleProp" },
  // Plate rim radius 5.95 * PLATE_SCALE 0.75 = 4.46 cm.
  { id: "SLOT_SERVICE_PLATE", frame: "STATIONS_ROOT", x: 0.0, y: -0.22, z: 4.5, yawDeg: 0, radius: 4.46, footprint: true, owner: "PlatingServingStation/PorcelainCoupePlate" },
  // Floating glass capsule 16.4 x 3.2 cm, no floor footprint. Plan value (0, 2.4, 9.2) covered the plate rim from the
  // director camera; P3 moved it 2.6 cm down the screen (along the camera up vector) into the gap between plate and dock.
  { id: "SLOT_BRIEFING_DECK", frame: "STATIONS_ROOT", x: 0.0, y: 0.45, z: 10.92, yawDeg: 0, radius: 0, footprint: false, owner: "DiegeticLayer/BriefingDeckUI" },
  // D1 additions (provisional coordinates, asset phase tunes them; footprint false so assertCollisionFree is unchanged).
  { id: "SLOT_SECONDARY_ACCESSORY", frame: "SAUCEPOT_STATION", x: 0.0, y: 2.6, z: 0.0, yawDeg: 0, radius: 0, footprint: false, owner: "SaucepotStation/StrainerBasketProp" },
  { id: "SLOT_TERTIARY_TOOL_REST", frame: "SKILLET_STATION", x: -4.0, y: 0.02, z: 16.4, yawDeg: 0, radius: 0, footprint: false, owner: "SkilletStation/TertiaryToolProp" },
  // K1a: ramekin column (A4b #326 at z 10.4 +-2.4, A5 #161 column x 10.2): root x <= 18.3, well inside the slab (20)
  { id: "SLOT_SPICE_RAMEKINS", frame: "BOARD", x: 10.2, y: -1.279, z: 10.4, yawDeg: 0, radius: 0, footprint: false, owner: "PrepBoardStation/SpiceRamekins" },
  // A2: starch tray (rim radius 2.48 cm) on the slab between plate (d 8.65 >= 6.96) and prep bowl (d 6.18 >= 4.54),
  // in front of the board edge (root z 1.08); tray bottom at the cookware height like the plate.
  { id: "SLOT_STARCH", frame: "STATIONS_ROOT", x: 8.6, y: -0.22, z: 5.4, yawDeg: 0, radius: 2.5, footprint: true, owner: "StationsRoot/StarchProp_n" },
  // A5 pantry rests (footprints keep clear of the board, bowl 14.7/4.5, plate, starch, ramekins and the saucier / ladle).
  { id: "SLOT_PANTRY_SPICE", frame: "STATIONS_ROOT", x: 13.6, y: -0.22, z: 8.5, yawDeg: 0, radius: 1.8, footprint: true, owner: "StationsRoot/PantryProp_160" },
  { id: "SLOT_PANTRY_FAT", frame: "STATIONS_ROOT", x: -16.2, y: -0.22, z: -12.6, yawDeg: 0, radius: 1.7, footprint: true, owner: "StationsRoot/PantryProp_162" },
  { id: "SLOT_PANTRY_CHEESE", frame: "STATIONS_ROOT", x: -12.5, y: -0.22, z: -12.6, yawDeg: 0, radius: 1.7, footprint: true, owner: "StationsRoot/PantryProp_163" },
  { id: "SLOT_PANTRY_CREAM", frame: "STATIONS_ROOT", x: -8.8, y: -0.22, z: -12.6, yawDeg: 0, radius: 1.5, footprint: true, owner: "StationsRoot/PantryProp_164" },
  { id: "SLOT_PANTRY_OIL", frame: "STATIONS_ROOT", x: -5.4, y: -0.22, z: -12.6, yawDeg: 0, radius: 1.1, footprint: true, owner: "StationsRoot/PantryProp_165" },
  { id: "SLOT_PANTRY_LEGUME", frame: "STATIONS_ROOT", x: -10.6, y: -0.22, z: -15.4, yawDeg: 0, radius: 1.3, footprint: true, owner: "StationsRoot/PantryProp_166" },
];

export function getSlot(id: SlotId): SlotRegister {
  for (let i = 0; i < SLOTS.length; i++) if (SLOTS[i].id === id) return SLOTS[i];
  throw new Error("unknown slot " + id);
}

/** Lane slot for prep index 0..4 (clamped). */
export function laneSlot(i: number): SlotRegister {
  const k = Math.max(0, Math.min(4, Math.floor(i)));
  return SLOTS[k];
}

/** Slot position converted to StationsRoot-local cm. */
export function toRoot(s: SlotRegister): Vec3Like {
  const f = FRAMES[s.frame];
  return { x: f.ox + s.x * f.scale, y: f.oy + s.y * f.scale, z: f.oz + s.z * f.scale };
}

/** Footprint radius in StationsRoot cm. */
export function rootRadius(s: SlotRegister): number {
  return s.radius * FRAMES[s.frame].scale;
}

/** Lane scale factor s = min(1.2, 1.05 / r). r <= 0 or non-finite means "unknown size": use the max. */
export function normalizeScale(radiusOfMesh: number): number {
  if (!(radiusOfMesh > 0) || !isFinite(radiusOfMesh)) return LANE_MAX_SCALE;
  return Math.min(LANE_MAX_SCALE, LANE_MAX_RADIUS / radiusOfMesh);
}

/**
 * Bottom-centre pivot helper. A mesh whose lowest vertex is at local minY, scaled by `scale`,
 * must be shifted by -minY * scale so its bottom contact sits exactly on the slot's y.
 * Returns the Y offset to ADD to the slot Y (0 for meshes already authored with y_min = 0).
 */
export function bottomPivotOffset(minY: number, scale: number = 1): number {
  const s = isFinite(scale) ? scale : 1;
  return isFinite(minY) ? -minY * s : 0;
}

/** Final Y for an object of lowest vertex `minY` and scale `scale` placed on `slot` (frame-local). */
export function seatedY(slot: SlotRegister, minY: number, scale: number = 1): number {
  return slot.y + bottomPivotOffset(minY, scale);
}

export interface SlotViolation {
  a: SlotId;
  b: SlotId | "SLAB";
  kind: "OVERLAP" | "OUT_OF_SLAB";
  /** centre distance (OVERLAP) or overhang in cm (OUT_OF_SLAB) */
  value: number;
  /** minimum allowed centre distance (OVERLAP) or 0 */
  limit: number;
}

/**
 * Pairwise footprint check in StationsRoot cm (+ slab containment). Returns violations ([] = collision free).
 * Pure: pass a custom table to test hypothetical layouts.
 */
export function assertCollisionFree(slots: SlotRegister[] = SLOTS): SlotViolation[] {
  const out: SlotViolation[] = [];
  const fp = slots.filter((s) => s.footprint);
  for (let i = 0; i < fp.length; i++) {
    const pa = toRoot(fp[i]);
    const ra = rootRadius(fp[i]);
    // slab containment
    const over = Math.max(SLAB.minX - (pa.x - ra), (pa.x + ra) - SLAB.maxX, SLAB.minZ - (pa.z - ra), (pa.z + ra) - SLAB.maxZ);
    if (over > 1e-6) out.push({ a: fp[i].id, b: "SLAB", kind: "OUT_OF_SLAB", value: over, limit: 0 });
    for (let j = i + 1; j < fp.length; j++) {
      const pb = toRoot(fp[j]);
      const rb = rootRadius(fp[j]);
      const d = Math.sqrt((pa.x - pb.x) * (pa.x - pb.x) + (pa.z - pb.z) * (pa.z - pb.z));
      if (d < ra + rb - 1e-6) out.push({ a: fp[i].id, b: fp[j].id, kind: "OVERLAP", value: d, limit: ra + rb });
    }
  }
  return out;
}
