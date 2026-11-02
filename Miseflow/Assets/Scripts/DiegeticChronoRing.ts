import { ChoreographyDAG } from "./ChoreographyDAG";
import { MiseFlowEventBus, MiseFlowEventType } from "./MiseFlowEventBus";
import { makeEmissiveMaterial } from "./StationPropsBuilder";
import { buildAnnulusMesh, buildUnitQuadMesh, clamp01, tint } from "./DAGCounterConduit";

// StationsRoot-local burner centres (mirrors StationPropsBuilder.ts)
const SKILLET_XZ = new vec2(-11.2, -1.5);
const SAUCIER_XZ = new vec2(0.0, -10.5);
const SKILLET_R = 8.5; // spec ~9, trimmed so the 9 o'clock tick stays on the slab (x >= -20)
const SAUCIER_R = 6.0;
const RING_Y = -0.06; // flush on the slab (top at -0.23)
const TICKS = 24;
const DEG = Math.PI / 180;

const AMBER: [number, number, number] = [1.0, 0.69, 0.0]; // #FFB000
const GOLD: [number, number, number] = [1.0, 0.84, 0.2];
const RED: [number, number, number] = [1.0, 0.22, 0.18];
const CYAN: [number, number, number] = [0.0, 0.94, 1.0];
const GHOST: [number, number, number] = [0.55, 0.62, 1.0];

interface Tick {
  obj: SceneObject;
  rmv: RenderMeshVisual;
  mat: Material;
}

/**
 * DiegeticChronoRing.ts
 * Replaces the floating status rings with flush, radial 24-tick chronometers painted on the counter:
 *  - Skillet (R 9): ticks extinguish clockwise from 12 o'clock as the 60s sear timer counts down;
 *    a gold/red INVARIANT tick at 12 o'clock pulses at T=0. DRIFT_RECORDED flashes an amber/red Heat Guard ring.
 *  - Saucier (R 6): a bright "start window" arc; on DRIFT_RECORDED it slides back 45 degrees and
 *    leaves a dim ghost arc at the original position.
 * Event bus + read-only ChoreographyDAG getters only.
 */
@component
export class DiegeticChronoRing extends BaseScriptComponent {
  @input
  dagController?: ChoreographyDAG;

  private quad!: RenderMesh;
  private root!: SceneObject;

  private skilletTicks: Tick[] = [];
  private saucierTicks: Tick[] = [];
  private invariant!: Tick;
  private windowSegs: Tick[] = [];
  private ghostSegs: Tick[] = [];
  private heatGuard!: Tick;

  private matOn!: Material;
  private matOff!: Material;
  private matBase!: Material;

  private litCount: number = TICKS;
  private readonly windowCenterStart: number = 90; // degrees clockwise from 12 o'clock
  private windowCenter: number = 90;
  private windowTarget: number = 90;
  private ghostCenter: number = 90;
  private ghostAlpha: number = 0;
  private ghostShown: boolean = false;
  private driftFlashT: number = 0;
  private readonly driftFlashSeconds: number = 2.5;
  private invariantFlashT: number = 0;
  private skilletDone: boolean = false;

  private eventBus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private handlers: { ev: MiseFlowEventType; cb: (d?: any) => void }[] = [];

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => {
      this.resolveDag();
      this.build();
      this.initListeners();
      this.applyReset();
    });
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    this.createEvent("OnDestroyEvent").bind(() => {
      for (const h of this.handlers) this.eventBus.off(h.ev, h.cb);
      this.handlers = [];
    });
  }

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

  // ───────────────────────── build ─────────────────────────

  private makeTick(parent: SceneObject, name: string, mesh: RenderMesh, mat?: Material): Tick {
    const obj = global.scene.createSceneObject(name);
    obj.setParent(parent);
    const rmv = obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    const m = mat ? mat : makeEmissiveMaterial(1, 1, 1, 1.0);
    rmv.mesh = mesh;
    rmv.mainMaterial = m;
    return { obj, rmv, mat: m };
  }

  /** Place a radial tick at `deg` (clockwise from 12 o'clock as seen from above, camera looking toward -Z). */
  private placeRadial(t: Tick, c: vec2, radius: number, deg: number, length: number, width: number, y: number = RING_Y): void {
    const a = deg * DEG;
    const tr = t.obj.getTransform();
    tr.setLocalPosition(new vec3(c.x + Math.sin(a) * radius, y, c.y - Math.cos(a) * radius));
    // +Z of the quad must point along the radial vector (sin a, -cos a) -> yaw = PI - a
    tr.setLocalRotation(quat.fromEulerAngles(0, Math.PI - a, 0));
    tr.setLocalScale(new vec3(width, 1, length));
  }

  private build(): void {
    const parent = this.getSceneObject();
    const stale = parent.getChildrenCount();
    for (let i = stale - 1; i >= 0; i--) {
      const ch = parent.getChild(i);
      if (ch.name === "DiegeticChronoRingRoot") ch.destroy();
    }
    this.root = global.scene.createSceneObject("DiegeticChronoRingRoot");
    this.root.setParent(parent);
    this.quad = buildUnitQuadMesh();

    this.matOn = makeEmissiveMaterial(AMBER[0], AMBER[1], AMBER[2], 1.0);
    this.matOff = makeEmissiveMaterial(0.5, 0.34, 0.12, 0.6);
    this.matBase = makeEmissiveMaterial(0.06, 0.34, 0.4, 0.8);

    // Skillet ring: 24 amber ticks
    const skRoot = global.scene.createSceneObject("Chrono_Skillet");
    skRoot.setParent(this.root);
    for (let i = 0; i < TICKS; i++) {
      const t = this.makeTick(skRoot, `SkilletTick_${i}`, this.quad, this.matOn);
      // v5: thin tangential dashes -> a broken glowing arc instead of chunky radial blocks
      this.placeRadial(t, SKILLET_XZ, SKILLET_R, i * (360 / TICKS), 0.17, 1.55);
      this.skilletTicks.push(t);
    }
    this.invariant = this.makeTick(skRoot, "Chrono_InvariantTick", this.quad);
    this.placeRadial(this.invariant, SKILLET_XZ, SKILLET_R + 0.2, 0, 1.2, 0.24, RING_Y + 0.02);

    // Heat Guard ring (hidden until drift)
    this.heatGuard = this.makeTick(skRoot, "Chrono_HeatGuard", buildAnnulusMesh(0.975, 1.0, 96));
    const hg = this.heatGuard.obj.getTransform();
    hg.setLocalPosition(new vec3(SKILLET_XZ.x, RING_Y + 0.01, SKILLET_XZ.y));
    hg.setLocalScale(new vec3(SKILLET_R - 1.0, 1, SKILLET_R - 1.0));
    this.heatGuard.obj.enabled = false;

    // Saucier ring: dim cyan base ticks + 7-segment window arc + 7-segment ghost arc
    const scRoot = global.scene.createSceneObject("Chrono_Saucier");
    scRoot.setParent(this.root);
    for (let i = 0; i < TICKS; i++) {
      const t = this.makeTick(scRoot, `SaucierTick_${i}`, this.quad, this.matBase);
      this.placeRadial(t, SAUCIER_XZ, SAUCIER_R, i * (360 / TICKS), 0.12, 1.05);
      this.saucierTicks.push(t);
    }
    for (let i = 0; i < 7; i++) {
      this.ghostSegs.push(this.makeTick(scRoot, `SaucierGhost_${i}`, this.quad));
      this.windowSegs.push(this.makeTick(scRoot, `SaucierWindow_${i}`, this.quad));
    }
  }

  // ───────────────────────── events ─────────────────────────

  private listen(ev: MiseFlowEventType, cb: (d?: any) => void): void {
    this.eventBus.on(ev, cb);
    this.handlers.push({ ev, cb });
  }

  private initListeners(): void {
    this.listen("DRIFT_RECORDED", () => {
      if (!this.ghostShown) {
        this.ghostShown = true;
        this.ghostCenter = this.windowTarget;
      }
      this.ghostAlpha = 1.0;
      this.windowTarget = this.windowTarget - 45;
      this.driftFlashT = this.driftFlashSeconds;
    });
    this.listen("RESET_REQUESTED", () => this.applyReset());
  }

  private applyReset(): void {
    this.windowCenter = this.windowCenterStart;
    this.windowTarget = this.windowCenterStart;
    this.ghostShown = false;
    this.ghostAlpha = 0;
    this.driftFlashT = 0;
    this.invariantFlashT = 0;
    this.skilletDone = false;
    this.litCount = -1; // force a skillet tick refresh
  }

  // ───────────────────────── per-frame ─────────────────────────

  private skilletElapsed(): number {
    const dag = this.dagController;
    if (!dag) return 0;
    const total = dag.skilletDurationSeconds > 0 ? dag.skilletDurationSeconds : 60.0;
    return clamp01(1.0 - dag.getSkilletRemaining() / total);
  }

  private onUpdate(): void {
    if (!this.root) return;
    const dt = getDeltaTime();
    const time = getTime();
    this.updateSkillet(time);
    this.updateSaucier(dt, time);
    this.updateHeatGuard(dt, time);
  }

  private updateSkillet(time: number): void {
    const elapsed = this.skilletElapsed();
    const extinguished = Math.floor(elapsed * TICKS + 1e-6);
    const lit = Math.max(0, TICKS - extinguished);
    if (lit !== this.litCount) {
      this.litCount = lit;
      for (let i = 0; i < TICKS; i++) {
        this.skilletTicks[i].rmv.mainMaterial = i >= extinguished ? this.matOn : this.matOff;
      }
    }
    const done = elapsed >= 0.999;
    if (done && !this.skilletDone) this.invariantFlashT = 0;
    this.skilletDone = done;

    // INVARIANT tick: steady gold while the sear is running, red/gold strobe at T=0
    if (done) {
      const s = 0.5 + 0.5 * Math.sin(time * 9.0);
      tint(this.invariant.mat, s > 0.5 ? RED : GOLD, 1.0);
      const g = 1.0 + 0.25 * s;
      const tr = this.invariant.obj.getTransform();
      tr.setLocalScale(new vec3(0.24 * g, 1, 1.2 * g));
    } else {
      tint(this.invariant.mat, GOLD, 0.9);
      this.invariant.obj.getTransform().setLocalScale(new vec3(0.24, 1, 1.2));
    }
  }

  private updateSaucier(dt: number, time: number): void {
    // Slide the start window toward its target (backward = counter-clockwise)
    this.windowCenter += (this.windowTarget - this.windowCenter) * Math.min(1.0, dt * 3.5);
    if (this.driftFlashT > 0) this.driftFlashT -= dt;

    const flashing = this.driftFlashT > 0;
    const pulse = 0.5 + 0.5 * Math.sin(time * 8.0);
    const winColor = flashing ? AMBER : CYAN;
    const winK = flashing ? 0.8 + 0.2 * pulse : 1.0;

    for (let i = 0; i < 7; i++) {
      const off = (i - 3) * 15;
      const w = this.windowSegs[i];
      this.placeRadial(w, SAUCIER_XZ, SAUCIER_R + 0.05, this.windowCenter + off, 0.22, 1.4, RING_Y + 0.02);
      tint(w.mat, winColor, winK);

      const g = this.ghostSegs[i];
      g.obj.enabled = this.ghostShown;
      if (this.ghostShown) {
        this.placeRadial(g, SAUCIER_XZ, SAUCIER_R + 0.05, this.ghostCenter + off, 0.14, 1.25, RING_Y + 0.01);
        tint(g.mat, GHOST, 0.45);
      }
    }
  }

  private updateHeatGuard(dt: number, time: number): void {
    const on = this.driftFlashT > 0;
    if (this.heatGuard.obj.enabled !== on) this.heatGuard.obj.enabled = on;
    if (!on) return;
    const phase = Math.sin(time * 10.0) > 0 ? 1 : 0;
    tint(this.heatGuard.mat, phase ? AMBER : RED, 1.0);
    const f = this.driftFlashT / this.driftFlashSeconds;
    const base = SKILLET_R - 1.0;
    const s = base * (1.0 + 0.06 * Math.sin(time * 10.0) + 0.05 * (1.0 - f));
    this.heatGuard.obj.getTransform().setLocalScale(new vec3(s, 1, s));
  }
}
