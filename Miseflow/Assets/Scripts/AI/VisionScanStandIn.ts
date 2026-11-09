import { ChoreographyDAG } from "../ChoreographyDAG";
import { MiseFlowEventBus, MiseFlowEventType } from "../MiseFlowEventBus";
import { makeEmissiveMaterial } from "../StationPropsBuilder";
import { buildAnnulusMesh, buildUnitQuadMesh, createWorldLabel, tint } from "../DAGCounterConduit";
import { HeadPoseBillboard } from "../HeadPoseBillboard";
import { AIProposal, GateEvaluation, ProposalGate } from "./ProposalGate";
import { ScanScript, VisionConfig, VisionScanId as ConfigVisionScanId } from "./VisionConfig";

export type VisionScanId = ConfigVisionScanId;

/**
 * The scripted culinary states, cycled in this order by the AI Vision button.
 * OFFLINE FALLBACK: data lives in VisionConfig.offlineScans (kept for LEAF tests and the recording).
 */
export const VISION_SCRIPT: ScanScript[] = VisionConfig.offlineScans;

export const GATE_REJECT_TEXT = `GATE REJECTED (<${VisionConfig.confidenceFloor.toFixed(2)})`;

export interface VisionScanResult {
  id: VisionScanId;
  confidence: number;
  evaluation: GateEvaluation;
  hudMetric: string;
  hudAction: string;
  verdict: "APPROVED" | "OPTIMAL" | "REJECTED";
  latencyMs: number;
}

const VIOLET: [number, number, number] = [0.76, 0.54, 1.0];
const EMERALD: [number, number, number] = [0.24, 0.95, 0.62];
const CORAL: [number, number, number] = [1.0, 0.36, 0.3];

function findByName(parent: SceneObject, name: string): SceneObject | null {
  if (parent.name === name) return parent;
  const count = parent.getChildrenCount();
  for (let i = 0; i < count; i++) {
    const found = findByName(parent.getChild(i), name);
    if (found) return found;
  }
  return null;
}

/**
 * VisionScanStandIn.ts
 * Deterministic, offline stand-in for the RapidRouter vision probe, used for the recorded
 * demo: each AI Vision press cycles EXTEND_SEAR (0.89) -> OPTIMAL_CRUST (0.94) ->
 * STEAM_OCCLUDED (0.41). Every result goes through the real ProposalGate.evaluate (confidence
 * floor 0.55), so the 0.41 scan is genuinely REJECTED and leaves the schedule untouched.
 * Visuals: scan reticle over the fillet and a per-state salmon tint. No network, < 1 ms.
 */
@component
export class VisionScanStandIn extends BaseScriptComponent {
  @input
  dagController?: ChoreographyDAG;

  private nextIndex: number = 0;
  private lastResult: VisionScanResult | null = null;

  private reticleRoot!: SceneObject;
  private ring!: SceneObject;
  private ringMat!: Material;
  private sweep!: SceneObject;
  private sweepMat!: Material;
  private brackets: SceneObject[] = [];
  private bracketMat!: Material;
  private confLabel!: Text;
  private reticleT: number = -1; // seconds since scan start, -1 = hidden
  private readonly reticleSweepSec: number = 0.6;
  private readonly reticleHoldSec: number = 5.0;
  private verdictColor: [number, number, number] = VIOLET;

  private salmonFleshMat: Material | null = null;
  private salmonSkinMat: Material | null = null;
  private fleshDefault: vec4 | null = null;
  private skinDefault: vec4 | null = null;
  private skinEmissiveDefault: vec3 | null = null;
  private fleshEmissiveDefault: vec3 | null = null;

  private eventBus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private handlers: { ev: MiseFlowEventType; cb: (d?: any) => void }[] = [];

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => {
      this.resolveDag();
      this.bindSalmon();
      this.buildReticle();
      this.listen("RESET_REQUESTED", () => this.resetStandIn());
    });
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    this.createEvent("OnDestroyEvent").bind(() => {
      for (const h of this.handlers) this.eventBus.off(h.ev, h.cb);
      this.handlers = [];
    });
  }

  // ───────────────────────── public API ─────────────────────────

  /** AI Vision button: run the next scripted state in the cycle. */
  public runNextScan(): VisionScanResult {
    const s = VISION_SCRIPT[this.nextIndex % VISION_SCRIPT.length];
    this.nextIndex = (this.nextIndex + 1) % VISION_SCRIPT.length;
    return this.runScan(s.id);
  }

  /** Run a specific scripted state (LEAF + director hook). */
  public runScan(id: VisionScanId): VisionScanResult {
    const t0 = getRealTimeNanos();
    let script = VISION_SCRIPT[0];
    for (const s of VISION_SCRIPT) if (s.id === id) script = s;

    const proposal: AIProposal = {
      source: "RAPIDROUTER_VISION",
      targetTaskId: VisionConfig.targetTaskId,
      status: script.status,
      confidence: script.confidence,
      proposedDeltaSeconds: script.proposedDeltaSeconds,
      rationale: script.rationale,
    };
    const evaluation = ProposalGate.evaluate(proposal, true);

    if (evaluation.decision === "AUTO_APPLY" && evaluation.effectiveDeltaSeconds > 0 && this.dagController) {
      this.dagController.proposeCookingExtension(VisionConfig.targetTaskId, evaluation.effectiveDeltaSeconds);
    }

    const conf = script.confidence.toFixed(2);
    let verdict: VisionScanResult["verdict"];
    let hudMetric: string;
    let hudAction: string;
    if (evaluation.decision === "REJECTED") {
      verdict = "REJECTED";
      hudMetric = `STEAM ${conf} - TIMER HELD`;
      hudAction = GATE_REJECT_TEXT;
      this.verdictColor = CORAL;
    } else if (evaluation.decision === "NOOP_SAFE") {
      verdict = "OPTIMAL";
      hudMetric = `CRUST OPTIMAL ${conf}`;
      hudAction = "GATE OK - FLIP GUIDE ON";
      this.verdictColor = EMERALD;
    } else {
      verdict = "APPROVED";
      const d = Math.round(evaluation.effectiveDeltaSeconds || script.proposedDeltaSeconds);
      hudMetric = `SEAR +${d}s  ${conf}`;
      hudAction = `GATE APPROVED +${d}s`;
      this.verdictColor = EMERALD;
    }

    const latencyMs = (getRealTimeNanos() - t0) / 1e6;
    const result: VisionScanResult = { id, confidence: script.confidence, evaluation, hudMetric, hudAction, verdict, latencyMs };
    this.lastResult = result;

    this.applySalmonLook(script);
    this.startReticle(conf);

    this.eventBus.emit("AI_VISION_STATE_CHANGED", {
      state: "RESULT",
      scan: id,
      status: script.status,
      confidence: script.confidence,
      decision: evaluation.decision,
      effectiveDelta: evaluation.effectiveDeltaSeconds,
      displayText: evaluation.displayText,
      hudMetric,
      hudAction,
      verdict,
    });
    print(`[VisionStandIn] ${id} conf=${conf} -> ${evaluation.decision} (${verdict}) in ${latencyMs.toFixed(2)} ms`);
    return result;
  }

  public getLastResult(): VisionScanResult | null {
    return this.lastResult;
  }

  public getNextScanId(): VisionScanId {
    return VISION_SCRIPT[this.nextIndex % VISION_SCRIPT.length].id;
  }

  // ───────────────────────── setup ─────────────────────────

  private listen(ev: MiseFlowEventType, cb: (d?: any) => void): void {
    this.eventBus.on(ev, cb);
    this.handlers.push({ ev, cb });
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

  private stationsRoot(): SceneObject | null {
    let o: SceneObject | null = this.getSceneObject();
    while (o && o.name !== "StationsRoot" && o.hasParent()) o = o.getParent();
    return o;
  }

  /** Clone the salmon materials so the scan tint never leaks into other props. */
  private bindSalmon(): void {
    const root = this.stationsRoot();
    if (!root) return;
    const flesh = findByName(root, "SalmonFillet");
    const skin = findByName(root, "SalmonCrispySkin");
    const take = (o: SceneObject | null): Material | null => {
      if (!o) return null;
      const rmv = o.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      if (!rmv || !rmv.mainMaterial) return null;
      const m = rmv.mainMaterial.clone();
      rmv.mainMaterial = m;
      return m;
    };
    this.salmonFleshMat = take(flesh);
    this.salmonSkinMat = take(skin);
    if (this.salmonFleshMat) {
      this.fleshDefault = this.salmonFleshMat.mainPass.baseColor;
      this.fleshEmissiveDefault = this.readEmissive(this.salmonFleshMat);
    }
    if (this.salmonSkinMat) {
      this.skinDefault = this.salmonSkinMat.mainPass.baseColor;
      this.skinEmissiveDefault = this.readEmissive(this.salmonSkinMat);
    }
  }

  private readEmissive(m: Material): vec3 | null {
    try {
      const e = (m.mainPass as any).Port_Emissive_N006;
      return e ? (e as vec3) : null;
    } catch (e) {
      return null;
    }
  }

  private setColor(m: Material | null, c: [number, number, number], emissiveK: number): void {
    if (!m) return;
    m.mainPass.baseColor = new vec4(c[0], c[1], c[2], 1);
    try {
      (m.mainPass as any).Port_Emissive_N006 = new vec3(c[0] * emissiveK, c[1] * emissiveK, c[2] * emissiveK);
    } catch (e) {
      // no emissive port
    }
  }

  private applySalmonLook(s: ScanScript): void {
    this.setColor(this.salmonFleshMat, s.flesh, 0.22);
    this.setColor(this.salmonSkinMat, s.skin, 0.2);
  }

  private resetStandIn(): void {
    this.nextIndex = 0;
    this.lastResult = null;
    this.reticleT = -1;
    if (this.reticleRoot) this.reticleRoot.enabled = false;
    if (this.salmonFleshMat && this.fleshDefault) {
      this.salmonFleshMat.mainPass.baseColor = this.fleshDefault;
      if (this.fleshEmissiveDefault) (this.salmonFleshMat.mainPass as any).Port_Emissive_N006 = this.fleshEmissiveDefault;
    }
    if (this.salmonSkinMat && this.skinDefault) {
      this.salmonSkinMat.mainPass.baseColor = this.skinDefault;
      if (this.skinEmissiveDefault) (this.salmonSkinMat.mainPass as any).Port_Emissive_N006 = this.skinEmissiveDefault;
    }
  }

  private buildReticle(): void {
    const parent = this.getSceneObject();
    const old = findByName(parent, "VisionScanReticle");
    if (old) old.destroy();
    this.reticleRoot = global.scene.createSceneObject("VisionScanReticle");
    this.reticleRoot.setParent(parent);

    let anchor = new vec3(-11.2, 1.7, -1.5);
    const root = this.stationsRoot();
    const salmon = root ? findByName(root, "SalmonFillet") : null;
    if (salmon) {
      const w = salmon.getTransform().getWorldPosition();
      const p = parent.getTransform().getInvertedWorldTransform().multiplyPoint(w);
      anchor = new vec3(p.x, p.y + 1.7, p.z);
    }
    this.reticleRoot.getTransform().setLocalPosition(anchor);

    const quad = buildUnitQuadMesh();
    const mk = (name: string, mesh: RenderMesh, mat: Material): SceneObject => {
      const o = global.scene.createSceneObject(name);
      o.setParent(this.reticleRoot);
      const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      rmv.mesh = mesh;
      rmv.mainMaterial = mat;
      return o;
    };
    this.ringMat = makeEmissiveMaterial(VIOLET[0], VIOLET[1], VIOLET[2], 1.0);
    this.ring = mk("VisionScanReticle_Ring", buildAnnulusMesh(0.9, 1.0, 48), this.ringMat);
    this.ring.getTransform().setLocalScale(new vec3(4.4, 1, 4.4));

    this.sweepMat = makeEmissiveMaterial(VIOLET[0], VIOLET[1], VIOLET[2], 1.0);
    this.sweep = mk("VisionScanReticle_Sweep", quad, this.sweepMat);

    // Four corner brackets (two quads each) framing the fillet
    this.bracketMat = makeEmissiveMaterial(VIOLET[0], VIOLET[1], VIOLET[2], 1.0);
    const hx = 3.4;
    const hz = 2.4;
    const L = 1.1;
    const W = 0.2;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const a = mk(`VisionScanReticle_Bracket_${sx}_${sz}_H`, quad, this.bracketMat);
        a.getTransform().setLocalPosition(new vec3(sx * (hx - L / 2), 0.02, sz * hz));
        a.getTransform().setLocalScale(new vec3(L, 1, W));
        const b = mk(`VisionScanReticle_Bracket_${sx}_${sz}_V`, quad, this.bracketMat);
        b.getTransform().setLocalPosition(new vec3(sx * hx, 0.02, sz * (hz - L / 2)));
        b.getTransform().setLocalScale(new vec3(W, 1, L));
        this.brackets.push(a, b);
      }
    }

    const label = createWorldLabel(this.reticleRoot, "VisionScanReticle_Conf", "", 34, new vec4(VIOLET[0], VIOLET[1], VIOLET[2], 1), 5.0, 1.0);
    const lp = new vec3(6.6, 0.2, 3.4); // off the fillet's right end, over the pan rim (flip callouts own the left)
    label.root.getTransform().setLocalPosition(lp);
    HeadPoseBillboard.register(label.root, { pitchDeg: 14 });
    this.confLabel = label.text;

    this.reticleRoot.enabled = false;
  }

  private startReticle(conf: string): void {
    if (!this.reticleRoot) return;
    this.reticleT = 0;
    this.reticleRoot.enabled = true;
    this.confLabel.text = `CONF ${conf}`;
  }

  // ───────────────────────── per-frame ─────────────────────────

  private onUpdate(): void {
    if (!this.reticleRoot || this.reticleT < 0) return;
    const dt = getDeltaTime();
    this.reticleT += dt;
    const total = this.reticleSweepSec + this.reticleHoldSec;
    if (this.reticleT > total) {
      this.reticleT = -1;
      this.reticleRoot.enabled = false;
      return;
    }
    const time = getTime();
    const sweeping = this.reticleT < this.reticleSweepSec;
    const color = sweeping ? VIOLET : this.verdictColor;
    const fade = this.reticleT > total - 0.6 ? (total - this.reticleT) / 0.6 : 1.0;
    const pulse = 0.5 + 0.5 * Math.sin(time * 8.0);

    // Ring spins and contracts onto the fillet during the sweep, then locks
    const k = Math.min(1, this.reticleT / this.reticleSweepSec);
    const r = 5.4 - 1.0 * k;
    const rt = this.ring.getTransform();
    rt.setLocalScale(new vec3(r, 1, r));
    rt.setLocalRotation(quat.fromEulerAngles(0, time * 2.0, 0));
    tint(this.ringMat, color, (0.7 + 0.3 * pulse) * fade);
    tint(this.bracketMat, color, fade);

    // Sweep bar crosses the fillet front-to-back while scanning
    this.sweep.enabled = sweeping;
    if (sweeping) {
      const st = this.sweep.getTransform();
      st.setLocalPosition(new vec3(0, 0.05, -2.4 + 4.8 * k));
      st.setLocalScale(new vec3(6.8, 1, 0.22));
      tint(this.sweepMat, VIOLET, 1.0);
    }
    this.confLabel.textFill.color = new vec4(color[0], color[1], color[2], fade);
  }
}
