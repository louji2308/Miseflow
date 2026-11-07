/**
 * ProposalGate.ts — Grandmaster Edition
 * Deterministic Safety & Policy Gate for AI Vision Proposals on Snap Spectacles.
 *
 * Core Principle: The AI is a sensor proposing adjustments; the deterministic gate decides.
 * No LLM can hallucinate schedule corruption or pause a pan on live heat.
 * Thresholds live in VisionConfig.ts (single source of truth for the AI Vision path).
 */

import { VisionConfig } from "./VisionConfig";
import { KINEMATIC_ID_LIST, NOT_FOUND_MESSAGE, PREP_ARCHETYPE_LIST, PRIMARY_KINE_LIST, PROTEIN_ARCHETYPE_LIST, STATION_LIST, UniversalDishBlueprint } from "./UniversalDishSchema";

export type CookingStageStatus = "UNDER" | "OPTIMAL" | "OVER" | "AT_RISK" | "UNSURE";

export interface AIProposal {
  source: "RAPIDROUTER_VISION" | "VOICE_INTENT" | "CHECKPOINT_AUTO";
  targetTaskId: string;
  status: CookingStageStatus;
  confidence: number;            // 0.0 to 1.0
  proposedDeltaSeconds: number;  // Positive = extend, Negative = shorten
  rationale: string;             // Short explanation (<= 6 words)
}

export type GateDecisionType =
  | "AUTO_APPLY"      // Small, high-confidence extension (<= 30s, conf >= 0.8)
  | "REQUIRES_CONFIRM"// Large change, shortening cook, or safety critical
  | "REJECTED"        // Low confidence (< 0.55) or invalid bounds
  | "NOOP_SAFE";      // Optimal status reached, no time delta needed

export interface GateEvaluation {
  decision: GateDecisionType;
  effectiveDeltaSeconds: number;
  displayText: string;          // Concise kitchen HUD message (<= 6 words)
  autoApplyCountdownSec: number;// 3s if AUTO_APPLY, -1 if manual
  requiresCookNotice: boolean;
}

export class ProposalGate {
  private static readonly CONFIDENCE_FLOOR = VisionConfig.confidenceFloor;
  private static readonly HIGH_CONFIDENCE_THRESHOLD = VisionConfig.highConfidenceThreshold;
  private static readonly AUTO_APPLY_MAX_EXTENSION_SEC = VisionConfig.autoApplyMaxExtensionSec;

  /**
   * Deterministically evaluates an incoming AI proposal against strict culinary safety rules.
   * @param proposal Incoming AI proposal from RapidRouter Vision or Voice
   * @param isTaskOnActiveHeat Whether the target station currently has an active burner/heat
   */
  public static evaluate(proposal: AIProposal, isTaskOnActiveHeat: boolean): GateEvaluation {
    // Rule 1: Confidence Floor Check
    if (proposal.confidence < this.CONFIDENCE_FLOOR || proposal.status === "UNSURE") {
      return {
        decision: "REJECTED",
        effectiveDeltaSeconds: 0,
        displayText: "Can't tell. Timer stays.",
        autoApplyCountdownSec: -1,
        requiresCookNotice: false,
      };
    }

    // Rule 2: Optimal Status — on track
    if (proposal.status === "OPTIMAL" || proposal.proposedDeltaSeconds === 0) {
      return {
        decision: "NOOP_SAFE",
        effectiveDeltaSeconds: 0,
        displayText: "Sear optimal. Flip at zero.",
        autoApplyCountdownSec: -1,
        requiresCookNotice: false,
      };
    }

    // Rule 3: Active Heat Safety — Never pause or freeze an active burner silently
    if (isTaskOnActiveHeat && proposal.proposedDeltaSeconds < 0) {
      // Shortening an active sear requires human confirmation to prevent burning
      return {
        decision: "REQUIRES_CONFIRM",
        effectiveDeltaSeconds: Math.max(VisionConfig.activeHeatShortenCapSec, proposal.proposedDeltaSeconds),
        displayText: "Sear ahead. Flip early?",
        autoApplyCountdownSec: -1,
        requiresCookNotice: true,
      };
    }

    // Rule 4: Small Extension (UNDER, <= 30s, High Confidence) -> AUTO_APPLY with 3s cancel window
    if (
      proposal.status === "UNDER" &&
      proposal.proposedDeltaSeconds > 0 &&
      proposal.proposedDeltaSeconds <= this.AUTO_APPLY_MAX_EXTENSION_SEC &&
      proposal.confidence >= this.HIGH_CONFIDENCE_THRESHOLD
    ) {
      return {
        decision: "AUTO_APPLY",
        effectiveDeltaSeconds: proposal.proposedDeltaSeconds,
        displayText: `Skin needs +${Math.round(proposal.proposedDeltaSeconds)}s. Auto-applied.`,
        autoApplyCountdownSec: VisionConfig.autoApplyCountdownSec,
        requiresCookNotice: false,
      };
    }

    // Rule 5: Smoke or Overcooking Risk
    if (proposal.status === "OVER" || proposal.status === "AT_RISK") {
      return {
        decision: "REQUIRES_CONFIRM",
        effectiveDeltaSeconds: 0,
        displayText: "Warning: High browning. Check heat!",
        autoApplyCountdownSec: -1,
        requiresCookNotice: true,
      };
    }

    // Rule 6: Larger Extension (> 30s) -> Requires explicit cook confirmation
    if (proposal.proposedDeltaSeconds > this.AUTO_APPLY_MAX_EXTENSION_SEC) {
      const clampedDelta = Math.min(VisionConfig.largeExtensionCapSec, proposal.proposedDeltaSeconds);
      return {
        decision: "REQUIRES_CONFIRM",
        effectiveDeltaSeconds: clampedDelta,
        displayText: `Extend +${clampedDelta}s? Say yes.`,
        autoApplyCountdownSec: -1,
        requiresCookNotice: true,
      };
    }

    // Default fallback: preserve schedule integrity
    return {
      decision: "REJECTED",
      effectiveDeltaSeconds: 0,
      displayText: "Proposal unverified. Plan unchanged.",
      autoApplyCountdownSec: -1,
      requiresCookNotice: false,
    };
  }

  // -- v5: dish blueprint validation (deterministic gate for presets AND model output) --

  /**
   * Validates and sanitizes a UniversalDishBlueprint. Never throws.
   * ok === false means the blueprint is structurally unusable (errors[]); `sanitized` is then best-effort only.
   * Safe issues (out-of-range numbers, over-long text, wrong angle, card order) are clamped/truncated and listed in warnings[].
   */
  /** True when a (model) blueprint says it is not a real dish: found === false. */
  public static isNotFound(bp: any): boolean {
    return !!bp && typeof bp === "object" && bp.found === false;
  }

  /** The user-facing message for a not-found result (the blueprint's own notFoundMessage when sane, else the default). */
  public static notFoundText(bp: any): string {
    const m = bp && typeof bp.notFoundMessage === "string" ? bp.notFoundMessage.replace(/\s+/g, " ").trim() : "";
    return m.length > 0 && m.length <= 80 ? m : NOT_FOUND_MESSAGE;
  }

  public static validateDishBlueprint(bp: any): { ok: boolean; errors: string[]; warnings: string[]; sanitized: UniversalDishBlueprint } {
    const errors: string[] = [];
    const warnings: string[] = [];
    let out: any = {};
    try {
      out = ProposalGate.sanitizeBlueprint(bp, errors, warnings);
    } catch (e) {
      errors.push("exception: " + e);
    }
    return { ok: errors.length === 0, errors: errors, warnings: warnings, sanitized: out as UniversalDishBlueprint };
  }

  private static num(v: any, lo: number, hi: number, name: string, errors: string[], warnings: string[], fallback?: number): number {
    if (typeof v !== "number" || !isFinite(v)) {
      if (fallback !== undefined) { warnings.push(name + " missing, using " + fallback); return fallback; }
      errors.push(name + " is not a finite number");
      return lo;
    }
    if (v < lo || v > hi) {
      const c = Math.max(lo, Math.min(hi, v));
      warnings.push(name + " " + v + " clamped to " + c);
      return c;
    }
    return v;
  }

  private static text(v: any, max: number, name: string, errors: string[], warnings: string[]): string {
    if (typeof v !== "string") { errors.push(name + " must be a string"); return ""; }
    let t = v.replace(/\s+/g, " ").trim();
    if (t.length === 0) { errors.push(name + " is empty"); return ""; }
    if (t.length > max) { warnings.push(name + " truncated to " + max + " chars"); t = t.substring(0, max).trim(); }
    return t;
  }

  private static rgb(v: any, name: string, errors: string[], warnings: string[]): [number, number, number] {
    if (!Array.isArray(v) || v.length !== 3) { errors.push(name + " must be [r,g,b]"); return [0.5, 0.5, 0.5]; }
    const r: number[] = [];
    for (let i = 0; i < 3; i++) r.push(ProposalGate.num(v[i], 0, 1, name + "[" + i + "]", errors, warnings));
    return [r[0], r[1], r[2]];
  }

  private static oneOf(v: any, allowed: string[], name: string, errors: string[]): string {
    if (typeof v !== "string" || allowed.indexOf(v) < 0) { errors.push(name + " must be one of " + allowed.join("|")); return allowed[0]; }
    return v;
  }

  private static accessNum(v: any, lo: number, hi: number, name: string, errors: string[]): number {
    if (typeof v !== "number" || !isFinite(v) || Math.floor(v) !== v || v < lo || v > hi) {
      errors.push(name + " must be an integer in " + lo + "-" + hi);
      return lo;
    }
    return v;
  }

  /** Optional list of access numbers: integers in [lo,hi] or in the dynamic page-fault range 200-299, at most `max` entries. */
  private static accessList(v: any, max: number, lo: number, hi: number, name: string, errors: string[], warnings: string[]): number[] {
    const out: number[] = [];
    if (v === undefined) { warnings.push(name + " missing, using []"); return out; }
    if (!Array.isArray(v) || v.length > max) { errors.push(name + " must be an array of 0-" + max + " entries"); return out; }
    for (let i = 0; i < v.length; i++) {
      const n = v[i];
      const ok = typeof n === "number" && isFinite(n) && Math.floor(n) === n && ((n >= lo && n <= hi) || (n >= 200 && n <= 299));
      if (!ok) { errors.push(name + "[" + i + "] must be an integer in " + lo + "-" + hi + " or 200-299"); continue; }
      if (out.indexOf(n) < 0) out.push(n);
    }
    return out;
  }

  private static sanitizeBlueprint(bp: any, errors: string[], warnings: string[]): any {
    if (!bp || typeof bp !== "object") { errors.push("blueprint is not an object"); return {}; }
    const o: any = {};
    const E = errors, W = warnings;
    // found flag: false = "not a real dish" -> hard error (callers show the not-found message), nothing else is validated
    if (bp.found === false) {
      E.push("found is false: " + ProposalGate.notFoundText(bp));
      return { found: false, notFoundMessage: ProposalGate.notFoundText(bp) };
    }
    if (bp.found !== true) W.push("found missing, treated as true");
    o.found = true;
    o.notFoundMessage = ProposalGate.notFoundText(bp);
    const id = ProposalGate.text(bp.dishId, 48, "dishId", E, W);
    if (id && !/^[A-Za-z0-9_\-]+$/.test(id)) E.push("dishId may only contain letters, digits, _ and -");
    o.dishId = id;
    o.dishTitle = ProposalGate.text(bp.dishTitle, 32, "dishTitle", E, W);
    o.cuisineTag = ProposalGate.text(bp.cuisineTag, 24, "cuisineTag", E, W);
    o.prepDurationSec = ProposalGate.num(bp.prepDurationSec, 5, 900, "prepDurationSec", E, W);
    o.searDurationSec = ProposalGate.num(bp.searDurationSec, 10, 600, "searDurationSec", E, W);
    o.sauceDurationSec = ProposalGate.num(bp.sauceDurationSec, 10, 600, "sauceDurationSec", E, W);
    o.cutSpacingCm = ProposalGate.num(bp.cutSpacingCm, 0.4, 2.0, "cutSpacingCm", E, W);
    const ang = ProposalGate.num(bp.cutAngleDeg, 0, 90, "cutAngleDeg", E, W);
    o.cutAngleDeg = ang >= 22.5 ? 45 : 0;
    if (ang !== 0 && ang !== 45) W.push("cutAngleDeg " + ang + " snapped to " + o.cutAngleDeg);
    o.cutLabel = ProposalGate.text(bp.cutLabel, 28, "cutLabel", E, W);

    // prep slots (exactly 5) and the matching ingredient access numbers
    const slots: any[] = [];
    if (!Array.isArray(bp.prepSlots) || bp.prepSlots.length !== 5) {
      E.push("prepSlots must contain exactly 5 entries");
    } else {
      const ARCH = PREP_ARCHETYPE_LIST;
      for (let i = 0; i < 5; i++) {
        const s = bp.prepSlots[i] || {};
        const n = "prepSlots[" + i + "]";
        const e: any = {
          accessNumber: ProposalGate.accessNum(s.accessNumber, 101, 299, n + ".accessNumber", E),
          name: ProposalGate.text(s.name, 28, n + ".name", E, W),
          archetype: ProposalGate.oneOf(s.archetype, ARCH, n + ".archetype", E),
          colorRgb: ProposalGate.rgb(s.colorRgb, n + ".colorRgb", E, W),
          scaleMultiplier: ProposalGate.num(s.scaleMultiplier, 0.5, 1.6, n + ".scaleMultiplier", E, W, 1.0),
        };
        if (Array.isArray(s.stemColorRgb) && s.stemColorRgb.length === 3) {
          const tmp: string[] = [];
          const c = ProposalGate.rgb(s.stemColorRgb, n + ".stemColorRgb", tmp, W);
          if (tmp.length === 0) e.stemColorRgb = c;
        }
        slots.push(e);
      }
    }
    o.prepSlots = slots;
    if (slots.length === 5) {
      const fromSlots = slots.map((x: any) => x.accessNumber);
      const given = bp.ingredientAccessNumbers;
      let same = Array.isArray(given) && given.length === 5;
      for (let i = 0; same && i < 5; i++) if (given[i] !== fromSlots[i]) same = false;
      if (!same) W.push("ingredientAccessNumbers rebuilt from prepSlots");
      o.ingredientAccessNumbers = fromSlots;
    } else {
      o.ingredientAccessNumbers = [];
    }

    // starches (#116-#121 or #200+) and spices/dairy/oils/legumes (#160-#166 or #200+), both optional lists
    o.starchAccessNumbers = ProposalGate.accessList(bp.starchAccessNumbers, 2, 116, 121, "starchAccessNumbers", E, W);
    o.spiceAccessNumbers = ProposalGate.accessList(bp.spiceAccessNumbers, 4, 160, 166, "spiceAccessNumbers", E, W);

    // vessels / service ware and tools (#301-#355)
    const vs: number[] = [];
    if (!Array.isArray(bp.vesselAccessNumbers) || bp.vesselAccessNumbers.length < 1 || bp.vesselAccessNumbers.length > 12) {
      E.push("vesselAccessNumbers must contain 1-12 entries");
    } else {
      for (let i = 0; i < bp.vesselAccessNumbers.length; i++) {
        const n = ProposalGate.accessNum(bp.vesselAccessNumbers[i], 301, 355, "vesselAccessNumbers[" + i + "]", E);
        if (vs.indexOf(n) < 0) vs.push(n);
      }
    }
    o.vesselAccessNumbers = vs;
    const ts: number[] = [];
    if (bp.toolAccessNumbers === undefined) {
      W.push("toolAccessNumbers missing, using []");
    } else if (!Array.isArray(bp.toolAccessNumbers) || bp.toolAccessNumbers.length > 12) {
      E.push("toolAccessNumbers must contain 0-12 entries");
    } else {
      for (let i = 0; i < bp.toolAccessNumbers.length; i++) {
        const n = ProposalGate.accessNum(bp.toolAccessNumbers[i], 301, 355, "toolAccessNumbers[" + i + "]", E);
        if (ts.indexOf(n) < 0 && vs.indexOf(n) < 0) ts.push(n);
      }
    }
    o.toolAccessNumbers = ts;

    // protein
    const p = bp.protein;
    if (!p || typeof p !== "object") {
      E.push("protein missing");
      o.protein = {};
    } else {
      o.protein = {
        accessNumber: ProposalGate.accessNum(p.accessNumber, 110, 299, "protein.accessNumber", E),
        name: ProposalGate.text(p.name, 32, "protein.name", E, W),
        archetype: ProposalGate.oneOf(p.archetype, PROTEIN_ARCHETYPE_LIST, "protein.archetype", E),
        primaryKine: ProposalGate.oneOf(p.primaryKine, PRIMARY_KINE_LIST, "protein.primaryKine", E),
        lengthCm: ProposalGate.num(p.lengthCm, 2, 14, "protein.lengthCm", E, W),
        widthCm: ProposalGate.num(p.widthCm, 2, 10, "protein.widthCm", E, W),
        heightCm: ProposalGate.num(p.heightCm, 0.8, 5, "protein.heightCm", E, W),
        rawTopRgb: ProposalGate.rgb(p.rawTopRgb, "protein.rawTopRgb", E, W),
        searedCrustRgb: ProposalGate.rgb(p.searedCrustRgb, "protein.searedCrustRgb", E, W),
        flipCalloutText: ProposalGate.text(p.flipCalloutText, 24, "protein.flipCalloutText", E, W),
      };
    }

    // sauce
    const sc = bp.sauce;
    if (!sc || typeof sc !== "object") {
      E.push("sauce missing");
      o.sauce = {};
    } else {
      if (typeof sc.useLadleStir !== "boolean") E.push("sauce.useLadleStir must be a boolean");
      o.sauce = {
        name: ProposalGate.text(sc.name, 40, "sauce.name", E, W),
        vesselAccessNumber: ProposalGate.accessNum(sc.vesselAccessNumber, 301, 355, "sauce.vesselAccessNumber", E),
        baseLiquidRgb: ProposalGate.rgb(sc.baseLiquidRgb, "sauce.baseLiquidRgb", E, W),
        reducedSauceRgb: ProposalGate.rgb(sc.reducedSauceRgb, "sauce.reducedSauceRgb", E, W),
        useLadleStir: sc.useLadleStir === true,
      };
    }

    // cookbook cards (exactly 4, fixed station order)
    const STATIONS = ["PREP", "SKILLET", "SAUCEPOT", "PLATING"];
    const cards: any[] = [];
    if (!Array.isArray(bp.cookbookCards) || bp.cookbookCards.length !== 4) {
      E.push("cookbookCards must contain exactly 4 entries");
    } else {
      for (let i = 0; i < 4; i++) {
        const c = bp.cookbookCards[i] || {};
        const n = "cookbookCards[" + i + "]";
        if (c.stationFocus !== STATIONS[i]) W.push(n + ".stationFocus forced to " + STATIONS[i]);
        cards.push({
          stepNumber: i + 1,
          stationFocus: STATIONS[i],
          headline: ProposalGate.text(c.headline, 28, n + ".headline", E, W),
          instruction: ProposalGate.text(c.instruction, 75, n + ".instruction", E, W),
          masteryWhy: ProposalGate.text(c.masteryWhy, 65, n + ".masteryWhy", E, W),
        });
      }
    }
    o.cookbookCards = cards;

    // steps (4-9): the dish's own cook flow
    const steps: any[] = [];
    if (!Array.isArray(bp.steps) || bp.steps.length < 4 || bp.steps.length > 9) {
      E.push("steps must contain 4-9 entries");
    } else {
      const seen: { [id: string]: boolean } = {};
      for (let i = 0; i < bp.steps.length; i++) {
        const st = bp.steps[i] || {};
        const n = "steps[" + i + "]";
        const sid = ProposalGate.text(st.id, 24, n + ".id", E, W);
        if (sid && !/^[a-z0-9_]+$/.test(sid)) E.push(n + ".id may only contain a-z, 0-9 and _");
        if (sid && seen[sid]) E.push(n + ".id duplicates an earlier step");
        seen[sid] = true;
        steps.push({
          id: sid,
          station: ProposalGate.oneOf(st.station, STATION_LIST, n + ".station", E),
          kinematic: ProposalGate.oneOf(st.kinematic, KINEMATIC_ID_LIST, n + ".kinematic", E),
          durationSec: ProposalGate.num(st.durationSec, 1, 600, n + ".durationSec", E, W),
          title: ProposalGate.text(st.title, 28, n + ".title", E, W),
          whatWhy: ProposalGate.text(st.whatWhy, 90, n + ".whatWhy", E, W),
        });
      }
    }
    o.steps = steps;

    o.visionPromptContext = ProposalGate.text(bp.visionPromptContext, 200, "visionPromptContext", E, W);
    o.skilletPillVerb = ProposalGate.text(bp.skilletPillVerb, 8, "skilletPillVerb", E, W).toUpperCase();
    o.saucePillVerb = ProposalGate.text(bp.saucePillVerb, 8, "saucePillVerb", E, W).toUpperCase();
    return o;
  }
}
