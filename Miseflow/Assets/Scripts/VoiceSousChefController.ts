import { MiseFlowEventBus } from "./MiseFlowEventBus";
import { matchByKeyword } from "./AI/DishLibraryConfig";
import { isLiveEnabled } from "./AI/AiModelConfig";

const DISH_PHRASE = /\b(?:prepare|cook|make)\s+(?:me\s+|us\s+|a\s+|an\s+|the\s+|some\s+)*(.+)$/i;
const SILENCE_MS = 1500;
const RETRY_DELAY_SEC = 6.0;
const MAX_RETRIES = 1;

/**
 * VoiceSousChefController.ts  (v5 Part 3, implementation_plan Stage 1)
 * Shell around LensStudio:AsrModule: listens for "Chef, prepare / cook / make <dish>" and emits
 * DISH_COMPILE_REQUESTED { query, source: "VOICE" }. Preset dishes resolve offline via
 * DishLibraryConfig.matchByKeyword; an unknown dish is forwarded to the RecipeCompilerService only when the
 * live (Anthropic) compiler is configured in AiModelConfig. No other speech/AI provider.
 * In the Lens Studio preview (or wherever AsrModule is missing) it stays idle. Never throws.
 */
@component
export class VoiceSousChefController extends BaseScriptComponent {
  /** Master switch for voice dish requests. */
  @input
  enableVoice: boolean = true;

  private eventBus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private asr: any = null;
  private listening: boolean = false;
  private stopped: boolean = false;
  private lastQuery: string = "";
  private retries: number = 0;
  private capturing: boolean = false;

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.init());
    this.createEvent("OnDestroyEvent").bind(() => this.stop());
  }

  /** Feeds one transcript through the dish matcher (also used by tests / other input paths). */
  public handleTranscript(text: string): boolean {
    try {
      if (typeof text !== "string") return false;
      const m = DISH_PHRASE.exec(text.trim());
      if (!m || !m[1]) return false;
      const query = m[1].replace(/[.!?,]+$/g, "").trim();
      if (query.length === 0) return false;
      const idx = matchByKeyword(query);
      if (idx < 0 && !isLiveEnabled("compiler")) {
        print(`[VoiceSousChef] "${query}" is not in the prebuilt library and the live compiler is off`);
        return false;
      }
      this.lastQuery = query;
      print(`[VoiceSousChef] dish request: "${query}"${idx >= 0 ? ` -> preset ${idx}` : " -> live compiler"}`);
      this.eventBus.emit("DISH_COMPILE_REQUESTED", { query: query, source: "VOICE" });
      return true;
    } catch (e) {
      print(`[VoiceSousChef] transcript error: ${e}`);
      return false;
    }
  }

  public getLastQuery(): string {
    return this.lastQuery;
  }

  /**
   * P5 Dish Studio "Speak": one-shot transcription (the ambient "Chef, prepare X" listener is paused).
   * Returns false when AsrModule is unavailable (Lens Studio preview): the studio then shows a notice.
   */
  public captureOnce(onFinal: (text: string) => void, onPartial?: (text: string) => void, onError?: (msg: string) => void): boolean {
    try {
      const sys: any = (global as any).deviceInfoSystem;
      if (sys && typeof sys.isEditor === "function" && sys.isEditor()) return false;
      if (!this.asr) this.asr = require("LensStudio:AsrModule");
      if (!this.asr || typeof this.asr.startTranscribing !== "function" || typeof AsrModule === "undefined") return false;
      if (this.listening && typeof this.asr.stopTranscribing === "function") this.asr.stopTranscribing();
      this.listening = false;
      const opts = AsrModule.AsrTranscriptionOptions.create();
      opts.silenceUntilTerminationMs = SILENCE_MS;
      opts.mode = AsrModule.AsrMode.HighAccuracy;
      opts.onTranscriptionUpdateEvent.add((ev: any) => {
        const t = String((ev && ev.text) || "").trim();
        if (ev && ev.isFinal) {
          this.stopCapture();
          if (t.length > 0) onFinal(t);
          else if (onError) onError("No speech heard");
        } else if (onPartial && t.length > 0) onPartial(t);
      });
      opts.onTranscriptionErrorEvent.add((code: any) => {
        this.stopCapture();
        if (onError) onError(`Voice input error (${code})`);
      });
      this.asr.startTranscribing(opts);
      this.capturing = true;
      return true;
    } catch (e) {
      print(`[VoiceSousChef] capture failed: ${e}`);
      this.capturing = false;
      return false;
    }
  }

  /** Stops a one-shot capture (studio Cancel / close, and always before any vision capture). */
  public stopCapture(): void {
    if (!this.capturing) return;
    this.capturing = false;
    try {
      if (this.asr && typeof this.asr.stopTranscribing === "function") this.asr.stopTranscribing();
    } catch (_e) {
      // already stopped
    }
  }

  private init(): void {
    if (!this.enableVoice) return;
    try {
      const sys: any = (global as any).deviceInfoSystem;
      if (sys && typeof sys.isEditor === "function" && sys.isEditor()) {
        print("[VoiceSousChef] preview: voice idle (use the AI Dish button)");
        return;
      }
      this.asr = require("LensStudio:AsrModule");
    } catch (_e) {
      this.asr = null;
    }
    if (!this.asr || typeof this.asr.startTranscribing !== "function" || typeof AsrModule === "undefined") {
      print("[VoiceSousChef] AsrModule unavailable: voice idle");
      this.asr = null;
      return;
    }
    this.start();
  }

  private start(): void {
    if (!this.asr || this.listening || this.stopped) return;
    try {
      const opts = AsrModule.AsrTranscriptionOptions.create();
      opts.silenceUntilTerminationMs = SILENCE_MS;
      opts.mode = AsrModule.AsrMode.HighAccuracy;
      opts.onTranscriptionUpdateEvent.add((ev: any) => {
        if (ev && ev.isFinal) this.handleTranscript(String(ev.text || ""));
      });
      opts.onTranscriptionErrorEvent.add((code: any) => {
        print(`[VoiceSousChef] ASR status ${code}: voice idle`);
        this.listening = false;
        this.stop();
      });
      this.asr.startTranscribing(opts);
      this.listening = true;
      print("[VoiceSousChef] listening for \"Chef, prepare <dish>\"");
    } catch (e) {
      this.listening = false;
      print(`[VoiceSousChef] ASR start failed (${e}): voice idle`);
      this.retryLater();
    }
  }

  private retryLater(): void {
    if (this.stopped || !this.asr || this.retries >= MAX_RETRIES) return;
    this.retries++;
    try {
      const ev = this.createEvent("DelayedCallbackEvent") as any;
      ev.bind(() => this.start());
      ev.reset(RETRY_DELAY_SEC);
    } catch (_e) {
      // no retry available
    }
  }

  private stop(): void {
    this.stopped = true;
    if (!this.asr) return;
    try {
      if (this.listening && typeof this.asr.stopTranscribing === "function") this.asr.stopTranscribing();
    } catch (_e) {
      // already stopped
    }
    this.listening = false;
  }
}
