import { ChoreographyDAG } from "./ChoreographyDAG";
import { MiseFlowEventBus, MiseFlowEventType } from "./MiseFlowEventBus";
import { makeEmissiveMaterial } from "./StationPropsBuilder";
import { createWorldLabel, tint } from "./DAGCounterConduit";

const DEG = Math.PI / 180;
const CORAL: [number, number, number] = [1.0, 0.36, 0.22];
const GOLD: [number, number, number] = [1.0, 0.78, 0.18];

export type BeaconSide = "NONE" | "LEFT" | "RIGHT";

function findByName(parent: SceneObject, name: string): SceneObject | null {
  if (parent.name === name) return parent;
  const count = parent.getChildrenCount();
  for (let i = 0; i < count; i++) {
    const found = findByName(parent.getChild(i), name);
    if (found) return found;
  }
  return null;
}

function findInScene(name: string): SceneObject | null {
  const n = global.scene.getRootObjectsCount();
  for (let i = 0; i < n; i++) {
    const f = findByName(global.scene.getRootObject(i), name);
    if (f) return f;
  }
  return null;
}

function findCameraObject(o: SceneObject): SceneObject | null {
  if (o.getComponent("Component.Camera")) return o;
  const n = o.getChildrenCount();
  for (let i = 0; i < n; i++) {
    const f = findCameraObject(o.getChild(i));
    if (f) return f;
  }
  return null;
}

function wrap180(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

function formatMMSS(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m < 10 ? "0" + m : "" + m}:${r < 10 ? "0" + r : "" + r}`;
}

/** Double-sided chevron ("<" pointing to -X) in the XY plane, tip at the origin. */
function buildChevronMesh(w: number, h: number, t: number): RenderMesh {
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
  const quad = (p: number[][]) => {
    for (const nz of [1, -1]) {
      const base = verts.length / 12;
      for (const q of p) verts.push(q[0], q[1], 0, 0, 0, nz, 0, 0, 1, 1, 1, 1);
      if (nz > 0) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  };
  // upper arm: tip (0,0) -> (w,h); lower arm: tip -> (w,-h); thickness t along +X
  quad([[0, 0], [t, 0], [w + t, h], [w, h]]);
  quad([[0, 0], [w, -h], [w + t, -h], [t, 0]]);
  b.appendVerticesInterleaved(verts);
  b.appendIndices(idx);
  b.updateMesh();
  return b.getMesh();
}

interface Beacon {
  root: SceneObject;
  chevrons: SceneObject[];
  mats: Material[];
  label: Text;
  labelRoot: SceneObject;
  alpha: number;
}

/**
 * GazeEdgeBeacon.ts
 * Edge-of-view wayfinding: when a critical station (skillet in its flip window, or an
 * unresolved prep-drift heat alert) sits more than 20 deg off the camera's forward axis, a
 * pulsing chevron + label appears at the matching edge of view (EdgeBeacon_Left/Right).
 * It fades once the station is back within 15 deg (hysteresis avoids flicker).
 * Test hook: setSimulatedCameraYaw(deg) overrides the camera yaw used for the angle test.
 */
@component
export class GazeEdgeBeacon extends BaseScriptComponent {
  @input
  dagController?: ChoreographyDAG;

  // Tunables are plain fields (not @input): this component is created at runtime by
  // MiseFlowSpatialUI, and runtime-created components keep the first-compiled @input defaults.
  /** Show beacon when the station is more than this many degrees off-axis. */
  public showAboveDeg: number = 20;
  /** Hide beacon once the station is within this many degrees. */
  public hideBelowDeg: number = 15;
  /** Horizontal angle from centre at which the chevrons sit (Specs display half-FOV ~17 deg). */
  public edgeAngleDeg: number = 12.5;
  /** Distance in front of the camera (cm). */
  public distanceCm: number = 50;
  /** Vertical offset from the view centre (cm at distanceCm); above the counter content. */
  public verticalOffsetCm: number = 4.5;

  private cameraObj: SceneObject | null = null;
  private targetObj: SceneObject | null = null;
  private left!: Beacon;
  private right!: Beacon;
  private side: BeaconSide = "NONE";
  private offAxisDeg: number = 0;
  private driftAlert: boolean = false;
  private simulatedYawDeg: number = NaN;
  private labelText: string = "";

  private eventBus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private handlers: { ev: MiseFlowEventType; cb: (d?: any) => void }[] = [];

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => {
      this.resolveReferences();
      this.build();
      this.initListeners();
    });
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    this.createEvent("OnDestroyEvent").bind(() => {
      for (const h of this.handlers) this.eventBus.off(h.ev, h.cb);
      this.handlers = [];
    });
  }

  // ───────────────────────── public test / director API ─────────────────────────

  /** Override the camera yaw (degrees, 0 = facing -Z, + = turned right) for the angle test. */
  public setSimulatedCameraYaw(deg: number): void {
    this.simulatedYawDeg = deg;
  }

  public clearSimulatedCameraYaw(): void {
    this.simulatedYawDeg = NaN;
  }

  /** Yaw (degrees) from the camera position to the tracked station. */
  public getTargetYawDeg(): number {
    const cam = this.getCameraPos();
    const tgt = this.getTargetPos();
    return Math.atan2(tgt.x - cam.x, -(tgt.z - cam.z)) / DEG;
  }

  public getOffAxisDeg(): number {
    return this.offAxisDeg;
  }

  public getVisibleSide(): BeaconSide {
    return this.side;
  }

  public isCriticalActive(): boolean {
    return this.criticalReason() !== "";
  }

  public getLabelText(): string {
    return this.labelText;
  }

  // ───────────────────────── setup ─────────────────────────

  private resolveReferences(): void {
    if (!this.dagController) {
      let o: SceneObject | null = this.getSceneObject();
      while (o && !this.dagController) {
        this.dagController = this.findDag(o);
        o = o.hasParent() ? o.getParent() : null;
      }
    }
    this.cameraObj = findInScene("Camera Object");
    if (!this.cameraObj) {
      const n = global.scene.getRootObjectsCount();
      for (let i = 0; i < n && !this.cameraObj; i++) this.cameraObj = findCameraObject(global.scene.getRootObject(i));
    }
    this.targetObj = findInScene("SkilletStation");
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

  private build(): void {
    const parent = this.getSceneObject();
    const old = findByName(parent, "GazeEdgeBeaconRoot");
    if (old) old.destroy();
    const root = global.scene.createSceneObject("GazeEdgeBeaconRoot");
    root.setParent(parent);
    const mesh = buildChevronMesh(1.3, 1.8, 0.5);
    this.left = this.buildBeacon(root, "EdgeBeacon_Left", mesh, -1);
    this.right = this.buildBeacon(root, "EdgeBeacon_Right", mesh, 1);
    print(`[GazeEdgeBeacon] ready: show >${this.showAboveDeg} deg, hide <${this.hideBelowDeg} deg, edge ${this.edgeAngleDeg} deg`);
  }

  private buildBeacon(parent: SceneObject, name: string, mesh: RenderMesh, dir: number): Beacon {
    const root = global.scene.createSceneObject(name);
    root.setParent(parent);
    const chevrons: SceneObject[] = [];
    const mats: Material[] = [];
    for (let i = 0; i < 2; i++) {
      const c = global.scene.createSceneObject(`${name}_Chevron_${i}`);
      c.setParent(root);
      const rmv = c.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      const m = makeEmissiveMaterial(CORAL[0], CORAL[1], CORAL[2], 1.0);
      try {
        m.mainPass.depthTest = false;
      } catch (e) {
        // keep default depth state
      }
      rmv.mesh = mesh;
      rmv.mainMaterial = m;
      rmv.renderOrder = 200; // HUD layer: draw over the counter pills
      // Mesh points to -X; flip for the right-hand beacon. Outer chevron sits at the very edge.
      c.getTransform().setLocalRotation(dir > 0 ? quat.angleAxis(Math.PI, vec3.up()) : quat.quatIdentity());
      c.getTransform().setLocalPosition(new vec3(dir * -1.25 * i, 0, 0));
      chevrons.push(c);
      mats.push(m);
    }
    const label = createWorldLabel(root, `${name}_Label`, "", 44, new vec4(CORAL[0], CORAL[1], CORAL[2], 1), 15.0, 1.4);
    label.text.depthTest = false;
    try {
      (label.text as any).renderOrder = 201;
    } catch (e) {
      // default order
    }
    label.text.horizontalAlignment = dir < 0 ? HorizontalAlignment.Left : HorizontalAlignment.Right;
    // Label sits inward of the chevrons, slightly below them.
    label.root.getTransform().setLocalPosition(new vec3(dir < 0 ? 10.4 : -10.4, -2.4, 0));
    root.enabled = false;
    return { root, chevrons, mats, label: label.text, labelRoot: label.root, alpha: 0 };
  }

  private listen(ev: MiseFlowEventType, cb: (d?: any) => void): void {
    this.eventBus.on(ev, cb);
    this.handlers.push({ ev, cb });
  }

  private initListeners(): void {
    this.listen("DRIFT_RECORDED", () => {
      this.driftAlert = true;
    });
    this.listen("HOLD_CONFIRMED", () => {
      this.driftAlert = false;
    });
    this.listen("STATION_STEP_COMPLETED", (d: any) => {
      if (d && d.stationId === "PREP") this.driftAlert = false;
    });
    this.listen("PLATING_CONVERGENCE", () => {
      this.driftAlert = false;
    });
    this.listen("RESET_REQUESTED", () => {
      this.driftAlert = false;
      this.side = "NONE";
    });
  }

  // ───────────────────────── per-frame ─────────────────────────

  private getCameraPos(): vec3 {
    return this.cameraObj ? this.cameraObj.getTransform().getWorldPosition() : new vec3(0, 25.1, -21.4);
  }

  private getTargetPos(): vec3 {
    return this.targetObj ? this.targetObj.getTransform().getWorldPosition() : new vec3(-11.2, -17.7, -77.5);
  }

  private cameraYawDeg(): number {
    if (!isNaN(this.simulatedYawDeg)) return this.simulatedYawDeg;
    if (!this.cameraObj) return 0;
    const look = this.cameraObj.getTransform().getWorldRotation().multiplyVec3(new vec3(0, 0, -1));
    return Math.atan2(look.x, -look.z) / DEG;
  }

  private criticalReason(): string {
    if (this.driftAlert) return "VERIFY LOW HEAT";
    const dag = this.dagController;
    if (!dag) return "";
    const rem = dag.getSkilletRemaining();
    if (dag.getTaskState("skillet_sear_skin") === "ACTIVE" && rem > 0 && rem <= 10) {
      return rem <= 3 ? "FLIP NOW" : "READY TO FLIP";
    }
    return "";
  }

  private onUpdate(): void {
    if (!this.left) return;
    const dt = getDeltaTime();
    const reason = this.criticalReason();
    this.offAxisDeg = wrap180(this.getTargetYawDeg() - this.cameraYawDeg());
    const mag = Math.abs(this.offAxisDeg);

    if (reason === "") {
      this.side = "NONE";
    } else if (this.side === "NONE") {
      if (mag > this.showAboveDeg) this.side = this.offAxisDeg > 0 ? "RIGHT" : "LEFT";
    } else if (mag < this.hideBelowDeg) {
      this.side = "NONE";
    } else {
      this.side = this.offAxisDeg > 0 ? "RIGHT" : "LEFT";
    }

    const rem = this.dagController ? this.dagController.getSkilletRemaining() : 0;
    this.labelText = reason === "" ? "" : `SKILLET: ${reason} ${formatMMSS(rem)}`;
    const color = this.driftAlert ? CORAL : GOLD;
    this.updateBeacon(this.left, this.side === "LEFT", -1, color, dt);
    this.updateBeacon(this.right, this.side === "RIGHT", 1, color, dt);
  }

  private updateBeacon(b: Beacon, want: boolean, dir: number, color: [number, number, number], dt: number): void {
    const target = want ? 1 : 0;
    b.alpha += (target - b.alpha) * Math.min(1, dt * 10);
    if (Math.abs(target - b.alpha) < 0.02) b.alpha = target;
    // Logical state drives enable immediately on show; fade-out disables once fully faded.
    const on = want || b.alpha > 0.02;
    if (b.root.enabled !== on) b.root.enabled = on;
    if (!on) return;

    const time = getTime();
    if (this.cameraObj) {
      const ct = this.cameraObj.getTransform();
      const rot = ct.getWorldRotation();
      const fwd = rot.multiplyVec3(new vec3(0, 0, -1));
      const rightV = rot.multiplyVec3(new vec3(1, 0, 0));
      const upV = rot.multiplyVec3(new vec3(0, 1, 0));
      const lateral = Math.tan(this.edgeAngleDeg * DEG) * this.distanceCm;
      const nudge = Math.sin(time * 6.0) * 0.6 * dir; // chevrons nudge toward the edge
      const p = ct
        .getWorldPosition()
        .add(fwd.uniformScale(this.distanceCm))
        .add(rightV.uniformScale(dir * lateral + nudge))
        .add(upV.uniformScale(this.verticalOffsetCm));
      const tr = b.root.getTransform();
      tr.setWorldPosition(p);
      tr.setWorldRotation(rot);
      const s = 0.2 + 0.8 * b.alpha;
      tr.setLocalScale(new vec3(s, s, s));
    }
    const pulse = 0.5 + 0.5 * Math.sin(time * 7.0);
    for (let i = 0; i < b.mats.length; i++) {
      tint(b.mats[i], color, i === 0 ? 0.75 + 0.25 * pulse : 0.45 + 0.35 * (1 - pulse));
    }
    if (b.label.text !== this.labelText) b.label.text = this.labelText;
    b.label.textFill.color = new vec4(color[0], color[1], color[2], b.alpha);
  }
}
