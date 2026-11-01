/**
 * ProposalGate.ts — Grandmaster Edition
 * Deterministic Safety & Policy Gate for AI Vision Proposals on Snap Spectacles.
 *
 * Core Principle: The AI is a sensor proposing adjustments; the deterministic gate decides.
 * No LLM can hallucinate schedule corruption or pause a pan on live heat.
 */

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
  private static readonly CONFIDENCE_FLOOR = 0.55;
  private static readonly HIGH_CONFIDENCE_THRESHOLD = 0.80;
  private static readonly AUTO_APPLY_MAX_EXTENSION_SEC = 30.0;

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
        effectiveDeltaSeconds: Math.max(-20, proposal.proposedDeltaSeconds),
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
        autoApplyCountdownSec: 3.0,
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
      const clampedDelta = Math.min(60, proposal.proposedDeltaSeconds);
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
}
