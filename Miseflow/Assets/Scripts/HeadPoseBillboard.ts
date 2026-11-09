import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";

// ============================================================================
// MiseFlow v7 Stage 1B: live head-pose billboarding.
// ----------------------------------------------------------------------------
// Labels used to face a baked-in camera constant (0,42.6,54.6 in StationsRoot space). This
// component faces them toward the real head every frame instead: yaw-only billboarding plus
// a fixed pitch toward the viewer, so text never shears when the wearer walks around the
// counter. Nothing is ever parented to the camera.
//
// Register: pills, stems (pitch 0), chronometer, dock, banner, step card and callouts.
// NEVER register: rings, conduit segments, flush decals or the slab (they must stay flush).
//
// Self-contained: no @input fields, creates its own scene-root object "HeadPoseBillboard".
// Tunables are plain fields / register() options (runtime-created components keep the
// first-compiled @input defaults, see GazeEdgeBeacon).
// ============================================================================

const DEG = Math.PI / 180;
const DEFAULT_PITCH_DEG = 14;
const DEFAULT_DEADBAND_DEG = 0.15;
const DEFAULT_SMOOTH = 12;
const MIN_PARENT_SCALE = 0.01;
/** Last-resort camera (the recorded preview pose, todo.md). */
const FALLBACK_CAM_POS = new vec3(0, 25.1, -21.4);
const OBJECT_NAME = "HeadPoseBillboard";

export interface HeadPoseBillboardOptions {
  /** Fixed tilt toward the viewer in degrees (positive = face tilts up toward a viewer above). Stems use 0. */
  pitchDeg?: number;
  /** Rotation is only rewritten when the smoothed yaw moved more than this (dock uses 6). */
  deadbandDeg?: number;
  /** Yaw smoothing rate (1/s). Higher = snappier. */
  smooth?: number;
  /** While this returns true the entry is not updated at all (dock while a button is hovered/pressed). */
  frozen?: () => boolean;
}

interface Entry {
  obj: SceneObject;
  pitchDeg: number;
  deadbandDeg: number;
  smooth: number;
  frozen?: () => boolean;
  yaw: number; // smoothed yaw (rad)
  lastWritten: number; // last yaw (rad) written to the transform
  fresh: boolean; // next live update snaps without smoothing
}

interface ParentInv {
  parent: SceneObject;
  inv: mat4;
  scaleX: number;
}

function wrapPi(a: number): number {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r < -Math.PI) r += Math.PI * 2;
  return r;
}

function findSceneCameraObject(): Camera | null {
  const n = global.scene.getRootObjectsCount();
  const walk = (o: SceneObject): Camera | null => {
    const c = o.getComponent("Component.Camera") as Camera;
    if (c) return c;
    const k = o.getChildrenCount();
    for (let i = 0; i < k; i++) {
      const r = walk(o.getChild(i));
      if (r) return r;
    }
    return null;
  };
  for (let i = 0; i < n; i++) {
    const c = walk(global.scene.getRootObject(i));
    if (c) return c;
  }
  return null;
}

function buildRotation(yaw: number, pitchDeg: number): quat {
  const q = quat.angleAxis(yaw, vec3.up());
  if (Math.abs(pitchDeg) < 1e-4) return q;
  return q.multiply(quat.angleAxis(-pitchDeg * DEG, vec3.right()));
}

@component
export class HeadPoseBillboard extends BaseScriptComponent {
  private static instance: HeadPoseBillboard | null = null;

  // ───────────────────────── static facade (callers need no ordering) ─────────────────────────

  /** Creates (once) a scene-root object "HeadPoseBillboard" carrying this component. Idempotent. */
  static ensure(): HeadPoseBillboard {
    const cur = HeadPoseBillboard.instance;
    if (cur && !isNull(cur) && !isNull(cur.getSceneObject())) return cur;
    HeadPoseBillboard.instance = null;
    // Reuse an existing one (e.g. after a script reload) before creating another.
    const n = global.scene.getRootObjectsCount();
    for (let i = 0; i < n; i++) {
      const o = global.scene.getRootObject(i);
      if (o.name === OBJECT_NAME) {
        const existing = o.getComponent(HeadPoseBillboard.getTypeName()) as HeadPoseBillboard;
        if (existing) {
          HeadPoseBillboard.instance = existing;
          return existing;
        }
      }
    }
    const obj = global.scene.createSceneObject(OBJECT_NAME);
    const comp = obj.createComponent(HeadPoseBillboard.getTypeName()) as HeadPoseBillboard;
    // createComponent runs onAwake inline, which sets instance; fall back to the returned component.
    if (!HeadPoseBillboard.instance) HeadPoseBillboard.instance = comp;
    return HeadPoseBillboard.instance;
  }

  static register(obj: SceneObject, opts?: HeadPoseBillboardOptions): void {
    HeadPoseBillboard.ensure().registerObject(obj, opts);
  }

  static unregister(obj: SceneObject): void {
    const i = HeadPoseBillboard.instance;
    if (i && !isNull(i)) i.unregisterObject(obj);
  }

  /** Yaw + fixed pitch rotation (parent-local) that turns obj toward the viewer from its current local position. */
  static facing(obj: SceneObject, pitchDeg: number = DEFAULT_PITCH_DEG): quat {
    return HeadPoseBillboard.ensure().facingObject(obj, pitchDeg);
  }

  /** Same, for a position expressed in `frame`'s local space (frame null = world). */
  static facingLocal(frame: SceneObject | null, localPos: vec3, pitchDeg: number = DEFAULT_PITCH_DEG): quat {
    return HeadPoseBillboard.ensure().facingFromFrame(frame, localPos, pitchDeg);
  }

  /** Effective camera world position (the simulated one when the test hook is set). */
  static cameraWorldPos(): vec3 {
    return HeadPoseBillboard.ensure().getCameraWorldPos();
  }

  /** The real (never simulated) camera world position. */
  static realCameraWorldPos(): vec3 {
    return HeadPoseBillboard.ensure().readRealCamera();
  }

  /** Test hook: pretend the head is at p (world). Pass null to clear. */
  static setSimulatedCameraWorldPos(p: vec3 | null): void {
    HeadPoseBillboard.ensure().simulated = p ? new vec3(p.x, p.y, p.z) : null;
  }

  static getRegisteredCount(): number {
    const i = HeadPoseBillboard.instance;
    return i && !isNull(i) ? i.entries.length : 0;
  }

  // ───────────────────────── instance ─────────────────────────

  private entries: Entry[] = [];
  private simulated: vec3 | null = null;
  private provider: any = null;
  private providerFailed: boolean = false;
  private sceneCam: Camera | null = null;
  private warnedFallback: boolean = false;
  private firstFrame: boolean = true;
  private loggedCount: boolean = false;

  onAwake(): void {
    HeadPoseBillboard.instance = this;
    this.createEvent("LateUpdateEvent").bind(() => this.onLateUpdate());
    this.createEvent("OnDestroyEvent").bind(() => {
      if (HeadPoseBillboard.instance === this) HeadPoseBillboard.instance = null;
      this.entries = [];
    });
  }

  // Instance API (the static facade above delegates here).

  register(obj: SceneObject, opts?: HeadPoseBillboardOptions): void {
    this.registerObject(obj, opts);
  }

  unregister(obj: SceneObject): void {
    this.unregisterObject(obj);
  }

  facing(obj: SceneObject, pitchDeg: number = DEFAULT_PITCH_DEG): quat {
    return this.facingObject(obj, pitchDeg);
  }

  cameraWorldPos(): vec3 {
    return this.getCameraWorldPos();
  }

  setSimulatedCameraWorldPos(p: vec3 | null): void {
    this.simulated = p ? new vec3(p.x, p.y, p.z) : null;
  }

  getRegisteredCount(): number {
    return this.entries.length;
  }

  // ───────────────────────── internals ─────────────────────────

  private registerObject(obj: SceneObject, opts?: HeadPoseBillboardOptions): void {
    if (!obj || isNull(obj)) return;
    const o = opts || {};
    const pitchDeg = o.pitchDeg !== undefined ? o.pitchDeg : DEFAULT_PITCH_DEG;
    let e = this.entries.find((x) => x.obj === obj);
    if (!e) {
      e = {
        obj,
        pitchDeg,
        deadbandDeg: DEFAULT_DEADBAND_DEG,
        smooth: DEFAULT_SMOOTH,
        yaw: 0,
        lastWritten: 0,
        fresh: true,
      };
      this.entries.push(e);
    }
    e.pitchDeg = pitchDeg;
    e.deadbandDeg = o.deadbandDeg !== undefined ? o.deadbandDeg : DEFAULT_DEADBAND_DEG;
    e.smooth = o.smooth !== undefined ? o.smooth : DEFAULT_SMOOTH;
    e.frozen = o.frozen;
    e.fresh = true; // also snaps on the next live frame (the object may not be parented/placed yet)
    try {
      this.snap(e, this.getCameraWorldPos(), []);
    } catch (err) {
      // build-time snap is best effort; the first LateUpdate repeats it
    }
  }

  private unregisterObject(obj: SceneObject): void {
    const i = this.entries.findIndex((x) => x.obj === obj);
    if (i >= 0) this.entries.splice(i, 1);
  }

  private readRealCamera(): vec3 {
    if (!this.providerFailed) {
      try {
        if (!this.provider) this.provider = WorldCameraFinderProvider.getInstance();
        return this.provider.getWorldPosition();
      } catch (err) {
        this.providerFailed = true;
        this.provider = null;
      }
    }
    try {
      if (!this.sceneCam || isNull(this.sceneCam)) this.sceneCam = findSceneCameraObject();
      if (this.sceneCam) return this.sceneCam.getTransform().getWorldPosition();
    } catch (err) {
      this.sceneCam = null;
    }
    if (!this.warnedFallback) {
      this.warnedFallback = true;
      print("[HeadPoseBillboard] no camera found, using the fixed preview pose");
    }
    return FALLBACK_CAM_POS;
  }

  private getCameraWorldPos(): vec3 {
    return this.simulated ? this.simulated : this.readRealCamera();
  }

  private parentInv(parent: SceneObject | null, cache: ParentInv[]): ParentInv | null {
    if (!parent) return null;
    for (const c of cache) if (c.parent === parent) return c;
    const tr = parent.getTransform();
    const rec: ParentInv = { parent, inv: tr.getInvertedWorldTransform(), scaleX: Math.abs(tr.getWorldScale().x) };
    cache.push(rec);
    return rec;
  }

  /** Target yaw (rad) that turns +Z toward the camera, in the object's parent frame. */
  private targetYaw(obj: SceneObject, camW: vec3, cache: ParentInv[]): number | null {
    const pi = this.parentInv(obj.hasParent() ? obj.getParent() : null, cache);
    if (pi && pi.scaleX < MIN_PARENT_SCALE) return null;
    const camL = pi ? pi.inv.multiplyPoint(camW) : camW;
    const lp = obj.getTransform().getLocalPosition();
    const dx = camL.x - lp.x;
    const dz = camL.z - lp.z;
    if (dx * dx + dz * dz < 1e-8) return null;
    return Math.atan2(dx, dz);
  }

  private snap(e: Entry, camW: vec3, cache: ParentInv[]): void {
    const t = this.targetYaw(e.obj, camW, cache);
    if (t === null) return;
    e.yaw = t;
    e.lastWritten = t;
    e.obj.getTransform().setLocalRotation(buildRotation(t, e.pitchDeg));
  }

  private facingObject(obj: SceneObject, pitchDeg: number): quat {
    const cache: ParentInv[] = [];
    const t = this.targetYaw(obj, this.getCameraWorldPos(), cache);
    if (t === null) return obj.getTransform().getLocalRotation();
    return buildRotation(t, pitchDeg);
  }

  private facingFromFrame(frame: SceneObject | null, localPos: vec3, pitchDeg: number): quat {
    const camW = this.getCameraWorldPos();
    let camL = camW;
    if (frame && !isNull(frame)) {
      const tr = frame.getTransform();
      if (Math.abs(tr.getWorldScale().x) >= MIN_PARENT_SCALE) camL = tr.getInvertedWorldTransform().multiplyPoint(camW);
    }
    const dx = camL.x - localPos.x;
    const dz = camL.z - localPos.z;
    if (dx * dx + dz * dz < 1e-8) return quat.quatIdentity();
    return buildRotation(Math.atan2(dx, dz), pitchDeg);
  }

  private onLateUpdate(): void {
    const n = this.entries.length;
    if (n === 0) return;
    if (!this.loggedCount) {
      this.loggedCount = true;
      print("[HeadPoseBillboard] live head-pose billboarding active, registered objects: " + n);
    }
    const dt = Math.min(getDeltaTime(), 0.1);
    const camW = this.getCameraWorldPos();
    const cache: ParentInv[] = [];
    const first = this.firstFrame;
    this.firstFrame = false;

    for (let i = n - 1; i >= 0; i--) {
      const e = this.entries[i];
      if (isNull(e.obj)) {
        this.entries.splice(i, 1);
        continue;
      }
      if (!e.obj.isEnabledInHierarchy) {
        e.fresh = true; // snap when it comes back so a stale pose is never shown
        continue;
      }
      if (e.frozen) {
        let fr = false;
        try {
          fr = e.frozen();
        } catch (err) {
          fr = false;
        }
        if (fr) continue;
      }
      const t = this.targetYaw(e.obj, camW, cache);
      if (t === null) {
        e.fresh = true;
        continue;
      }
      if (e.fresh || first) {
        e.fresh = false;
        e.yaw = t;
        e.lastWritten = t;
        e.obj.getTransform().setLocalRotation(buildRotation(t, e.pitchDeg));
        continue;
      }
      e.yaw += wrapPi(t - e.yaw) * (1 - Math.exp(-dt * e.smooth));
      if (Math.abs(wrapPi(e.yaw - e.lastWritten)) > e.deadbandDeg * DEG) {
        e.lastWritten = e.yaw;
        e.obj.getTransform().setLocalRotation(buildRotation(e.yaw, e.pitchDeg));
      }
    }
  }
}
