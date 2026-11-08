/**
 * CookItemLabels.ts  (Chef Director v6)
 *
 * Name tags for the CURRENT step only. When a step starts, a few large glass tags ("KADAI", "SPATULA", "TOMATO") float
 * above the vessel, the tool and the ingredients that step uses; they follow the objects while they move, always face
 * the viewer, and shrink away when the step is done. Never more than MAX_TAGS at once, so the bench is not a wall of
 * text. Scene-root objects (never inside the collapsed StationsRoot). Pure view: reads CookRuntime / CookWorld only.
 */

import { MiseFlowEventBus, MiseFlowEventType } from "../MiseFlowEventBus";
import { KIT, KitGlass, applyKitGlass, easeOutBack, findSceneCamera, kitGlass, kitText, smooth, withAlpha } from "../StudioCardKit";
import { CookEvents, CookWorld } from "./CookWorld";
import { CookRuntime } from "./CookRuntime";

const MAX_TAGS = 5;
const TAG_H = 1.8;
const FONT = 44;
const IN_SEC = 0.22;
const OUT_SEC = 0.28;
const LIFT_Y = 2.2;
const MAX_ALIVE_SEC = 14;

function ev(name: string): MiseFlowEventType {
  return name as unknown as MiseFlowEventType;
}

export function prettyName(s: string): string {
  let t = String(s || "").replace(/_/g, " ").trim().toLowerCase();
  if (t.length > 16) {
    // long names are shortened at a word boundary ("salt and black pepper" -> "salt and black") so a tag stays compact
    const cut = t.slice(0, 16);
    const sp = cut.lastIndexOf(" ");
    t = sp > 5 ? cut.slice(0, sp) : cut;
  }
  return t.length === 0 ? "" : t.charAt(0).toUpperCase() + t.slice(1);
}

interface Tag {
  stepId: string;
  root: SceneObject;
  glass: KitGlass;
  anchor: () => vec3 | null;
  dx: number;
  width: number;
  t: number;
  age: number;
  closing: boolean;
}

@component
export class CookItemLabels extends BaseScriptComponent {
  private static instance: CookItemLabels | null = null;

  private bus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private handlers: { ev: MiseFlowEventType; cb: (d?: any) => void }[] = [];
  private tags: Tag[] = [];
  private world: CookWorld | null = null;
  private maxY: number = 1e9;

  public static getInstance(): CookItemLabels | null {
    return CookItemLabels.instance;
  }

  onAwake(): void {
    CookItemLabels.instance = this;
    this.listen(CookEvents.WORLD_READY, (d?: any) => {
      this.clearAll();
      this.world = d && d.world ? (d.world as CookWorld) : null;
    });
    this.listen(CookEvents.STEP_STARTED, (d?: any) => this.onStarted(d));
    this.listen(CookEvents.STEP_DONE, (d?: any) => this.close(d ? String(d.stepId || "") : ""));
    this.listen(CookEvents.FINISHED, () => this.close(""));
    this.listen(CookEvents.EXIT, () => {
      this.clearAll();
      this.world = null;
    });
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    this.createEvent("OnDestroyEvent").bind(() => {
      this.clearAll();
      for (const h of this.handlers) this.bus.off(h.ev, h.cb);
      this.handlers = [];
      if (CookItemLabels.instance === this) CookItemLabels.instance = null;
    });
  }

  /** Names currently shown (tests). */
  public getShown(): string[] {
    const out: string[] = [];
    for (const t of this.tags) if (!t.closing) out.push(t.root.name.replace("CookTag_", ""));
    return out;
  }

  private listen(name: string, cb: (d?: any) => void): void {
    const safe = (d?: any) => {
      try {
        cb(d);
      } catch (e) {
        print(`[CookItemLabels] ${name} handler error: ${e}`);
      }
    };
    this.bus.on(ev(name), safe);
    this.handlers.push({ ev: ev(name), cb: safe });
  }

  private onStarted(d?: any): void {
    const w = this.world;
    if (!d || !w) return;
    const stepId = String(d.stepId || "");
    let step: any = null;
    for (const s of w.plan.steps || []) if (s && s.id === stepId) step = s;
    if (!step) return;
    const wants: { name: string; anchor: () => vec3 | null }[] = [];
    const eq = step.equipmentId ? w.equipment[step.equipmentId] : null;
    // tags never rise above the tallest vessel rim (an ingredient lifted to pour would otherwise float up behind the step card)
    let maxY = -1e9;
    for (const id in w.equipment) {
      const e = w.equipment[id];
      if (e && e.obj && !isNull(e.obj)) maxY = Math.max(maxY, e.rimWorld().y);
    }
    this.maxY = maxY > -1e8 ? maxY : 1e9;
    // something inside the step's vessel is tagged above its rim, not hidden inside it
    const above = (pos: vec3): vec3 => {
      if (eq && eq.obj && !isNull(eq.obj)) {
        const rim = eq.rimWorld();
        const dx = pos.x - rim.x;
        const dz = pos.z - rim.z;
        if (Math.sqrt(dx * dx + dz * dz) < eq.radiusCm * 1.1 && pos.y < rim.y + 1.0) return new vec3(pos.x, rim.y, pos.z);
      }
      return pos;
    };
    if (eq) {
      wants.push({ name: prettyName(eq.kind), anchor: () => (eq.obj && !isNull(eq.obj) ? eq.rimWorld() : null) });
    }
    const tool = step.toolId ? w.tools[step.toolId] : null;
    if (tool) {
      wants.push({
        name: prettyName(tool.kind),
        anchor: () => (tool.obj && !isNull(tool.obj) ? above(tool.obj.getTransform().getWorldTransform().multiplyPoint(tool.tipLocal)) : null),
      });
    }
    for (const id of Array.isArray(step.ingredientIds) ? step.ingredientIds : []) {
      const it = w.items[id];
      if (!it) continue;
      wants.push({
        name: prettyName(it.name || it.id),
        anchor: () => {
          if (!it.obj || isNull(it.obj)) return null;
          const p = it.pieces && it.pieces.length > 0 && it.pieces[0] && !isNull(it.pieces[0]) ? it.pieces[0] : it.obj;
          return above(p.getTransform().getWorldPosition());
        },
      });
    }
    // a step that mentions a second vessel (from / to) tags it too; the plate is tagged only when plating
    const seen: { [n: string]: boolean } = {};
    let made = 0;
    for (const x of wants) {
      if (made >= 4 || !x.name || seen[x.name]) continue;
      seen[x.name] = true;
      made++;
      this.addTag(stepId, x.name, x.anchor);
    }
    // keep the bench readable: oldest tags go first when more than MAX_TAGS are alive
    let alive = this.tags.filter((t) => !t.closing);
    while (alive.length > MAX_TAGS) {
      alive[0].closing = true;
      alive = alive.filter((t) => !t.closing);
    }
    this.restack();
  }

  private addTag(stepId: string, name: string, anchor: () => vec3 | null): void {
    const root = global.scene.createSceneObject(`CookTag_${name}`);
    root.createComponent("Component.Canvas");
    const text = name.toUpperCase();
    const w = Math.max(3.4, text.length * 0.74 + 1.4);
    const glass = kitGlass(root, "Tag_Glass", new vec3(0, 0, -0.05), new vec2(w, TAG_H), withAlpha(KIT.GLASS, 0.9), withAlpha(KIT.GOLD, 0.95), 0.07, TAG_H * 0.3);
    kitText(root, "Tag_Text", text, FONT, KIT.TEXT, new vec3(0, 0, 0.04), w - 0.3, TAG_H, { weight: 800 });
    root.getTransform().setLocalScale(new vec3(0.001, 0.001, 0.001));
    this.tags.push({ stepId: stepId, root: root, glass: glass, anchor: anchor, dx: 0, width: w, t: 0, age: 0, closing: false });
    applyKitGlass(glass);
  }

  /** Tags that would overlap sideways get different rows (greedy, left to right); at most three rows. */
  private restack(): void {
    const live = this.tags.filter((t) => !t.closing);
    const pts = live.map((t) => {
      const p = t.anchor();
      return { t: t, x: p ? p.x : 0 };
    });
    pts.sort((a, b) => a.x - b.x);
    // one clean row: push neighbours apart sideways until no two tags overlap, then re-centre on where they wanted to be
    const pos = pts.map((q) => q.x);
    for (let i = 1; i < pts.length; i++) {
      const need = (pts[i - 1].t.width + pts[i].t.width) / 2 + 0.5;
      if (pos[i] < pos[i - 1] + need) pos[i] = pos[i - 1] + need;
    }
    let want = 0;
    let got = 0;
    for (let i = 0; i < pts.length; i++) {
      want += pts[i].x;
      got += pos[i];
    }
    const shift = pts.length > 0 ? (want - got) / pts.length : 0;
    for (let i = 0; i < pts.length; i++) pts[i].t.dx = pos[i] + shift - pts[i].x;
  }

  private close(stepId: string): void {
    for (const t of this.tags) if (stepId === "" || t.stepId === stepId) t.closing = true;
  }

  private clearAll(): void {
    for (const t of this.tags) if (t.root && !isNull(t.root)) t.root.destroy();
    this.tags = [];
  }

  private onUpdate(): void {
    if (this.tags.length === 0) return;
    const dt = getDeltaTime();
    const cam = findSceneCamera();
    const camRot = cam ? cam.getSceneObject().getTransform().getWorldRotation() : null;
    for (let i = this.tags.length - 1; i >= 0; i--) {
      const t = this.tags[i];
      if (!t.root || isNull(t.root)) {
        this.tags.splice(i, 1);
        continue;
      }
      t.age += dt;
      if (t.age > MAX_ALIVE_SEC) t.closing = true;
      t.t = t.closing ? Math.max(0, t.t - dt / OUT_SEC) : Math.min(1, t.t + dt / IN_SEC);
      if (t.closing && t.t <= 0) {
        t.root.destroy();
        this.tags.splice(i, 1);
        continue;
      }
      const p = t.anchor();
      if (!p) {
        t.closing = true;
        continue;
      }
      const tr = t.root.getTransform();
      let at = new vec3(p.x + t.dx, Math.min(p.y, this.maxY) + LIFT_Y, p.z);
      if (cam) {
        // pull the tag toward the viewer so a vessel wall never cuts it
        const toCam = cam.getSceneObject().getTransform().getWorldPosition().sub(at);
        if (toCam.length > 1) at = at.add(toCam.normalize().uniformScale(5));
      }
      tr.setWorldPosition(at);
      if (camRot) tr.setWorldRotation(camRot);
      const k = Math.max(0.001, t.closing ? smooth(t.t) : t.t >= 1 ? 1 : easeOutBack(smooth(t.t)));
      tr.setLocalScale(new vec3(k, k, k));
    }
  }
}
