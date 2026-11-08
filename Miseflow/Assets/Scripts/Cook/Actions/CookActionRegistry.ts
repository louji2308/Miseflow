/**
 * CookActionRegistry.ts  (Chef Director v6, W4)
 * action name (CookStep.action) -> CookAction module. Unknown / unimplemented names resolve to GENERIC, never a crash.
 */
import { CookAction } from "./CookActionKit";
import { CutAction } from "./CutAction";
import { MarinateAction } from "./MarinateAction";
import { MixAction } from "./MixAction";
import { KneadAction } from "./KneadAction";
import { CoatAction } from "./CoatAction";
import { HeatOilAction } from "./HeatOilAction";
import { DeepFryAction } from "./DeepFryAction";
import { ShallowFryAction } from "./ShallowFryAction";
import { SauteTossAction } from "./SauteTossAction";
import { TemperAction } from "./TemperAction";
import { SimmerAction } from "./SimmerAction";
import { BoilAction } from "./BoilAction";
import { RollDoughAction } from "./RollDoughAction";
import { CookFlatAction } from "./CookFlatAction";
import { FlipAction } from "./FlipAction";
import { SteamDumAction } from "./SteamDumAction";
import { WhiskAction } from "./WhiskAction";
import { PourAction } from "./PourAction";
import { SeasonAction } from "./SeasonAction";
import { RestAction } from "./RestAction";
import { PlateAction } from "./PlateAction";
import { GarnishAction } from "./GarnishAction";
import { GenericAction } from "./GenericAction";

const TABLE: { [name: string]: CookAction } = {};
for (const a of [
  CutAction, MarinateAction, MixAction, KneadAction, CoatAction, HeatOilAction, DeepFryAction, ShallowFryAction, SauteTossAction, TemperAction, SimmerAction, BoilAction,
  RollDoughAction, CookFlatAction, FlipAction, SteamDumAction, WhiskAction, PourAction, SeasonAction, RestAction, PlateAction, GarnishAction, GenericAction,
]) {
  TABLE[a.name] = a;
}

/** Default duration (s at 1x) when a step gives none. */
export const DEFAULT_DURATION: { [name: string]: number } = {
  CUT: 5, MARINATE: 6, MIX: 5, KNEAD: 6, COAT: 6, HEAT_OIL: 5, DEEP_FRY: 14, SHALLOW_FRY: 9, SAUTE_TOSS: 7, TEMPER: 5, SIMMER: 8, BOIL: 8,
  ROLL_DOUGH: 7, COOK_FLAT: 7, FLIP: 3, STEAM_DUM: 8, WHISK: 5, POUR: 4, SEASON: 3, REST: 4, PLATE: 4, GARNISH: 3, GENERIC: 4,
};

export const CookActionRegistry = {
  /** The action for a step's action name (GENERIC when unknown). */
  get(name: string): CookAction {
    const k = String(name || "").toUpperCase();
    return TABLE[k] || TABLE.GENERIC;
  },
  has(name: string): boolean {
    return !!TABLE[String(name || "").toUpperCase()];
  },
  names(): string[] {
    return Object.keys(TABLE);
  },
};
