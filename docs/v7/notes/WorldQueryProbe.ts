/**
 * V7 Stage 0 probe: which surface-placement API returns results in the Lens Studio Interactive Preview
 * (Sunlit Room, SPECS 27 simulation)?
 *
 * NOT part of the shipped Lens. Copy into Assets/Scripts/ only when the orchestrator runs the probe,
 * attach it to a SceneObject named V7Probe, and delete both afterwards
 * (see docs/v7/notes/probe-run-instructions.md).
 *
 * No Inspector inputs. Everything starts in OnStartEvent (never onAwake): SIK, the camera and
 * DeviceTracking are only guaranteed ready then.
 *
 * Every output line starts with [V7PROBE] so logs can be grepped. Lines are change-driven (printed
 * only when a probe's result materially changes, plus a slow heartbeat), and the whole probe stops after
 * MAX_PRINTS prints so a long preview session cannot flood the log.
 *
 * Line grammar (fields separated by single spaces):
 *   [V7PROBE] t=<sec> <API>/<session> <ray name> HIT pos=(x,y,z) n=(x,y,z) up=<deg> cls=<name|n/a>
 *   [V7PROBE] t=<sec> <API>/<session> <ray name> NULL
 *   [V7PROBE] t=<sec> <API>/<session> <ray name> NO_CALLBACK   (hitTest never called back)
 *   [V7PROBE] t=<sec> <API>/<session> <ray name> ERROR <message>
 *   API = WQ (WorldQueryModule HitTestSession) | MESH (DeviceTracking world mesh) | SIK
 *   session: A = filter true, B = default options, C = classification true (experimental, may fail)
 *   up=<deg> is the angle between the surface normal and world up (0 = flat horizontal surface).
 */

import { SIK } from "SpectaclesInteractionKit.lspkg/SIK";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";

const TAG = "[V7PROBE]";
const MAX_PRINTS = 120;
const TICK_SECONDS = 0.5;
const HEARTBEAT_TICKS = 20; // re-print an unchanged result every 10 s
const SIG_CELL_CM = 5; // a hit must move this far to count as "changed"

interface RayDef {
  name: string;
  start: vec3;
  end: vec3;
}

interface ProbeState {
  lastSig: string;
  lastPrintTick: number;
  pending: boolean;
  sentAt: number;
}

@component
export class WorldQueryProbe extends BaseScriptComponent {
  private prints = 0;
  private stopped = false;
  private tick = 0;
  private acc = 0;
  private startTime = 0;

  private sessions: { id: string; session: HitTestSession }[] = [];
  private camObj: SceneObject | null = null;
  private camTr: Transform | null = null;
  private deviceTracking: DeviceTracking | null = null;
  private meshRaycastExists = false;
  private meshHitTestExists = false;
  private states: { [key: string]: ProbeState } = {};
  private updateEvt: UpdateEvent | null = null;

  onAwake(): void {
    // Intentionally empty: all work waits for OnStartEvent.
    this.createEvent("OnStartEvent").bind(() => this.onStart());
  }

  // ------------------------------------------------------------------ start

  private onStart(): void {
    this.startTime = getTime();
    this.say("START probe, script " + this.getSceneObject().name);

    try {
      const sys = (global as any).deviceInfoSystem;
      if (sys) {
        this.say(
          "deviceInfoSystem.isEditor()=" + sys.isEditor() +
            " isSpectacles()=" + (typeof sys.isSpectacles === "function" ? sys.isSpectacles() : "n/a") +
            " isDesktop()=" + (typeof sys.isDesktop === "function" ? sys.isDesktop() : "n/a")
        );
      } else {
        this.say("global.deviceInfoSystem is undefined");
      }
    } catch (e) {
      this.say("deviceInfoSystem ERROR " + errText(e));
    }

    this.findCamera();
    this.createSessions();
    this.setupMesh();
    this.logCameraPose("camera at start");

    this.updateEvt = this.createEvent("UpdateEvent");
    this.updateEvt.bind(() => this.onUpdate());
  }

  private findCamera(): void {
    let cam: Camera | null = null;
    try {
      cam = WorldCameraFinderProvider.getInstance().getComponent();
      this.say("camera via SIK WorldCameraFinderProvider");
    } catch (e) {
      this.say("WorldCameraFinderProvider ERROR " + errText(e) + " (falling back to scene search)");
    }
    if (!cam) cam = findCameraInScene();
    if (!cam) {
      this.say("NO CAMERA FOUND, probe cannot cast rays");
      return;
    }
    this.camObj = cam.getSceneObject();
    this.camTr = this.camObj.getTransform();
    this.say("camera object=" + this.camObj.name);
  }

  private createSessions(): void {
    let wq: WorldQueryModule | null = null;
    try {
      wq = require("LensStudio:WorldQueryModule") as WorldQueryModule;
      this.say("WorldQueryModule loaded: " + (wq ? "yes" : "NULL"));
    } catch (e) {
      this.say("WorldQueryModule require ERROR " + errText(e));
      return;
    }
    if (!wq) return;

    // A: filter true (what the plan's claim reticle would use)
    try {
      const optA = HitTestSessionOptions.create();
      optA.filter = true;
      const sA = wq.createHitTestSessionWithOptions(optA);
      sA.start();
      this.sessions.push({ id: "A", session: sA });
      this.say("session A (filter=true) started");
    } catch (e) {
      this.say("session A ERROR " + errText(e));
    }

    // B: default options
    try {
      const sB = wq.createHitTestSession();
      sB.start();
      this.sessions.push({ id: "B", session: sB });
      this.say("session B (default options) started");
    } catch (e) {
      this.say("session B ERROR " + errText(e));
    }

    // C: classification (experimental, wearable-only per d.ts). Optional, never fatal.
    try {
      const optC = HitTestSessionOptions.create();
      optC.filter = true;
      optC.classification = true;
      const sC = wq.createHitTestSessionWithOptions(optC);
      sC.start();
      this.sessions.push({ id: "C", session: sC });
      this.say("session C (filter=true, classification=true) started");
    } catch (e) {
      this.say("session C (classification) ERROR " + errText(e));
    }
  }

  private setupMesh(): void {
    if (!this.camObj) return;
    try {
      this.deviceTracking = this.camObj.getComponent("Component.DeviceTracking") as DeviceTracking;
    } catch (e) {
      this.say("DeviceTracking lookup ERROR " + errText(e));
    }
    const dt = this.deviceTracking as any;
    if (!dt) {
      this.say("camera has NO DeviceTracking component, MESH probes disabled");
      return;
    }
    this.meshRaycastExists = typeof dt.raycastWorldMesh === "function";
    this.meshHitTestExists = typeof dt.hitTestWorldMesh === "function";
    this.say("DeviceTracking.raycastWorldMesh exists=" + this.meshRaycastExists +
      " hitTestWorldMesh exists=" + this.meshHitTestExists);

    try {
      this.say("trackingMode actual=" + dt.getActualDeviceTrackingMode() +
        " (World=" + (typeof DeviceTrackingMode !== "undefined" ? DeviceTrackingMode.World : "n/a") + ")");
    } catch (e) {
      this.say("getActualDeviceTrackingMode ERROR " + errText(e));
    }
    try {
      const caps = dt.worldTrackingCapabilities;
      this.say("worldTrackingCapabilities sceneReconstructionSupported=" +
        (caps ? caps.sceneReconstructionSupported : "n/a") +
        " planesTrackingSupported=" + (caps ? caps.planesTrackingSupported : "n/a"));
    } catch (e) {
      this.say("worldTrackingCapabilities ERROR " + errText(e));
    }
    try {
      const wo = dt.worldOptions;
      this.say("worldOptions BEFORE meshes=" + wo.enableWorldMeshesTracking +
        " classification=" + wo.enableWorldMeshesClassificationTracking);
      wo.enableWorldMeshesTracking = true;
      wo.enableWorldMeshesClassificationTracking = true;
      this.say("worldOptions AFTER  meshes=" + wo.enableWorldMeshesTracking +
        " classification=" + wo.enableWorldMeshesClassificationTracking);
    } catch (e) {
      this.say("worldOptions enable ERROR " + errText(e));
    }
  }

  // ----------------------------------------------------------------- update

  private onUpdate(): void {
    if (this.stopped) return;
    this.acc += getDeltaTime();
    if (this.acc < TICK_SECONDS) return;
    this.acc = 0;
    this.tick++;

    try {
      this.runSikProbe();
    } catch (e) {
      this.emit("SIK/-", "ray", "ERROR " + errText(e), "SIK_ERR");
    }

    const rays = this.buildCameraRays();
    if (rays) {
      for (const r of rays) {
        for (const s of this.sessions) this.castWorldQuery(s.id, s.session, r);
        this.castMesh(r);
      }
      this.castMeshScreen();
    }
  }

  /** Active SIK targeting interactor ray, exactly like the skill example. */
  private runSikProbe(): void {
    const targeting = SIK.InteractionManager.getTargetingInteractors();
    const interactor = targeting.length > 0 ? targeting[0] : null;
    if (!interactor || !interactor.isActive() || !interactor.isTargeting() || !interactor.startPoint || !interactor.endPoint) {
      this.emit("SIK/-", "targetingRay", "NONE (no active targeting interactor; hover the mouse or use PreviewInteractTool Hover)", "none");
      return;
    }
    const ray: RayDef = {
      name: "sikRay",
      start: interactor.startPoint,
      end: interactor.endPoint,
    };
    this.emit("SIK/-", "targetingRay",
      "ACTIVE start=" + fmtV(ray.start) + " end=" + fmtV(ray.end) +
        " inputType=" + String((interactor as any).inputType), "active:" + sig(ray.end));
    for (const s of this.sessions) this.castWorldQuery(s.id, s.session, ray);
    this.castMesh(ray);
  }

  /** Fixed probe rays from the camera. Lens Studio cameras look down local -Z. */
  private buildCameraRays(): RayDef[] | null {
    if (!this.camTr) return null;
    const p = this.camTr.getWorldPosition();
    const view = this.camTr.getWorldRotation().multiplyVec3(new vec3(0, 0, -1)).normalize();
    let flat = new vec3(view.x, 0, view.z);
    if (flat.length < 0.001) flat = new vec3(0, 0, -1);
    flat = flat.normalize();
    const down30 = flat.uniformScale(Math.cos(rad(30))).add(new vec3(0, -Math.sin(rad(30)), 0));
    const down45 = flat.uniformScale(Math.cos(rad(45))).add(new vec3(0, -Math.sin(rad(45)), 0));
    const start60 = p.add(flat.uniformScale(60));
    return [
      { name: "fwd200", start: p, end: p.add(view.uniformScale(200)) },
      { name: "down30_len300", start: p, end: p.add(down30.uniformScale(300)) },
      { name: "down45_len300", start: p, end: p.add(down45.uniformScale(300)) },
      { name: "straightDown_from60cmAhead_len300", start: start60, end: start60.add(new vec3(0, -300, 0)) },
    ];
  }

  // -------------------------------------------------------------- WorldQuery

  private castWorldQuery(sessionId: string, session: HitTestSession, ray: RayDef): void {
    const api = "WQ/" + sessionId;
    const key = api + "|" + ray.name;
    const st = this.getState(key);
    const now = getTime();

    if (st.pending && now - st.sentAt > 1.0) {
      this.emit(api, ray.name, "NO_CALLBACK (hitTest did not call back for " + (now - st.sentAt).toFixed(1) + " s)", "nocb");
    }
    st.pending = true;
    st.sentAt = now;

    try {
      session.hitTest(ray.start, ray.end, (hit: WorldQueryHitTestResult) => {
        st.pending = false;
        try {
          if (!hit) {
            this.emit(api, ray.name, "NULL", "null");
            return;
          }
          const cls = readClassification(hit, "SurfaceClassification");
          this.emit(
            api, ray.name,
            "HIT pos=" + fmtV(hit.position) + " n=" + fmtV(hit.normal) +
              " up=" + upAngle(hit.normal).toFixed(1) + "deg cls=" + cls,
            "hit:" + sig(hit.position)
          );
        } catch (e) {
          this.emit(api, ray.name, "ERROR in callback " + errText(e), "cberr");
        }
      });
    } catch (e) {
      st.pending = false;
      this.emit(api, ray.name, "ERROR " + errText(e), "err");
    }
  }

  // -------------------------------------------------------------- World mesh

  private castMesh(ray: RayDef): void {
    if (!this.deviceTracking || !this.meshRaycastExists) return;
    try {
      const res = this.deviceTracking.raycastWorldMesh(ray.start, ray.end);
      this.emitMesh("MESH/raycast", ray.name, res);
    } catch (e) {
      this.emit("MESH/raycast", ray.name, "ERROR " + errText(e), "err");
    }
  }

  private castMeshScreen(): void {
    if (!this.deviceTracking || !this.meshHitTestExists) return;
    const pts: { name: string; p: vec2 }[] = [
      { name: "screen(0.5,0.5)", p: new vec2(0.5, 0.5) },
      { name: "screen(0.5,0.75)", p: new vec2(0.5, 0.75) },
      { name: "screen(0.5,0.9)", p: new vec2(0.5, 0.9) },
    ];
    for (const pt of pts) {
      try {
        const res = this.deviceTracking.hitTestWorldMesh(pt.p);
        this.emitMesh("MESH/hitTest", pt.name, res);
      } catch (e) {
        this.emit("MESH/hitTest", pt.name, "ERROR " + errText(e), "err");
      }
    }
  }

  private emitMesh(api: string, name: string, res: TrackedMeshHitTestResult[] | null | undefined): void {
    if (!res || res.length === 0) {
      this.emit(api, name, "NULL (empty array)", "null");
      return;
    }
    const h = res[0];
    const cls = readClassification(h, "TrackedMeshFaceClassification");
    this.emit(
      api, name,
      "HIT count=" + res.length + " pos=" + fmtV(h.position) + " n=" + fmtV(h.normal) +
        " up=" + upAngle(h.normal).toFixed(1) + "deg cls=" + cls,
      "hit:" + sig(h.position)
    );
  }

  // --------------------------------------------------------------- printing

  private getState(key: string): ProbeState {
    let s = this.states[key];
    if (!s) {
      s = { lastSig: "", lastPrintTick: -9999, pending: false, sentAt: 0 };
      this.states[key] = s;
    }
    return s;
  }

  /** Change-driven print: only when the signature differs from the last one or on heartbeat. */
  private emit(api: string, rayName: string, body: string, signature: string): void {
    if (this.stopped) return;
    const st = this.getState(api + "|" + rayName + "|print");
    if (st.lastSig === signature && this.tick - st.lastPrintTick < HEARTBEAT_TICKS) return;
    st.lastSig = signature;
    st.lastPrintTick = this.tick;
    this.say(api + " " + rayName + " " + body);
  }

  private say(msg: string): void {
    if (this.stopped) return;
    if (this.prints >= MAX_PRINTS) {
      this.halt();
      return;
    }
    this.prints++;
    print(TAG + " t=" + (getTime() - this.startTime).toFixed(1) + " " + msg);
    if (this.prints >= MAX_PRINTS) this.halt();
  }

  private halt(): void {
    if (this.stopped) return;
    this.stopped = true;
    print(TAG + " print cap " + MAX_PRINTS + " reached, probe stopped (sessions stopped)");
    for (const s of this.sessions) {
      try {
        s.session.stop();
      } catch (e) {
        /* ignore */
      }
    }
    if (this.updateEvt) this.updateEvt.enabled = false;
  }

  private logCameraPose(label: string): void {
    if (!this.camTr) return;
    const p = this.camTr.getWorldPosition();
    const view = this.camTr.getWorldRotation().multiplyVec3(new vec3(0, 0, -1));
    this.say(label + " pos=" + fmtV(p) + " viewDir(-Z)=" + fmtV(view) +
      " transform.forward=" + fmtV(this.camTr.forward) + " transform.back=" + fmtV(this.camTr.back));
  }
}

// ---------------------------------------------------------------- helpers

function rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function r1(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

function fmtV(v: vec3 | null | undefined): string {
  if (!v) return "(null)";
  return "(" + r1(v.x) + "," + r1(v.y) + "," + r1(v.z) + ")";
}

function sig(v: vec3): string {
  return (
    Math.round(v.x / SIG_CELL_CM) + "," + Math.round(v.y / SIG_CELL_CM) + "," + Math.round(v.z / SIG_CELL_CM)
  );
}

function upAngle(n: vec3): number {
  const nn = n.length > 0 ? n.normalize() : n;
  const d = Math.max(-1, Math.min(1, nn.dot(new vec3(0, 1, 0))));
  return (Math.acos(d) * 180) / Math.PI;
}

function errText(e: any): string {
  try {
    if (e && e.message) return String(e.message);
    return String(e);
  } catch (_) {
    return "unprintable error";
  }
}

/** Reads `classification` safely; returns an enum member name when the enum exists at runtime. */
function readClassification(obj: any, enumGlobalName: string): string {
  try {
    const v = obj.classification;
    if (v === undefined || v === null) return "n/a";
    const en = (global as any)[enumGlobalName] ?? (typeof SurfaceClassification !== "undefined" && enumGlobalName === "SurfaceClassification" ? SurfaceClassification : undefined);
    if (en && typeof en[v] === "string") return en[v] + "(" + v + ")";
    return String(v);
  } catch (e) {
    return "n/a(" + errText(e) + ")";
  }
}

function findCameraInScene(): Camera | null {
  const n = global.scene.getRootObjectsCount();
  for (let i = 0; i < n; i++) {
    const c = findCameraIn(global.scene.getRootObject(i));
    if (c) return c;
  }
  return null;
}

function findCameraIn(o: SceneObject): Camera | null {
  const c = o.getComponent("Component.Camera") as Camera;
  if (c && o.enabled && c.type === Camera.Type.Perspective) return c;
  for (let i = 0; i < o.getChildrenCount(); i++) {
    const r = findCameraIn(o.getChild(i));
    if (r) return r;
  }
  return null;
}
