import { MiseFlowEventBus } from "../MiseFlowEventBus";
import { getApiKey, getEffort, getModel, isLiveEnabled } from "../AI/AiModelConfig";
import { CookPlanJsonSchema, NOT_FOUND_TEXT } from "./CookPlanSchema";
import type { CookPlan } from "./CookPlanSchema";
import { CookEvents } from "./CookWorld";
import { sanitizeCookPlan } from "./CookPlanSanitizer";
import { lookupPlan } from "./PlanLibrary";

const ENDPOINT_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DIRECTOR_TIMEOUT_MS = 180000; // Opus 5.5 at high effort: ~33 s from a command line, 1-2 min inside Lens
const DIRECTOR_MAX_TOKENS = 10000; // Opus writes longer plans (a masala dosa plan hit 4000 and was cut off)

// PROMPT-BEGIN (the node replay harness slices between these markers; keep it a single array-join expression)
export const DIRECTOR_PROMPT: string = [
  "You are the MiseFlow Chef Director for an AR cooking coach. Turn the user's dish request into ONE CookPlan JSON object describing how a real cook would make it, step by step, with only the equipment, tools and ingredients that dish truly needs.",
  "NOT A DISH: if the request is not a real cookable dish, return found=false, notFoundMessage=\"Dish not found. Enter the correct dish name.\" and empty arrays/empty strings/0 for everything else.",
  "REALISM: model the dish the way it is really cooked. Deep-fried dishes use a kadai/wok with oil and a skimmer, breads use a board, rolling pin and tawa, curries use a pot/handi. Never add a station, ingredient or step the dish does not need. Pieces have their real shape in `form` (e.g. chicken 65 = irregular boneless bite-size chunks, never cubes; chapathi = round dough ball becoming a thin disc).",
  "EQUIPMENT (2-6): ids like kadai_1. Give every cooking vessel a burner 1-3 (0 for bowls, boards, plates). Exactly one PLATE (burner 0); plateEquipmentId points to it; the final serving vessel is always that PLATE, even for soup or curry. TOOLS (0-4) only if used.",
  "INGREDIENTS (3-12): each with role, a vivid `form`, catalogueHint (0 unless certain: 101 red onion, 102 garlic, 103 herbs/coriander, 104 tomato, 105 chilli, 108 mushroom, 109 ginger, 116 rice, 117 noodles, 118 pasta, 119 potato, 120 dough/flour, 140 salmon, 141 ribeye, 142 chicken, 143 prawns, 146 paneer, 147 tofu, 160 garam masala, 161 spice powders, 162 butter/ghee, 164 cream/yogurt, 165 oil), colorRaw and colorDone as linear RGB 0-1 (never near black; bright enough for an additive display), amount text.",
  "STEPS (5-12, cook order): each step = one visible action on one vessel. action is one of the enum. Use the most specific action: MARINATE (rest in marinade bowl), COAT (dredge/batter), HEAT_OIL, DEEP_FRY (count = batches), TEMPER (spices/curry leaves sizzled in a small pan), SAUTE_TOSS, ROLL_DOUGH, KNEAD, COOK_FLAT with FLIP for breads, etc. title <= 28 chars, whatWhy <= 110 chars saying what to do AND why it works. ingredientIds, equipmentId, toolId must reference ids you defined. durationSec 3-20 is the animation length (not real cooking time).",
  "PARALLEL WORK: when two vessels work at once, give the second vessel's steps `after` listing only the step it truly depends on, so both run together (e.g. tempering in a small pan while the first batch fries). Preheating a tawa or pan is HEAT_OIL with no ingredients (run it beside the prep via `after`). Otherwise leave `after` empty (runs after the previous step). End with PLATE (and GARNISH if used).",
  "LIMITS: ids are descriptive snake_case (kadai, marinate_chicken, never s1/s2); dishTitle <= 32 chars, cuisineTag <= 24, equipment role <= 40, ingredient name <= 28, form <= 60, amount <= 24. count is 0 unless the action really repeats (DEEP_FRY batches, tosses, knead folds). List garnish ingredient ids in garnishIds and put the GARNISH step on the plate after PLATE.",
  "Reply with the JSON object only.",
].join("\n");
// PROMPT-END

/** Pure: the Anthropic Messages API request body for a dish query (model id comes from AiModelConfig only). */
export function buildDirectorRequest(query: string): any {
  return {
    model: getModel("director"),
    max_tokens: DIRECTOR_MAX_TOKENS,
    system: DIRECTOR_PROMPT,
    messages: [{ role: "user", content: [{ type: "text", text: "Dish request: " + String(query) }] }],
    output_config: {
      effort: getEffort("director"),
      format: { type: "json_schema", schema: CookPlanJsonSchema },
    },
  };
}

/**
 * CookDirectorService.ts  (Chef Director v6, "Call A")
 * Turns a dish name into a validated CookPlan and broadcasts it.
 *
 * Listens to CookEvents.PLAN_REQUESTED {query}. Resolution order:
 *  1. PlanLibrary.lookupPlan(query)  (hand-authored fixtures, instant, offline-safe)
 *  2. live Anthropic call, only when AiModelConfig.isLiveEnabled("director") (model id AND key set), 60 s timeout
 *  3. otherwise DISH_NOT_FOUND {query, message}
 * Every plan passes sanitizeCookPlan before CookEvents.PLAN_READY {plan} is emitted. found:false, a failed sanitize, a
 * refusal / max_tokens stop or ANY failure emits DISH_NOT_FOUND (never a silent substitute dish). A request sequence
 * number drops results superseded by a newer request, Reset, Exit or cancelPending(). Never throws.
 */
@component
export class CookDirectorService extends BaseScriptComponent {
  /** Master switch for the live path. Live still needs a director model id and an API key (AiModelConfig). */
  @input
  useLiveAiDirector: boolean = true;

  private eventBus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private internetModule: any = null;
  private listening: boolean = false;
  private requestSeq: number = 0;
  private lastPlan: CookPlan | null = null;

  onAwake(): void {
    try {
      this.internetModule = require("LensStudio:InternetModule");
    } catch (_e) {
      this.internetModule = null;
    }
    this.createEvent("OnStartEvent").bind(() => this.initListeners());
  }

  private initListeners(): void {
    if (this.listening) return;
    this.listening = true;
    this.eventBus.on(CookEvents.PLAN_REQUESTED as any, (d?: any) => this.requestPlan(d));
    this.eventBus.on("RESET_REQUESTED", () => this.cancelPending());
    this.eventBus.on(CookEvents.EXIT as any, () => this.cancelPending());
  }

  // ── public API ──

  /** The last validated plan that was emitted (deep copy), or null. */
  public getLastPlan(): CookPlan | null {
    return this.lastPlan ? (JSON.parse(JSON.stringify(this.lastPlan)) as CookPlan) : null;
  }

  /** Drops any in-flight live request (Reset, Exit, Dish Studio Back). */
  public cancelPending(): void {
    this.requestSeq++;
  }

  /** Handles a plan request. Library hits emit synchronously; novel dishes may go live. Never throws. */
  public requestPlan(req?: { query?: string }): void {
    try {
      this.requestSeq++;
      const seq = this.requestSeq;
      const query = req && typeof req.query === "string" ? req.query.trim() : "";
      if (query.length === 0) {
        this.emitNotFound(query, NOT_FOUND_TEXT);
        return;
      }

      const fixture = lookupPlan(query);
      if (fixture) {
        const res = sanitizeCookPlan(fixture);
        if (res.ok && res.plan && res.plan.found) {
          print(`[CookDirector] library plan for "${query}": ${res.plan.dishTitle} (${res.plan.steps.length} steps)`);
          this.emitPlan(res.plan);
          return;
        }
        print(`[CookDirector] library plan failed validation (${res.errors.join("; ")}), trying live`);
      }

      if (this.useLiveAiDirector && isLiveEnabled("director") && this.internetModule) {
        print(`[CookDirector] live plan requested: "${query}"`);
        void this.directLive(query, seq);
        return;
      }
      print(`[CookDirector] no library plan for "${query}", live director disabled -> DISH_NOT_FOUND`);
      this.emitNotFound(query, NOT_FOUND_TEXT);
    } catch (e) {
      print(`[CookDirector] request error: ${e}`);
    }
  }

  // ── internals ──

  private emitPlan(plan: CookPlan): void {
    this.lastPlan = JSON.parse(JSON.stringify(plan)) as CookPlan;
    this.eventBus.emit(CookEvents.PLAN_READY as any, { plan: plan });
  }

  /** Tells the UI the dish could not be identified (it shows the message and reopens the input). */
  private emitNotFound(query: string, message: string): void {
    this.eventBus.emit("DISH_NOT_FOUND", { query: query, message: message && message.length > 0 ? message : NOT_FOUND_TEXT });
  }

  private async directLive(query: string, seq: number): Promise<void> {
    let plan: CookPlan | null = null;
    let reason = "";
    let message = NOT_FOUND_TEXT;
    const t0 = Date.now();
    try {
      const raw = await this.callAnthropic(query);
      const res = sanitizeCookPlan(raw);
      if (res.ok && res.plan && res.plan.found) {
        plan = res.plan;
        if (res.warnings.length > 0) print(`[CookDirector] plan repaired (${res.warnings.length}): ${res.warnings.slice(0, 4).join(" | ")}`);
      } else if (res.ok && res.plan) {
        reason = "model returned found=false";
        message = res.plan.notFoundMessage;
      } else {
        reason = "validation: " + res.errors.slice(0, 3).join("; ");
      }
    } catch (e) {
      reason = String(e);
    }
    if (seq !== this.requestSeq) {
      print("[CookDirector] live result discarded (superseded by a newer request, reset or exit)");
      return;
    }
    if (plan) {
      print(`[CookDirector] live plan ready in ${Date.now() - t0} ms: ${plan.dishTitle} (${plan.steps.length} steps)`);
      this.emitPlan(plan);
      return;
    }
    print(`[CookDirector] live plan gave no dish (${reason}) -> DISH_NOT_FOUND`);
    this.emitNotFound(query, message);
  }

  /** POSTs to the Anthropic Messages API and returns the parsed (unsanitized) plan object. Throws on any failure. */
  private async callAnthropic(query: string): Promise<any> {
    const body = buildDirectorRequest(query);

    const timeout = new Promise<never>((_res, rej) => {
      const ev = this.createEvent("DelayedCallbackEvent") as any;
      ev.bind(() => rej(new Error("timeout " + DIRECTOR_TIMEOUT_MS + "ms")));
      ev.reset(DIRECTOR_TIMEOUT_MS / 1000);
    });

    const response = await Promise.race([
      this.internetModule.fetch(ENDPOINT_URL, {
        method: "POST",
        headers: {
          "x-api-key": getApiKey(),
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      }),
      timeout,
    ]);

    if (!response || response.status !== 200) {
      throw new Error("HTTP " + (response ? response.status : "none"));
    }
    const data = await response.json();
    if (!data || data.stop_reason === "refusal" || data.stop_reason === "max_tokens") {
      throw new Error("stop_reason " + (data ? data.stop_reason : "none"));
    }
    let text = "";
    const blocks = data.content || [];
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i] && blocks[i].type === "text" && typeof blocks[i].text === "string") text += blocks[i].text;
    }
    if (text.length === 0) throw new Error("empty reply");
    try {
      return JSON.parse(text);
    } catch (_e) {
      throw new Error("unparseable JSON");
    }
  }
}
