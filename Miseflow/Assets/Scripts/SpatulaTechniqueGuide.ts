import { ChoreographyDAG } from "./ChoreographyDAG";
import { MiseFlowEventBus, MiseFlowEventType } from "./MiseFlowEventBus";
import { makeEmissiveMaterial } from "./StationPropsBuilder";
import { buildUnitQuadMesh, createWorldLabel, faceDirectorCamera, tint } from "./DAGCounterConduit";

const DEG = Math.PI / 180;
const CYAN: [number, number, number] = [0.0, 0.94, 1.0];
const ICE: [number, number, number] = [0.75, 1.0, 1.0];
const GOLD: [number, number, number] = [1.0, 0.8, 0.25];

// Flip arc (guide-local, cm): entry under the fillet's left edge, gentle roll over the top,
// set down on the right. Cubic Hermite: P0/P1 + tangents T0/T1 (apex ~ +4 cm above the skin).
const P0 = new vec3(-3.6, -0.5, 0.0);
const P1 = new vec3(3.4, -0.1, 0.0);
const T0 = new vec3(5.5, 17.0, 0.0);
const T1 = new vec3(5.5, -16.0, 0.0);
const RIBBON_W = 1.1;
const RIBBON_STEPS = 40;
const CYCLE_SEC = 3.4;

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

function newBuilder(): MeshBuilder {
  const b = new MeshBuilder([
    { name: "position", components: 3 },
    { name: "normal", components: 3, normalized: true },
    { name: "texture0", components: 2 },
    { name: "color", components: 4 },
  ]);
  b.topology = MeshTopology.Triangles;
  b.indexType = MeshIndexType.UInt16;
  return b;
}

/** Double-sided flat ribbon along the Hermite arc; width runs along Z (toward the camera). */
function buildRibbonMesh(): RenderMesh {
  const b = newBuilder();
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

/** Axis-aligned box appended to a builder (all 6 faces, outward normals). */
function addBox(verts: number[], idx: number[], c: vec3, h: vec3): void {
  const x0 = c.x - h.x, x1 = c.x + h.x, y0 = c.y - h.y, y1 = c.y + h.y, z0 = c.z - h.z, z1 = c.z + h.z;
  const face = (p: number[][], n: number[]) => {
    const base = verts.length / 12;
    for (const q of p) verts.push(q[0], q[1], q[2], n[0], n[1], n[2], 0, 0, 1, 1, 1, 1);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  face([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0]);
  face([[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]], [-1, 0, 0]);
  face([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0]);
  face([[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]], [0, -1, 0]);
  face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]);
  face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1]);
}

function meshFromBoxes(boxes: { c: vec3; h: vec3 }[]): RenderMesh {
  const b = newBuilder();
  const verts: number[] = [];
  const idx: number[] = [];
  for (const bx of boxes) addBox(verts, idx, bx.c, bx.h);
  b.appendVerticesInterleaved(verts);
  b.appendIndices(idx);
  b.updateMesh();
  return b.getMesh();
}

/**
 * Stylised slotted fish spatula, blade toward +Z, handle toward -Z, origin at the blade's
 * leading edge. Split into a bright "rim" mesh (frame + slats + handle edges: the Fresnel
 * highlight) and a dim translucent "glass" core so it reads as a hologram, not a prop.
 */
function buildSpatulaMeshes(): { rim: RenderMesh; core: RenderMesh } {
  const rim: { c: vec3; h: vec3 }[] = [];
  const core: { c: vec3; h: vec3 }[] = [];
  const T = 0.05; // blade half-thickness
  // Blade: z in [-3.6, 0], x in [-1.5, 1.5]; 5 lengthwise slats with open slots between.
  rim.push({ c: new vec3(0, 0, -0.12), h: new vec3(1.5, T, 0.12) }); // leading edge
  rim.push({ c: new vec3(0, 0, -3.45), h: new vec3(1.5, T, 0.15) }); // heel
  for (const x of [-1.38, -0.69, 0, 0.69, 1.38]) {
    rim.push({ c: new vec3(x, 0, -1.8), h: new vec3(0.12, T, 1.6) });
  }
  core.push({ c: new vec3(0, -0.02, -1.8), h: new vec3(1.45, 0.02, 1.6) }); // glass fill behind the slots
  // Offset neck rising to the handle
  rim.push({ c: new vec3(0, 0.3, -4.3), h: new vec3(0.32, 0.07, 0.75) });
  // Handle: bright edge rails + translucent core
  core.push({ c: new vec3(0, 0.62, -8.0), h: new vec3(0.42, 0.22, 3.0) });
  rim.push({ c: new vec3(0.44, 0.62, -8.0), h: new vec3(0.05, 0.24, 3.0) });
  rim.push({ c: new vec3(-0.44, 0.62, -8.0), h: new vec3(0.05, 0.24, 3.0) });
  rim.push({ c: new vec3(0, 0.62, -11.05), h: new vec3(0.48, 0.24, 0.06) });
  return { rim: meshFromBoxes(rim), core: meshFromBoxes(core) };
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
 * Holographic flip coach over the skillet: a translucent cyan slotted fish spatula traces a
 * 3D cubic-Hermite flip arc ribbon over the salmon, with "45 DEG ENTRY" and "GENTLE ROLL"
 * callouts. Activates when the skillet enters its flip window (<= 10 s left on an active
 * sear) or when the vision stand-in confirms OPTIMAL crust. Event bus + read-only DAG only.
 */
@component
export class SpatulaTechniqueGuide extends BaseScriptComponent {
  @input
  dagController?: ChoreographyDAG;

  /** Seconds the guide stays up after a vision OPTIMAL confirmation (plain field: runtime-created). */
  public visionHoldSeconds: number = 9.0;

  private root!: SceneObject;
  private spatula!: SceneObject;
  private rimMat!: Material;
  private coreMat!: Material;
  private ribbonMat!: Material;
  private beadMats: Material[] = [];
  private beads: SceneObject[] = [];
  private entryLabel!: Text;
  private rollLabel!: Text;
  private angleRef!: SceneObject;
  private angleMat!: Material;

  private alpha: number = 0;
  private visionUntil: number = -1;
  private manual: boolean = false;
  private reason: SpatulaReason = "NONE";
  private clock: number = 0;

  private eventBus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private handlers: { ev: MiseFlowEventType; cb: (d?: any) => void }[] = [];

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => {
      this.resolveDag();
      this.build();
      this.initListeners();
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

  /** Salmon centre in this object's local space (falls back to the skillet layout constant). */
  private salmonAnchor(): vec3 {
    let stationsRoot: SceneObject | null = this.getSceneObject();
    while (stationsRoot && stationsRoot.name !== "StationsRoot" && stationsRoot.hasParent()) {
      stationsRoot = stationsRoot.getParent();
    }
    const salmon = stationsRoot ? findByName(stationsRoot, "SalmonFillet") : null;
    if (salmon) {
      const w = salmon.getTransform().getWorldPosition();
      const p = this.getSceneObject().getTransform().getInvertedWorldTransform().multiplyPoint(w);
      return new vec3(p.x, p.y + 1.35, p.z); // top of the golden skin
    }
    return new vec3(-11.2, 1.35, -1.5);
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

    // Flip arc ribbon (dim translucent) + travelling bright beads
    this.ribbonMat = makeEmissiveMaterial(CYAN[0], CYAN[1], CYAN[2], 0.7);
    setAdditive(this.ribbonMat);
    this.makeVisual(this.root, "FlipArcRibbon", buildRibbonMesh(), this.ribbonMat);
    const quad = buildUnitQuadMesh();
    for (let i = 0; i < 5; i++) {
      const m = makeEmissiveMaterial(ICE[0], ICE[1], ICE[2], 1.0);
      this.beadMats.push(m);
      this.beads.push(this.makeVisual(this.root, `FlipArcBead_${i}`, quad, m));
    }

    // 45 degree entry reference: short horizontal rail at the entry point
    this.angleMat = makeEmissiveMaterial(GOLD[0], GOLD[1], GOLD[2], 1.0);
    this.angleRef = this.makeVisual(this.root, "FlipEntryAngleRef", quad, this.angleMat);
    const ar = this.angleRef.getTransform();
    ar.setLocalPosition(new vec3(P0.x - 1.2, P0.y - 0.02, 0));
    ar.setLocalRotation(quat.fromEulerAngles(0, 90 * DEG, 0));
    ar.setLocalScale(new vec3(0.18, 1, 2.6));

    // Hologram spatula
    this.spatula = global.scene.createSceneObject("SpatulaHologram");
    this.spatula.setParent(this.root);
    const meshes = buildSpatulaMeshes();
    this.rimMat = makeEmissiveMaterial(ICE[0], ICE[1], ICE[2], 1.0);
    this.coreMat = makeEmissiveMaterial(CYAN[0] * 0.5, CYAN[1] * 0.5, CYAN[2] * 0.5, 0.6);
    setAdditive(this.coreMat);
    this.makeVisual(this.spatula, "SpatulaHologram_Rim", meshes.rim, this.rimMat);
    this.makeVisual(this.spatula, "SpatulaHologram_Core", meshes.core, this.coreMat);
    this.spatula.getTransform().setLocalScale(new vec3(0.62, 0.62, 0.62));

    // Callouts (face the director camera)
    const entry = createWorldLabel(this.root, "SpatulaCallout_Entry", "45 DEG ENTRY", 34, new vec4(GOLD[0], GOLD[1], GOLD[2], 1), 5.2, 1.0);
    const entryPos = new vec3(P0.x + 0.6, P0.y + 0.3, 3.4); // front-left of the fillet, inside the pan
    entry.root.getTransform().setLocalPosition(entryPos);
    entry.root.getTransform().setLocalRotation(faceDirectorCamera(anchor.add(entryPos)));
    this.entryLabel = entry.text;

    const roll = createWorldLabel(this.root, "SpatulaCallout_Roll", "GENTLE ROLL", 34, new vec4(ICE[0], ICE[1], ICE[2], 1), 5.0, 1.0);
    const apex = hermite(0.5);
    const rollPos = new vec3(apex.x + 0.3, apex.y + 1.1, 0.4);
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
    const off = () => {
      this.visionUntil = -1;
      this.manual = false;
    };
    this.listen("RESET_REQUESTED", off);
    this.listen("PLATING_CONVERGENCE", off);
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
    const want = this.reason !== "NONE" ? 1 : 0;
    this.alpha += (want - this.alpha) * Math.min(1, dt * 6);
    if (Math.abs(want - this.alpha) < 0.02) this.alpha = want;
    const on = want > 0 || this.alpha > 0.02;
    if (this.root.enabled !== on) this.root.enabled = on;
    if (!on) return;

    const time = getTime();
    // Grow out of the fillet on activation
    const s = 0.35 + 0.65 * this.alpha;
    this.root.getTransform().setLocalScale(new vec3(s, s, s));
    const pulse = 0.5 + 0.5 * Math.sin(time * 5.0);
    tint(this.ribbonMat, CYAN, 0.35 + 0.15 * pulse);
    tint(this.rimMat, ICE, 0.85 + 0.15 * pulse);
    tint(this.coreMat, CYAN, 0.3 + 0.1 * pulse);
    tint(this.angleMat, GOLD, 0.8 + 0.2 * pulse);

    this.animateBeads(time);
    this.animateSpatula(time);
    const urgent = this.reason === "FLIP_WINDOW" && this.dagController && this.dagController.getSkilletRemaining() <= 3;
    this.entryLabel.textFill.color = new vec4(GOLD[0], GOLD[1], GOLD[2], this.alpha);
    this.rollLabel.textFill.color = urgent
      ? new vec4(GOLD[0], GOLD[1], GOLD[2], this.alpha)
      : new vec4(ICE[0], ICE[1], ICE[2], this.alpha);
  }

  private animateBeads(time: number): void {
    const n = this.beads.length;
    for (let i = 0; i < n; i++) {
      const u = (time * 0.42 + i / n) % 1.0;
      const p = hermite(u);
      const tg = hermiteTangent(u).normalize();
      const up = new vec3(-tg.y, tg.x, 0);
      const tr = this.beads[i].getTransform();
      tr.setLocalPosition(new vec3(p.x, p.y + 0.02, 0));
      tr.setLocalRotation(quat.lookAt(tg, up));
      tr.setLocalScale(new vec3(RIBBON_W * 1.15, 1, 0.55));
      tint(this.beadMats[i], ICE, 0.6 + 0.4 * Math.sin(u * Math.PI));
    }
  }

  /**
   * Spatula choreography per cycle: slide in at 45 deg under the fillet (entry), follow the
   * Hermite arc while rolling 180 deg about the blade axis (gentle roll), then set down.
   */
  private animateSpatula(time: number): void {
    const ph = (time % CYCLE_SEC) / CYCLE_SEC;
    const tr = this.spatula.getTransform();
    const entryDir = new vec3(1, -1, 0).normalize(); // blade pointing down-right at 45 deg
    const entryUp = new vec3(1, 1, 0).normalize();
    if (ph < 0.28) {
      // Approach: slide along the 45 deg line toward the entry point
      const k = ph / 0.28;
      const ease = 1 - (1 - k) * (1 - k);
      const back = entryDir.uniformScale(-2.6 * (1 - ease));
      tr.setLocalPosition(P0.add(back));
      tr.setLocalRotation(quat.lookAt(entryDir, entryUp));
    } else if (ph < 0.86) {
      const k = (ph - 0.28) / 0.58;
      const u = k * k * (3 - 2 * k); // smoothstep along the arc
      const p = hermite(u);
      const tg = hermiteTangent(u).normalize();
      // Blend from the 45 deg entry attitude into the arc tangent, then roll 180 deg.
      const blend = Math.min(1, k * 3);
      const dir = entryDir.uniformScale(1 - blend).add(tg.uniformScale(blend)).normalize();
      const up = new vec3(-dir.y, dir.x, 0);
      const roll = quat.angleAxis(Math.PI * u, vec3.forward());
      tr.setLocalPosition(p);
      tr.setLocalRotation(quat.lookAt(dir, up).multiply(roll));
    } else {
      // Set down and hold flat on the landing side
      tr.setLocalPosition(P1);
      const flat = quat.lookAt(new vec3(1, 0, 0), new vec3(0, 1, 0));
      tr.setLocalRotation(flat.multiply(quat.angleAxis(Math.PI, vec3.forward())));
    }
  }
}
