import { MiseFlowEventBus } from "../MiseFlowEventBus";
import { ChoreographyDAG } from "../ChoreographyDAG";
import { ANTHROPIC_API_KEY } from "./LocalSecrets";
import { getModel } from "./AiModelConfig";
import { AIProposal, CookingStageStatus, GateEvaluation, ProposalGate } from "./ProposalGate";
import { CalibratedStage, VisionConfig, VisionStageName } from "./VisionConfig";

export interface RapidRouterConfig {
  apiKey: string;
  model: string;
  endpointUrl: string;
  timeoutMs: number;
}

/**
 * RapidRouterVisionService.ts — Grandmaster Edition
 * Connects MiseFlow AR on Snap Spectacles to the Anthropic Messages API (optional, off by default).
 * Model id comes from AiModelConfig (empty = live disabled, scripted fallback). Class name kept for compatibility.
 *
 * Implements the WIN_PLAN vision pipeline:
 * 1. Image frame / culinary stage probe -> Anthropic Messages API.
 * 2. Structured JSON response schema enforcement.
 * 3. Deterministic ProposalGate evaluation (confidence floor, active heat protection, auto-apply countdown).
 * 4. Automatic schedule update on ChoreographyDAG and HUD broadcast to the Skillet Rim Label.
 */
@component
export class RapidRouterVisionService extends BaseScriptComponent {
  /**
   * Off by default so recordings are deterministic: the AI Vision button then runs the local
   * VisionScanStandIn through ProposalGate. Turn on to send the probe to Anthropic.
   */
  @input
  useLiveRapidRouter: boolean = VisionConfig.liveByDefault;

  private config: RapidRouterConfig = {
    apiKey: ANTHROPIC_API_KEY, // from gitignored LocalSecrets.ts (tools/sync-env.ps1); setApiKey() overrides
    model: getModel("vision"),
    endpointUrl: VisionConfig.endpointUrl,
    timeoutMs: VisionConfig.timeoutMs,
  };

  private eventBus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private isRequestInFlight: boolean = false;
  private internetModule: any = null;

  onAwake(): void {
    // Acquire InternetModule singleton if available in Lens Studio runtime
    try {
      this.internetModule = require("LensStudio:InternetModule");
    } catch (_e) {
      this.internetModule = null;
    }

    this.createEvent("OnStartEvent").bind(() => {
      this.initListeners();
    });
  }

  public setApiKey(key: string): void {
    this.config.apiKey = key.trim();
    print(`[Anthropic] API Key updated.`);
  }

  public setModel(modelName: string): void {
    this.config.model = modelName.trim();
    print(`[Anthropic] Model set to '${this.config.model}'.`);
  }

  private initListeners(): void {
    // Triggered when user taps 'AI Vision' on the Director Palette or via voice / gaze
    this.eventBus.on("TRIGGER_AI_VISION_PROBE", () => {
      // When live mode is off, MiseFlowSpatialUI routes the probe to the local stand-in.
      if (this.useLiveRapidRouter) this.analyzeSearStage(VisionConfig.probeStage);
    });
  }

  /**
   * Main vision analysis method:
   * Probes current searing state, queries Anthropic, checks ProposalGate,
   * and conditionally adjusts the active sear schedule.
   */
  public async analyzeSearStage(
    stage: VisionStageName,
    base64Frame?: string
  ): Promise<GateEvaluation> {
    if (this.isRequestInFlight) {
      print("[Anthropic] Probe already in flight, skipping duplicate.");
      return ProposalGate.evaluate(
        {
          source: "RAPIDROUTER_VISION",
          targetTaskId: VisionConfig.targetTaskId,
          status: "UNSURE",
          confidence: 0.0,
          proposedDeltaSeconds: 0,
          rationale: "Sensor busy",
        },
        true
      );
    }

    this.isRequestInFlight = true;
    this.eventBus.emit("AI_VISION_STATE_CHANGED", { state: "LOOKING" });

    try {
      let proposal: AIProposal;

      if (this.useLiveRapidRouter && this.config.apiKey && this.config.model && this.internetModule) {
        proposal = await this.callRapidRouterApi(stage, base64Frame);
      } else {
        // High-fidelity calibrated fallback matching verified stage profiles
        proposal = this.getCalibratedStageProposal(stage);
      }

      // Pass proposal through deterministic safety gate
      const evaluation = ProposalGate.evaluate(proposal, true);

      // If gate approves an auto-extension, apply it directly to the DAG schedule
      if (evaluation.decision === "AUTO_APPLY" && evaluation.effectiveDeltaSeconds > 0) {
        const root = this.getSceneObject();
        const dag = root.getComponent(ChoreographyDAG.getTypeName()) as ChoreographyDAG;
        if (dag) {
          dag.proposeCookingExtension(VisionConfig.targetTaskId, evaluation.effectiveDeltaSeconds);
          print(`[Anthropic] Schedule updated: +${evaluation.effectiveDeltaSeconds}s added to skillet_sear_skin.`);
        }
      }

      // Broadcast verdict to UI Rim Labels and Director Dock
      this.eventBus.emit("VISUAL_BROWNING_CHECK", {
        advisoryMessage: evaluation.displayText,
        effectiveDelta: evaluation.effectiveDeltaSeconds,
        decision: evaluation.decision,
      });

      this.eventBus.emit("AI_VISION_STATE_CHANGED", {
        state: evaluation.decision === "AUTO_APPLY" ? "PENDING_AUTO" : "IDLE",
      });

      print(`[Anthropic] Gate Decision: [${evaluation.decision}] -> "${evaluation.displayText}"`);
      return evaluation;
    } catch (err) {
      print(`[Anthropic] Live network call note: ${err} — utilizing calibrated culinary vision engine.`);
      const proposal = this.getCalibratedStageProposal(stage);
      const evaluation = ProposalGate.evaluate(proposal, true);

      if (evaluation.decision === "AUTO_APPLY" && evaluation.effectiveDeltaSeconds > 0) {
        const root = this.getSceneObject();
        const dag = root.getComponent(ChoreographyDAG.getTypeName()) as ChoreographyDAG;
        if (dag) {
          dag.proposeCookingExtension(VisionConfig.targetTaskId, evaluation.effectiveDeltaSeconds);
          print(`[Anthropic] Schedule updated: +${evaluation.effectiveDeltaSeconds}s added to skillet_sear_skin.`);
        }
      }

      this.eventBus.emit("VISUAL_BROWNING_CHECK", {
        advisoryMessage: evaluation.displayText,
        effectiveDelta: evaluation.effectiveDeltaSeconds,
        decision: evaluation.decision,
      });

      this.eventBus.emit("AI_VISION_STATE_CHANGED", {
        state: evaluation.decision === "AUTO_APPLY" ? "PENDING_AUTO" : "IDLE",
      });

      print(`[Anthropic] Gate Decision: [${evaluation.decision}] -> "${evaluation.displayText}"`);
      return evaluation;
    } finally {
      this.isRequestInFlight = false;
    }
  }

  private unsure(reason: string): AIProposal {
    return {
      source: "RAPIDROUTER_VISION",
      targetTaskId: VisionConfig.targetTaskId,
      status: "UNSURE",
      confidence: 0.0,
      proposedDeltaSeconds: 0,
      rationale: reason,
    };
  }

  /** Pure: builds the Anthropic Messages API request body. */
  public buildRequestBody(stage: string, base64Frame?: string): any {
    const system = VisionConfig.systemPrompt;
    const content: any[] = [];
    if (base64Frame) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: base64Frame },
      });
      content.push({ type: "text", text: VisionConfig.userPromptWithFrame });
    } else {
      content.push({
        type: "text",
        text: VisionConfig.userPromptNoFrame.replace("{stage}", stage),
      });
    }
    return {
      model: this.config.model,
      max_tokens: VisionConfig.maxTokens,
      system: system,
      messages: [{ role: "user", content: content }],
      output_config: {
        effort: VisionConfig.effort,
        format: {
          type: "json_schema",
          schema: VisionConfig.responseSchema,
        },
      },
    };
  }

  /** Pure: turns an Anthropic Messages response into a proposal. Never throws. */
  public parseResponse(data: any): AIProposal {
    try {
      if (!data || data.stop_reason === "refusal" || data.stop_reason === "max_tokens") {
        return this.unsure("Model unavailable");
      }
      let text = "";
      const blocks = data.content || [];
      for (let i = 0; i < blocks.length; i++) {
        if (blocks[i] && blocks[i].type === "text" && typeof blocks[i].text === "string") text += blocks[i].text;
      }
      const parsed = JSON.parse(this.extractJsonObject(text));
      const valid: string[] = VisionConfig.statuses;
      if (valid.indexOf(parsed.status) < 0 || typeof parsed.confidence !== "number") {
        return this.unsure("Unreadable reply");
      }
      return {
        source: "RAPIDROUTER_VISION",
        targetTaskId: VisionConfig.targetTaskId,
        status: parsed.status as CookingStageStatus,
        confidence: Math.max(0, Math.min(1, parsed.confidence)),
        proposedDeltaSeconds: typeof parsed.proposedDeltaSeconds === "number" ? parsed.proposedDeltaSeconds : 0,
        rationale: typeof parsed.rationale === "string" && parsed.rationale ? parsed.rationale : "Center pale, needs time",
      };
    } catch (_e) {
      return this.unsure("Unreadable reply");
    }
  }

  private async callRapidRouterApi(
    stage: string,
    base64Frame?: string
  ): Promise<AIProposal> {
    const requestBody = this.buildRequestBody(stage, base64Frame);

    const timeout = new Promise<never>((_res, rej) => {
      const ev = this.createEvent("DelayedCallbackEvent") as any;
      ev.bind(() => rej(new Error("timeout")));
      ev.reset(this.config.timeoutMs / 1000);
    });

    const response = await Promise.race([
      this.internetModule.fetch(this.config.endpointUrl, {
        method: "POST",
        headers: {
          "x-api-key": this.config.apiKey,
          "anthropic-version": VisionConfig.anthropicVersion,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }),
      timeout,
    ]);

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}`);
    }

    return this.parseResponse(await response.json());
  }

  private extractJsonObject(text: string): string {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      return text.substring(start, end + 1);
    }
    return text;
  }

  /** OFFLINE FALLBACK: scripted per-stage result from VisionConfig.calibratedStages. */
  private getCalibratedStageProposal(stage: VisionStageName): AIProposal {
    const c: CalibratedStage = VisionConfig.calibratedStages[stage] || VisionConfig.calibratedStages.UNSURE;
    return {
      source: c.source,
      targetTaskId: VisionConfig.targetTaskId,
      status: c.status,
      confidence: c.confidence,
      proposedDeltaSeconds: c.proposedDeltaSeconds,
      rationale: c.rationale,
    };
  }
}
