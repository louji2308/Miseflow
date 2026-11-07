import { Button } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button";
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle";
import { MiseFlowButtonTrigger } from "./MiseFlowButtonTrigger";

/**
 * StudioCardKit.ts (v5 P5)
 * Shared card language of the Dish Studio, the briefing card deck and the loading panel:
 * dark glass, thin accent outline, LESS-ROUNDED (near-square) corners, white titles + accent subtitles,
 * additive-display friendly colours (no pure black). Buttons are UIKit Buttons (pinch / poke input) with a
 * passive MiseFlowButtonTrigger, so LEAF and the hand both go through MiseFlowButtonTrigger.triggerAction().
 */

export const KIT = {
  TEXT: new vec4(0.97, 0.98, 1.0, 1.0),
  MUTED: new vec4(0.7, 0.78, 0.88, 0.95),
  GLASS: new vec4(0.04, 0.06, 0.1, 1.0),
  CYAN: new vec4(0.22, 0.86, 0.98, 1.0),
  GOLD: new vec4(1.0, 0.76, 0.28, 1.0),
  VIOLET: new vec4(0.76, 0.54, 1.0, 1.0),
  EMERALD: new vec4(0.24, 0.95, 0.62, 1.0),
  CORAL: new vec4(1.0, 0.42, 0.38, 1.0),
  AMBER: new vec4(1.0, 0.62, 0.16, 1.0),
  NEUTRAL: new vec4(0.62, 0.66, 0.72, 1.0),
  /** Card corner radius: about 1/4 of the station pill radius (near-square). */
  CARD_RADIUS: 0.3,
  BUTTON_RADIUS: 0.2,
};

export function withAlpha(c: vec4, a: number): vec4 {
  return new vec4(c.r, c.g, c.b, a);
}

export function scaleRgb(c: vec4, k: number, a: number): vec4 {
  return new vec4(c.r * k, c.g * k, c.b * k, a);
}

export interface KitGlass {
  obj: SceneObject;
  rr: RoundedRectangle;
  bg: vec4;
  border: vec4;
  borderSize: number;
  radius: number;
  opacity: number;
}

export function applyKitGlass(g: KitGlass): void {
  if (!g.rr || isNull(g.rr)) return;
  g.rr.gradient = false;
  g.rr.backgroundColor = g.bg;
  g.rr.border = true;
  g.rr.borderColor = g.border;
  g.rr.borderSize = g.borderSize;
  g.rr.cornerRadius = g.radius;
  g.rr.opacity = g.opacity;
}

export function kitGlass(parent: SceneObject, name: string, pos: vec3, size: vec2, bg: vec4, border: vec4, borderSize: number, radius: number, list?: KitGlass[]): KitGlass {
  const obj = global.scene.createSceneObject(name);
  obj.setParent(parent);
  obj.getTransform().setLocalPosition(pos);
  const rr = obj.createComponent(RoundedRectangle.getTypeName()) as RoundedRectangle;
  rr.size = size;
  const g: KitGlass = { obj, rr, bg, border, borderSize, radius, opacity: 1 };
  applyKitGlass(g);
  if (list) list.push(g);
  return g;
}

/** Dark-glass card with a thin accent outline and near-square corners. */
export function kitCard(parent: SceneObject, name: string, pos: vec3, size: vec2, accent: vec4, list?: KitGlass[]): KitGlass {
  return kitGlass(parent, name, pos, size, withAlpha(KIT.GLASS, 0.9), withAlpha(accent, 0.9), 0.06, KIT.CARD_RADIUS, list);
}

export interface KitTextOpts {
  wrap?: boolean;
  align?: "left" | "center" | "right";
  weight?: number;
}

/** Text lives under a Canvas (the owner root carries it); shrink-to-fit by default so long lines never overflow. */
export function kitText(parent: SceneObject, name: string, content: string, size: number, color: vec4, pos: vec3, w: number, h: number, opts: KitTextOpts = {}): Text {
  const obj = global.scene.createSceneObject(name);
  obj.setParent(parent);
  obj.getTransform().setLocalPosition(pos);
  const t = obj.createComponent("Component.Text") as Text;
  t.text = content;
  t.size = size;
  (t as Text & { weight?: number }).weight = opts.weight !== undefined ? opts.weight : 700;
  t.textFill.mode = TextFillMode.Solid;
  t.textFill.color = color;
  t.horizontalAlignment = opts.align === "left" ? HorizontalAlignment.Left : opts.align === "right" ? HorizontalAlignment.Right : HorizontalAlignment.Center;
  t.verticalAlignment = VerticalAlignment.Center;
  t.horizontalOverflow = opts.wrap ? HorizontalOverflow.Wrap : HorizontalOverflow.Shrink;
  t.verticalOverflow = opts.wrap ? VerticalOverflow.Shrink : VerticalOverflow.Overflow;
  t.depthTest = true;
  t.layoutRect = Rect.create(-w / 2, w / 2, -h / 2, h / 2);
  return t;
}

export interface KitButton {
  obj: SceneObject;
  frame: KitGlass;
  accent: vec4;
  label: Text | null;
  hovered: boolean;
  pressed: boolean;
  dim: boolean;
  primary: boolean;
  scale: number;
}

export function styleKitButton(b: KitButton): void {
  const f = b.frame;
  if (b.pressed) {
    f.bg = scaleRgb(b.accent, 0.5, 0.95);
    f.border = withAlpha(KIT.TEXT, 1.0);
    f.borderSize = 0.09;
  } else if (b.hovered) {
    f.bg = scaleRgb(b.accent, 0.3, 0.94);
    f.border = withAlpha(b.accent, 1.0);
    f.borderSize = 0.08;
  } else {
    f.bg = b.dim ? withAlpha(KIT.GLASS, 0.75) : b.primary ? scaleRgb(b.accent, 0.22, 0.94) : withAlpha(KIT.GLASS, 0.9);
    f.border = withAlpha(b.dim ? KIT.MUTED : b.accent, b.dim ? 0.35 : 0.92);
    f.borderSize = 0.06;
  }
  applyKitGlass(f);
  if (b.label) b.label.textFill.color = b.dim ? withAlpha(KIT.MUTED, 0.6) : KIT.TEXT;
}

/**
 * Near-square button: glass frame + optional centred label + UIKit Button (Rectangle / Ghost) for input +
 * passive MiseFlowButtonTrigger (its action is deduced from the object name). Release fires triggerAction().
 */
export function kitButton(parent: SceneObject, name: string, label: string, accent: vec4, pos: vec3, w: number, h: number, textSize: number, list: KitButton[], glassList?: KitGlass[], primary: boolean = false): KitButton {
  const holder = global.scene.createSceneObject(`${name}_Holder`);
  holder.setParent(parent);
  holder.getTransform().setLocalPosition(pos);
  const frame = kitGlass(holder, `${name}_Frame`, new vec3(0, 0, -0.05), new vec2(w, h), withAlpha(KIT.GLASS, 0.9), withAlpha(accent, 0.92), 0.06, Math.min(KIT.BUTTON_RADIUS, h * 0.2), glassList);
  const txt = label.length > 0 ? kitText(holder, `${name}_Label`, label, textSize, KIT.TEXT, new vec3(0, 0, 0.06), w - 0.3, h) : null;

  const obj = global.scene.createSceneObject(name);
  obj.setParent(holder);
  const btn = obj.createComponent(Button.getTypeName()) as Button;
  btn.setVariant({ theme: "SnapOS2", shape: "Rectangle", style: "Ghost" });
  btn.size = new vec3(w, h, 0.3);
  obj.createComponent(MiseFlowButtonTrigger.getTypeName());

  const kb: KitButton = { obj: holder, frame, accent, label: txt, hovered: false, pressed: false, dim: false, primary, scale: 1 };
  btn.onHoverEnter.add(() => { kb.hovered = true; styleKitButton(kb); });
  btn.onHoverExit.add(() => { kb.hovered = false; kb.pressed = false; styleKitButton(kb); });
  btn.onTriggerDown.add(() => { kb.pressed = true; styleKitButton(kb); });
  btn.onTriggerUp.add(() => {
    kb.pressed = false;
    styleKitButton(kb);
    if (kb.dim) return;
    const trig = obj.getComponent(MiseFlowButtonTrigger.getTypeName()) as MiseFlowButtonTrigger;
    if (trig) trig.triggerAction();
  });
  styleKitButton(kb);
  list.push(kb);
  return kb;
}

/** Hover / press scale feedback, call once per frame. */
export function animateKitButtons(list: KitButton[], dt: number): void {
  for (const b of list) {
    const want = b.pressed ? 0.94 : b.hovered ? 1.04 : 1.0;
    if (Math.abs(b.scale - want) > 0.001) {
      b.scale += (want - b.scale) * Math.min(1, dt * 14);
      b.frame.obj.getTransform().setLocalScale(new vec3(b.scale, b.scale, 1));
    }
  }
}

/** First Camera component in the scene (the Specs / preview camera). */
export function findSceneCamera(): Camera | null {
  const n = global.scene.getRootObjectsCount();
  for (let i = 0; i < n; i++) {
    const c = findCameraIn(global.scene.getRootObject(i));
    if (c) return c;
  }
  return null;
}

function findCameraIn(o: SceneObject): Camera | null {
  const c = o.getComponent("Component.Camera") as Camera;
  if (c) return c;
  const k = o.getChildrenCount();
  for (let i = 0; i < k; i++) {
    const r = findCameraIn(o.getChild(i));
    if (r) return r;
  }
  return null;
}

// Preview camera pose used for every recording (todo.md): pos (0,25.1,-21.4) lookAt (0,-4.9,-73.4)
const FALLBACK_CAM_POS = new vec3(0, 25.1, -21.4);
const FALLBACK_CAM_ROT = quat.angleAxis(-Math.PI / 6, vec3.right());

/**
 * Places obj straight in front of the camera so a w x h (cm) layout fills the frame without clipping
 * (distance from the vertical FOV and aspect, plus a margin), facing the viewer. upFrac shifts it up by that
 * fraction of the visible frame height. Returns the distance used.
 */
export function placeInView(obj: SceneObject, w: number, h: number, margin: number = 1.08, upFrac: number = 0, minDist: number = 20, maxDist: number = 200): number {
  const cam = findSceneCamera();
  let pos = FALLBACK_CAM_POS;
  let rot = FALLBACK_CAM_ROT;
  let fov = 0.9;
  let aspect = 1.0;
  if (cam) {
    const tr = cam.getSceneObject().getTransform();
    pos = tr.getWorldPosition();
    rot = tr.getWorldRotation();
    if (typeof cam.fov === "number" && cam.fov > 0.1) fov = cam.fov;
    if (typeof cam.aspect === "number" && cam.aspect > 0.1) aspect = cam.aspect;
  }
  // AR content is only visible inside the Specs display frustum (also in the Preview, where it is the bright
  // central region), so the layout is fitted to the camera's vertical FOV and display aspect.
  const t = Math.tan(fov / 2);
  const fit = Math.max(h / 2 / t, w / 2 / (t * aspect));
  const d = Math.min(maxDist, Math.max(minDist, fit * margin));
  const fwd = rot.multiplyVec3(new vec3(0, 0, -1));
  const up = rot.multiplyVec3(new vec3(0, 1, 0));
  const tr = obj.getTransform();
  tr.setWorldPosition(pos.add(fwd.uniformScale(d)).add(up.uniformScale(upFrac * 2 * d * t)));
  tr.setWorldRotation(rot);
  return d;
}

export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

export function smooth(t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}
