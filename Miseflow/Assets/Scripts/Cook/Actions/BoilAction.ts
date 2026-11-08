/** BOIL: rolling boil (dense bubbles, strong steam, food tumbles); shares the SIMMER motion with harder settings. */
import { CookAction } from "./CookActionKit";
import { simmerLike } from "./SimmerAction";

export const BoilAction: CookAction = simmerLike("BOIL", true);
