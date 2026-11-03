import { ChoreographyDAG } from "./ChoreographyDAG";
import { MiseFlowEventBus, MiseFlowEventType } from "./MiseFlowEventBus";
import { makeEmissiveMaterial } from "./StationPropsBuilder";
import { buildUnitQuadMesh, createWorldLabel, faceDirectorCamera, tint } from "./DAGCounterConduit";
import { FLIP_DURATION_SEC, SpatulaFlipRig } from "./SpatulaFlipRig";

const CYAN: [number, number, number] = [0.0, 0.94, 1.0];
const ICE: [number, number, number] = [0.75, 1.0, 1.0];
const GOLD: [number, number, number] = [1.0, 0.8, 0.25];

// Flip arc (arc-frame cm): entry at the fillet's near edge, gentle roll over the top, set down on
// the far edge. Cubic Hermite: P0/P1 + tangents T0/T1 (apex ~ +4 cm above the skin).
const P0 = new vec3(-3.6, -0.5, 0.0);
const P1 = new vec3(3.4, -0.1, 0.0);
const T0 = new vec3(5.5, 17.0, 0.0);
const T1 = new vec3(5.5, -16.0, 0.0);
const RIBBON_W = 0.16; // WS9-P2: hairline guide (was a 1.1 cm band)
const RIBBON_STEPS = 40;
const ARC_SCALE = 0.72;
const ARC_SWING = (50 * Math.PI) / 180;
/** Seconds the (subtle) guide leads the physical flip once a trigger fires. */
const GUIDE_LEAD_SEC = 1.0;

export type SpatulaReason = "NONE" | "FLIP_WINDOW" | "VISION_OPTIMAL" | "MANUAL";

function findByName(parent: SceneObject, name: string): SceneObject | null {
  if (parent.name === name) return parent;
  const count = parent.getChildrenCount();
  for (let i = 0; i < count; i++) {
    const found = findByName(parent.getChild(i), name);
    if (found) return found;
  }
  return null;
}

export function hermite(t: number): vec3 {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return P0.uniformScale(h00).add(T0.uniformScale(h10)).add(P1.uniformScale(h01)).add(T1.uniformScale(h11));
}

export function hermiteTangent(t: number): vec3 {
  const t2 = t * t;
  const d00 = 6 * t2 - 6 * t;
  const d10 = 3 * t2 - 4 * t + 1;
  const d01 = -6 * t2 + 6 * t;
  const d11 = 3 * t2 - 2 * t;
  return P0.uniformScale(d00).add(T0.uniformScale(d10)).add(P1.uniformScale(d01)).add(T1.uniformScale(d11));
}

/** Double-sided flat ribbon along the Hermite arc; width runs along Z. */
function buildRibbonMesh(): RenderMesh {
  const b = new MeshBuilder([
    { name: "position", components: 3 },
    { name: "normal", components: 3, normalized: true },
    { name: "texture0", components: 2 },
    { name: "color", components: 4 },
  ]);
  b.topology = MeshTopology.Triangles;
  b.indexType = MeshIndexType.UInt16;
  const verts: number[] = [];
  const idx: number[] = [];
  for (const side of [1, -1]) {
    const base = verts.length / 12;
    for (let i = 0; i <= RIBBON_STEPS; i++) {
      const u = i / RIBBON_STEPS;
      const p = hermite(u);
      const tg = hermiteTangent(u).normalize();
      const n = new vec3(-tg.y * side, tg.x * side, 0);
      verts.push(p.x, p.y, -RIBBON_W / 2, n.x, n.y, n.z, u, 0, 1, 1, 1, 1);
      verts.push(p.x, p.y, RIBBON_W / 2, n.x, n.y, n.z, u, 1, 1, 1, 1, 1);
    }
    for (let i = 0; i < RIBBON_STEPS; i++) {
      const a = base + i * 2;
      if (side > 0) idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
      else idx.push(a, a + 3, a + 1, a, a + 2, a + 3);
    }
  }
  b.appendVerticesInterleaved(verts);
  b.appendIndices(idx);
  b.updateMesh();
  return b.getMesh();
}

function setAdditive(m: Material): void {
  try {
    (m.mainPass as any).blendMode = BlendMode.Add;
    (m.mainPass as any).depthWrite = false;
  } catch (e) {
    // opaque fallback still reads on the additive Specs display
  }
}

/**
 * SpatulaTechniqueGuide.ts
 * Flip coach over the skillet. When the skillet enters its flip window (<= 10 s left on an active
 * sear) or the vision stand-in confirms OPTIMAL crust, a subtle hairline Hermite arc (with
 * "45 DEG ENTRY" / "GENTLE ROLL" callouts kept off the fillet) appears first; GUIDE_LEAD_SEC later
 * the physical SpatulaProp (SpatulaFlipRig) flips the salmon once per run. Reset restores the
 * unflipped fillet and the spatula's rest pose.
 *
 * Public flip API (Auto Cook): playFlip(onDone), isFlipped(), isFlipping(), resetFlip(),
 * getFlipDurationSec(); bus events SALMON_FLIP_STARTED / SALMON_FLIPPED.
 */
@component
export class SpatulaTechniqueGuide extends BaseScriptComponent {
  @input
  dagController?: ChoreographyDAG;

  /** Seconds the guide stays up after a vision OPTIMAL confirmation (plain field: runtime-created). */
  public visionHoldSeconds: number = 9.0;

  private root!: SceneObject;
  private arcFrame!: SceneObject;
  private ribbonMat!: Material;
  private entryLabel!: Text;
  private rollLabel!: Text;
  private angleMat!: Material;

  private alpha: number = 0;
  private visionUntil: number = -1;
  private manual: boolean = false;
  private reason: SpatulaReason = "NONE";
  private clock: number = 0;

  private rig: SpatulaFlipRig = new SpatulaFlipRig();
  private stationsRoot: SceneObject | null = null;
  private flipArmT: number = -1; // seconds since the trigger armed the auto flip, -1 = not armed
  private autoFlipUsed: boolean = false;

  private eventBus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private handlers: { ev: MiseFlowEventType; cb: (d?: any) => void }[] = [];

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => {
      this.resolveDag();
      this.stationsRoot = this.findStationsRoot();
      this.build();
      this.initListeners();
      this.rig.tryInit(this.stationsRoot);
    });
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    this.createEvent("OnDestroyEvent").bind(() => {
      for (const h of this.handlers) this.eventBus.off(h.ev, h.cb);
      this.handlers = [];
    });
  }

  // ───────────────────────── public API ─────────────────────────

  public isGuideActive(): boolean {
    return this.reason !== "NONE";
  }

  public getActivationReason(): SpatulaReason {
    return this.reason;
  }

  /** Director/test hook: pin the guide on (or release the pin). */
  public setManualActive(on: boolean): void {
    this.manual = on;
  }

  /** Called by the vision stand-in when the gate confirms OPTIMAL crust. */
  public activateFromVision(): void {
    this.visionUntil = this.clock + this.visionHoldSeconds;
  }

  /**
   * Play the physical spatula flip now (FLIP_DURATION_SEC, ~3.3 s). onDone runs when the spatula is
   * back at rest; if the salmon is already flipped it runs immediately. Returns false if the flip
   * did not start (already flipped / props not built). Consumes the once-per-run auto flip.
   */
  public playFlip(onDone?: () => void): boolean {
    this.autoFlipUsed = true;
    this.flipArmT = -1;
    if (!this.rig.isReady()) this.rig.tryInit(this.stationsRoot);
    return this.rig.play(onDone);
  }

  public isFlipped(): boolean {
    return this.rig.isFlipped();
  }

  public isFlipping(): boolean {
    return this.rig.isPlaying();
  }

  /** Unflipped salmon, spatula at rest, auto flip re-armed (also done on RESET_REQUESTED). */
  public resetFlip(): void {
    this.rig.reset();
    this.flipArmT = -1;
    this.autoFlipUsed = false;
  }

  public getFlipDurationSec(): number {
    return FLIP_DURATION_SEC;
  }

  // ───────────────────────── build ─────────────────────────

  private resolveDag(): void {
    if (this.dagController) return;
    let o: SceneObject | null = this.getSceneObject();
    while (o && !this.dagController) {
      this.dagController = this.findDag(o);
      o = o.hasParent() ? o.getParent() : null;
    }
  }

  private findDag(o: SceneObject): ChoreographyDAG | undefined {
    const c = o.getComponent(ChoreographyDAG.getTypeName()) as ChoreographyDAG;
    if (c) return c;
    const n = o.getChildrenCount();
    for (let i = 0; i < n; i++) {
      const f = this.findDag(o.getChild(i));
      if (f) return f;
    }
    return undefined;
  }

  private findStationsRoot(): SceneObject | null {
    let o: SceneObject | null = this.getSceneObject();
    while (o && o.name !== "StationsRoot" && o.hasParent()) o = o.getParent();
    return o && o.name === "StationsRoot" ? o : null;
  }

  private findSalmon(): SceneObject | null {
    return this.stationsRoot ? findByName(this.stationsRoot, "SalmonFillet") : null;
  }

  /** Salmon centre in this object's local space (falls back to the skillet layout constant). */
  private salmonAnchor(): vec3 {
    const salmon = this.findSalmon();
    if (salmon) {
      const w = salmon.getTransform().getWorldPosition();
      const p = this.getSceneObject().getTransform().getInvertedWorldTransform().multiplyPoint(w);
      return new vec3(p.x, p.y + 1.35, p.z); // top of the fillet
    }
    return new vec3(-11.2, 1.35, -1.5);
  }

  /** Unit vector (this object's local XZ) across the fillet toward its near (spatula) side. */
  private salmonAcross(): vec3 {
    const salmon = this.findSalmon();
    if (salmon) {
      const wWorld = salmon.getTransform().getWorldRotation().multiplyVec3(vec3.forward());
      const l = this.getSceneObject().getTransform().getInvertedWorldTransform().multiplyDirection(wWorld);
      const f = new vec3(l.x, 0, l.z);
      if (f.length > 1e-4) return f.normalize();
    }
    return new vec3(0.309, 0, 0.951);
  }

  private makeVisual(parent: SceneObject, name: string, mesh: RenderMesh, mat: Material): SceneObject {
    const o = global.scene.createSceneObject(name);
    o.setParent(parent);
    const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    rmv.mesh = mesh;
    rmv.mainMaterial = mat;
    return o;
  }

  private build(): void {
    const parent = this.getSceneObject();
    const old = findByName(parent, "SpatulaGuideRoot");
    if (old) old.destroy();
    this.root = global.scene.createSceneObject("SpatulaGuideRoot");
    this.root.setParent(parent);
    const anchor = this.salmonAnchor();
    this.root.getTransform().setLocalPosition(anchor);

    // Arc frame: +X runs from the fillet's near (spatula) side over the top to the far side - the
    // roll the physical flip performs - swung ARC_SWING toward the camera's right so the hairline
    // reads as an arc from the director camera instead of an edge-on line.
    const w = this.salmonAcross();
    const d = quat.angleAxis(ARC_SWING, vec3.up()).multiplyVec3(w).uniformScale(-1);
    this.arcFrame = global.scene.createSceneObject("FlipArcFrame");
    this.arcFrame.setParent(this.root);
    this.arcFrame.getTransform().setLocalRotation(quat.angleAxis(Math.atan2(-d.z, d.x), vec3.up()));
    this.arcFrame.getTransform().setLocalScale(new vec3(ARC_SCALE, ARC_SCALE, ARC_SCALE));

    this.ribbonMat = makeEmissiveMaterial(CYAN[0], CYAN[1], CYAN[2], 0.7);
    setAdditive(this.ribbonMat);
    this.makeVisual(this.arcFrame, "FlipArcRibbon", buildRibbonMesh(), this.ribbonMat);

    // 45 degree entry tick: short gold hairline at the entry point
    const quad = buildUnitQuadMesh();
    this.angleMat = makeEmissiveMaterial(GOLD[0], GOLD[1], GOLD[2], 1.0);
    const angleRef = this.makeVisual(this.arcFrame, "FlipEntryAngleRef", quad, this.angleMat);
    const ar = angleRef.getTransform();
    ar.setLocalPosition(new vec3(P0.x - 0.9, P0.y - 0.02, 0));
    ar.setLocalRotation(quat.fromEulerAngles(0, 0, 0));
    ar.setLocalScale(new vec3(1.6, 1, 0.1));

    // The physical SpatulaProp replaces the old translucent hologram; the named node stays as the
    // guide's spatula anchor (LEAF asserts it) without any visible mesh.
    const holo = global.scene.createSceneObject("SpatulaHologram");
    holo.setParent(this.arcFrame);
    holo.getTransform().setLocalPosition(P0);

    // Callouts (face the director camera), kept off the fillet: entry in front of the near edge,
    // roll label high over the far side.
    const u = new vec3(w.z, 0, -w.x); // along the fillet (right-hand side seen from the front)
    const entry = createWorldLabel(this.root, "SpatulaCallout_Entry", "45 DEG ENTRY", 30, new vec4(GOLD[0], GOLD[1], GOLD[2], 1), 4.6, 0.9);
    const entryPos = w.uniformScale(4.4).add(u.uniformScale(-3.6)).add(new vec3(0, -0.6, 0));
    entry.root.getTransform().setLocalPosition(entryPos);
    entry.root.getTransform().setLocalRotation(faceDirectorCamera(anchor.add(entryPos)));
    this.entryLabel = entry.text;

    const roll = createWorldLabel(this.root, "SpatulaCallout_Roll", "GENTLE ROLL", 30, new vec4(ICE[0], ICE[1], ICE[2], 1), 4.4, 0.9);
    const rollPos = w.uniformScale(-2.2).add(u.uniformScale(-4.2)).add(new vec3(0, 4.4, 0));
    roll.root.getTransform().setLocalPosition(rollPos);
    roll.root.getTransform().setLocalRotation(faceDirectorCamera(anchor.add(rollPos)));
    this.rollLabel = roll.text;

    this.root.enabled = false;
  }

  // ───────────────────────── events ─────────────────────────

  private listen(ev: MiseFlowEventType, cb: (d?: any) => void): void {
    this.eventBus.on(ev, cb);
    this.handlers.push({ ev, cb });
  }

  private initListeners(): void {
    this.listen("AI_VISION_STATE_CHANGED", (d: any) => {
      if (!d || d.state !== "RESULT") return;
      if (d.status === "OPTIMAL" && d.decision !== "REJECTED") this.activateFromVision();
      else this.visionUntil = -1; // a newer, non-optimal reading withdraws the vision trigger
    });
    this.listen("RESET_REQUESTED", () => {
      this.visionUntil = -1;
      this.manual = false;
      this.resetFlip();
    });
    this.listen("PLATING_CONVERGENCE", () => {
      this.visionUntil = -1;
      this.manual = false;
    });
  }

  // ───────────────────────── per-frame ─────────────────────────

  private computeReason(): SpatulaReason {
    if (this.manual) return "MANUAL";
    const dag = this.dagController;
    if (dag) {
      const rem = dag.getSkilletRemaining();
      if (dag.getTaskState("skillet_sear_skin") === "ACTIVE" && rem > 0 && rem <= 10) return "FLIP_WINDOW";
    }
    if (this.clock < this.visionUntil) return "VISION_OPTIMAL";
    return "NONE";
  }

  private onUpdate(): void {
    if (!this.root) return;
    const dt = getDeltaTime();
    this.clock += dt;
    this.reason = this.computeReason();

    // Auto flip: the first trigger of a run arms it; the guide leads, then the spatula flips.
    if (!this.rig.isReady()) this.rig.tryInit(this.stationsRoot);
    if (this.reason !== "NONE" && this.reason !== "MANUAL" && !this.autoFlipUsed && this.flipArmT < 0 && !this.rig.isFlipped()) {
      this.flipArmT = 0;
    }
    if (this.flipArmT >= 0) {
      this.flipArmT += dt;
      if (this.flipArmT >= GUIDE_LEAD_SEC) this.playFlip();
    }
    this.rig.update(dt);

    // Guide fades back out once the fillet has been turned (it has done its job).
    const want = this.reason !== "NONE" && !(this.rig.isFlipped() && !this.rig.isPlaying()) ? 1 : 0;
    this.alpha += (want - this.alpha) * Math.min(1, dt * 6);
    if (Math.abs(want - this.alpha) < 0.02) this.alpha = want;
    const on = want > 0 || this.alpha > 0.02;
    if (this.root.enabled !== on) this.root.enabled = on;
    if (!on) return;

    const time = getTime();
    const s = 0.5 + 0.5 * this.alpha;
    this.root.getTransform().setLocalScale(new vec3(s, s, s));
    const pulse = 0.5 + 0.5 * Math.sin(time * 4.0);
    // dim while the real spatula is working so the prop reads first
    const k = this.rig.isPlaying() ? 0.45 : 1.0;
    tint(this.ribbonMat, CYAN, (0.32 + 0.12 * pulse) * this.alpha * k);
    tint(this.angleMat, GOLD, (0.6 + 0.2 * pulse) * this.alpha * k);

    const urgent = this.reason === "FLIP_WINDOW" && this.dagController && this.dagController.getSkilletRemaining() <= 3;
    const a = this.alpha * (this.rig.isPlaying() ? 0.55 : 0.9);
    this.entryLabel.textFill.color = new vec4(GOLD[0], GOLD[1], GOLD[2], a);
    this.rollLabel.textFill.color = urgent ? new vec4(GOLD[0], GOLD[1], GOLD[2], a) : new vec4(ICE[0], ICE[1], ICE[2], a);
  }
}
