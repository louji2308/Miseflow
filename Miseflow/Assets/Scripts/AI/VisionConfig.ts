/**
 * VisionConfig.ts
 * Single source of truth for the AI Vision button path (VisionScanStandIn, RapidRouterVisionService,
 * ProposalGate and the AI Vision handler in MiseFlowSpatialUI). Change tuning here, not in those files.
 *
 * DEFAULT IS LOCAL AND DETERMINISTIC. `liveByDefault` is false, so the AI Vision button runs the
 * scripted stand-in (`offlineScans`) through the real ProposalGate with no network. The live
 * Anthropic call only runs when `useLiveRapidRouter` is switched on in the editor, and even then
 * any failure falls back to the scripted values below.
 *
 * OFFLINE FALLBACK: `offlineScans` and `calibratedStages` are scripted values. They are used ONLY
 * when the live call is disabled or fails. Do not delete them: the LEAF scenarios
 * (ProposalGateRejectionScenario, SpatulaFlipGuideScenario) and the recording depend on them.
 */

import { getModel } from "./AiModelConfig";

export type VisionScanId = "EXTEND_SEAR" | "OPTIMAL_CRUST" | "STEAM_OCCLUDED";
export type VisionStageName = "RAW" | "GOLDEN" | "CRISP" | "UNSURE";
export type VisionStatus = "UNDER" | "OPTIMAL" | "OVER" | "AT_RISK" | "UNSURE";

/** One scripted offline state. Used by VisionScanStandIn when the AI Vision button is pressed. */
export interface ScanScript {
  id: VisionScanId;
  status: VisionStatus;
  confidence: number;
  proposedDeltaSeconds: number;
  rationale: string;
  // Salmon look while this state is shown (flesh, skin) - linear RGB
  flesh: [number, number, number];
  skin: [number, number, number];
}

/** One scripted checkpoint result used by RapidRouterVisionService when the live call is unavailable. */
export interface CalibratedStage {
  source: "RAPIDROUTER_VISION" | "CHECKPOINT_AUTO";
  status: VisionStatus;
  confidence: number;
  proposedDeltaSeconds: number;
  rationale: string;
}

export interface VisionConfigType {
  // ── live Anthropic Messages API ──
  /** Anthropic model id, read from AiModelConfig ("" = not configured: live vision stays off). */
  model: string;
  /** Anthropic Messages API endpoint. */
  endpointUrl: string;
  /** Value of the `anthropic-version` request header. */
  anthropicVersion: string;
  /** Hard cap on response tokens. */
  maxTokens: number;
  /** Abort the live call after this many milliseconds and fall back to the scripted result. */
  timeoutMs: number;
  /** `output_config.effort` for the request. */
  effort: string;
  /** Whether the live call is on by default (the editor input `useLiveRapidRouter` overrides it). Keep false for recordings. */
  liveByDefault: boolean;
  /** Stage passed to analyzeSearStage when the AI Vision button probes the sear. */
  probeStage: VisionStageName;
  /** Task id that every AI proposal targets (the skillet sear timer). */
  targetTaskId: string;
  /** Allowed `status` values. Used for the JSON schema enum and to validate replies. */
  statuses: VisionStatus[];

  // ── prompts (user prompt without a frame: `{stage}` is replaced at request time) ──
  systemPrompt: string;
  userPromptWithFrame: string;
  userPromptNoFrame: string;

  /** JSON schema enforced on the model reply (`output_config.format.schema`). */
  responseSchema: any;

  // ── ProposalGate safety thresholds ──
  /** Proposals below this confidence are REJECTED. */
  confidenceFloor: number;
  /** Confidence at or above which a small UNDER extension may AUTO_APPLY. */
  highConfidenceThreshold: number;
  /** Largest extension (seconds) that may AUTO_APPLY. Larger extensions need cook confirmation. */
  autoApplyMaxExtensionSec: number;
  /** Cancel window (seconds) shown on an AUTO_APPLY decision. */
  autoApplyCountdownSec: number;
  /** Cap (seconds) on a large extension shown in the confirm prompt. */
  largeExtensionCapSec: number;
  /** Lower bound (seconds, negative) on a shortening proposal while the burner is active. */
  activeHeatShortenCapSec: number;

  // ── UI timing ──
  /** How long the AI Vision probe shows the LOOKING state before the live verdict is applied (seconds). */
  hudLookingDelaySec: number;

  // ── scripted offline fallback ──
  /** Scripted states, cycled in this order by the AI Vision button (VisionScanStandIn). Offline default. */
  offlineScans: ScanScript[];
  /** Scripted per-stage results used by RapidRouterVisionService when the live call is off or fails. */
  calibratedStages: { [stage: string]: CalibratedStage };
}

const STATUSES: VisionStatus[] = ["UNDER", "OPTIMAL", "OVER", "AT_RISK", "UNSURE"];

export const VisionConfig: VisionConfigType = {
  model: getModel("vision"),
  endpointUrl: "https://api.anthropic.com/v1/messages",
  anthropicVersion: "2023-06-01",
  maxTokens: 600,
  timeoutMs: 8000,
  effort: "medium",
  liveByDefault: false,
  probeStage: "GOLDEN",
  targetTaskId: "skillet_sear_skin",
  statuses: STATUSES,

  systemPrompt: `You are MiseFlow AI, a computer vision cooking sensor for Snap Spectacles.
Analyze the salmon fillet searing in the skillet and report its sear state. Keep rationale to 6 words maximum.`,
  userPromptWithFrame: "Inspect skillet camera frame for Maillard reaction and skin crisping.",
  userPromptNoFrame:
    "The salmon skin is golden around the edges but center is still pale, sizzling steadily. Stage: {stage}. Checkpoint is at 40 seconds into the sear.",

  responseSchema: {
    type: "object",
    properties: {
      status: { type: "string", enum: STATUSES },
      confidence: { type: "number" },
      proposedDeltaSeconds: { type: "integer" },
      rationale: { type: "string" },
    },
    required: ["status", "confidence", "proposedDeltaSeconds", "rationale"],
    additionalProperties: false,
  },

  confidenceFloor: 0.55,
  highConfidenceThreshold: 0.8,
  autoApplyMaxExtensionSec: 30.0,
  autoApplyCountdownSec: 3.0,
  largeExtensionCapSec: 60,
  activeHeatShortenCapSec: -20,

  hudLookingDelaySec: 1.2,

  // OFFLINE FALLBACK (scripted, deterministic). Cycled by the AI Vision button.
  offlineScans: [
    {
      id: "EXTEND_SEAR",
      status: "UNDER",
      confidence: 0.89,
      proposedDeltaSeconds: 15,
      rationale: "Centre pale, skin soft",
      flesh: [1.0, 0.55, 0.5],
      skin: [0.95, 0.72, 0.42],
    },
    {
      id: "OPTIMAL_CRUST",
      status: "OPTIMAL",
      confidence: 0.94,
      proposedDeltaSeconds: 0,
      rationale: "Even golden crust",
      flesh: [1.0, 0.45, 0.3],
      skin: [0.8, 0.42, 0.1],
    },
    {
      id: "STEAM_OCCLUDED",
      status: "UNDER",
      confidence: 0.41,
      proposedDeltaSeconds: 20,
      rationale: "Steam hides the skin",
      flesh: [0.82, 0.74, 0.74],
      skin: [0.8, 0.76, 0.72],
    },
  ],

  // OFFLINE FALLBACK (scripted, deterministic). Used when the live call is off or fails.
  calibratedStages: {
    RAW: {
      source: "CHECKPOINT_AUTO",
      status: "UNDER",
      confidence: 0.92,
      proposedDeltaSeconds: 30,
      rationale: "Flesh pale. Needs +30s",
    },
    GOLDEN: {
      source: "RAPIDROUTER_VISION",
      status: "UNDER",
      confidence: 0.85,
      proposedDeltaSeconds: 15,
      rationale: "Center pale, needs more time",
    },
    CRISP: {
      source: "RAPIDROUTER_VISION",
      status: "OPTIMAL",
      confidence: 0.95,
      proposedDeltaSeconds: 0,
      rationale: "Sear optimal. Flip now",
    },
    UNSURE: {
      source: "RAPIDROUTER_VISION",
      status: "UNSURE",
      confidence: 0.42,
      proposedDeltaSeconds: 0,
      rationale: "Steam obscuring view",
    },
  },
};
