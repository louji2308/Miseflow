/**
 * DishLibraryConfig.ts  (the "Prebuilt Cookings" library: PREBUILT_COOKINGS)
 * Six pre-verified UniversalDishBlueprint presets (D1 master catalogue). Pure data + tiny helpers, no network.
 * Preset 0 (01_salmon_beurre_blanc) is the boot dish and mirrors the CURRENT hardcoded salmon scene
 * (ChoreographyDAG: prep 45 s / sear 60 s / sauce 50 s; StationPropsBuilder: 1.5 cm cuts across
 * onion, garlic, parsley, tomato, chilli lanes). Its values are never rewritten; only its access numbers moved to the
 * canonical catalogue numbers (#110 -> #140, #311 -> #304, #323 prep bowl -> #325). Every preset must pass
 * ProposalGate.validateDishBlueprint with 0 errors and 0 warnings.
 *
 * Order (Btn_CycleDish / Key 8 / chips): 01 salmon beurre blanc, 02 mushroom dum biryani, 03 wok-tossed hakka noodles,
 * 04 prime ribeye au poivre, 05 paneer tikka makhani, 06 butter-garlic tiger prawn pasta.
 * (The old 05 miso-tofu preset was replaced by dish 06; tofu #147 stays in the catalogue and is dish 03's protein.)
 *
 * Step flow convention: steps[] is in cook order. PREP steps sum to prepDurationSec, SKILLET steps to searDurationSec,
 * SAUCEPOT steps to sauceDurationSec; one PLATING step closes the dish.
 * Service ware (#341 plate / #342 deep bowl / #343 serving handi) is automatic: see AssetPageTable.autoServewareFor.
 */

import { getCatalogEntry } from "./AssetPageTable";
import { CookbookCardSpec, KinematicId, NOT_FOUND_MESSAGE, PrepSlotEntry, Rgb, StationFocus, StepSpec, UniversalDishBlueprint } from "./UniversalDishSchema";

export const PRESET_COUNT = 6;

/** Prep slot from the page-table catalogue (#101-#130), with optional name / colour / scale overrides. */
function slot(n: number, name: string, color?: Rgb, scale?: number): PrepSlotEntry {
  const l = getCatalogEntry(n);
  if (!l) throw new Error("DishLibraryConfig: unknown catalogue ingredient #" + n);
  const e: PrepSlotEntry = {
    accessNumber: n,
    name: name,
    archetype: l.archetype,
    colorRgb: color ? [color[0], color[1], color[2]] : [l.colorRgb[0], l.colorRgb[1], l.colorRgb[2]],
    scaleMultiplier: scale === undefined ? 1.0 : scale,
  };
  if (l.stemColorRgb) e.stemColorRgb = [l.stemColorRgb[0], l.stemColorRgb[1], l.stemColorRgb[2]];
  return e;
}

function card(n: number, st: StationFocus, headline: string, instruction: string, why: string): CookbookCardSpec {
  return { stepNumber: n, stationFocus: st, headline: headline, instruction: instruction, masteryWhy: why };
}

function step(id: string, station: StationFocus, kinematic: KinematicId, durationSec: number, title: string, whatWhy: string): StepSpec {
  return { id: id, station: station, kinematic: kinematic, durationSec: durationSec, title: title, whatWhy: whatWhy };
}

/** "Prebuilt Cookings" library. Index 0 is ALWAYS 01_salmon_beurre_blanc (boot + Btn_Reset default); new dishes are only ever appended. */
export const PREBUILT_COOKINGS: UniversalDishBlueprint[] = [
  // ── 0: default boot dish (matches the current hardcoded scene) ──
  {
    dishId: "01_salmon_beurre_blanc",
    dishTitle: "SALMON BEURRE BLANC",
    cuisineTag: "CLASSIC FRENCH",
    found: true,
    notFoundMessage: NOT_FOUND_MESSAGE,
    prepDurationSec: 45,
    searDurationSec: 60,
    sauceDurationSec: 50,
    cutSpacingCm: 1.5,
    cutAngleDeg: 0,
    cutLabel: "1.5cm Straight Dice",
    ingredientAccessNumbers: [101, 102, 103, 104, 105],
    starchAccessNumbers: [],
    spiceAccessNumbers: [],
    vesselAccessNumbers: [301, 304, 325],
    toolAccessNumbers: [321, 331],
    prepSlots: [
      slot(101, "Red Onion"),
      slot(102, "Garlic"),
      slot(103, "Parsley"),
      slot(104, "Tomato"),
      slot(105, "Yellow Chilli"),
    ],
    protein: {
      accessNumber: 140,
      name: "Atlantic Salmon Fillet",
      archetype: "FILLET_SLAB",
      primaryKine: "KINE_SPATULA_FLIP_180",
      lengthCm: 9.0,
      widthCm: 4.5,
      heightCm: 1.9,
      rawTopRgb: [1.0, 0.42, 0.32],
      searedCrustRgb: [0.85, 0.51, 0.17],
      flipCalloutText: "FLIP 180 DEG",
    },
    sauce: {
      name: "Shallot-Lemon Beurre Blanc",
      vesselAccessNumber: 304,
      baseLiquidRgb: [0.98, 0.82, 0.28],
      reducedSauceRgb: [0.96, 0.74, 0.20],
      useLadleStir: false,
    },
    cookbookCards: [
      card(1, "PREP", "1/4 PREP: 1.5CM DICE", "Cut the five veg on the 1.5 cm guide lines, eight clean cuts.", "Even dice cook at the same speed, so nothing scorches."),
      card(2, "SKILLET", "2/4 SEAR: SKIN DOWN", "Lay the fillet skin-down in hot oil. Press 10 s, then leave it.", "Dry skin on hard heat renders fat and shatters crisp."),
      card(3, "SAUCEPOT", "3/4 SAUCE: REDUCE", "Pour the veg into the saucier and reduce gently until glossy.", "Slow reduction concentrates flavour without splitting."),
      card(4, "PLATING", "4/4 PLATE: GOLD SIDE UP", "Flip the salmon, plate it, spoon sauce, finish with parsley.", "Showing the crisp side up sells the texture you built."),
    ],
    steps: [
      step("chop_veg", "PREP", "KINE_ROCK_CHOP", 30, "CHOP SHALLOTS: 8 CUTS", "Rock-chop the five veg on the 1.5 cm lines, eight cuts. Even dice cook at one speed."),
      step("portion_veg", "PREP", "KINE_ROCK_CHOP", 15, "PORTION INTO THE BOWL", "Sweep the dice into the bowl until the dome reads 100%. Equal portions season evenly."),
      step("transfer_veg", "SAUCEPOT", "KINE_TWO_STAGE_POUR", 10, "TWO-POUR TRANSFER", "Tip the bowl into the saucier in two pours. Slow pours keep the dice from splashing."),
      step("sear_skin", "SKILLET", "KINE_SPATULA_FLIP_180", 45, "SEAR SKIN DOWN", "Lay the fillet skin-down and leave it. Dry skin on hard heat shatters crisp."),
      step("flip_salmon", "SKILLET", "KINE_SPATULA_FLIP_180", 15, "FLIP 180 DEG", "Slide the spatula under and flip once. A single turn keeps the flesh moist."),
      step("reduce_sauce", "SAUCEPOT", "KINE_TWO_STAGE_POUR", 40, "REDUCE THE SAUCE", "Reduce gently until glossy. Slow reduction concentrates flavour without splitting."),
      step("plate_dish", "PLATING", "KINE_CONVERGENCE_PLATING", 15, "PLATE GOLD SIDE UP", "Plate the salmon, spoon sauce, add parsley. Crisp side up sells the texture."),
    ],
    visionPromptContext: "Atlantic salmon fillet, skin-down sear in a cast-iron skillet; judge skin crispness and flesh colour.",
    skilletPillVerb: "SEAR",
    saucePillVerb: "SAUCE",
  },
  // ── 1: mushroom dum biryani ──
  {
    dishId: "02_mushroom_dum_biryani",
    dishTitle: "MUSHROOM DUM BIRYANI",
    cuisineTag: "HYDERABADI DUM",
    found: true,
    notFoundMessage: NOT_FOUND_MESSAGE,
    prepDurationSec: 50,
    searDurationSec: 70,
    sauceDurationSec: 60,
    cutSpacingCm: 0.8,
    cutAngleDeg: 0,
    cutLabel: "0.8cm Brunoise",
    ingredientAccessNumbers: [101, 109, 103, 104, 105],
    starchAccessNumbers: [116],
    spiceAccessNumbers: [160, 161],
    vesselAccessNumbers: [302, 303, 325, 326],
    toolAccessNumbers: [321, 332],
    prepSlots: [
      slot(101, "Red Onion"),
      slot(109, "Ginger-Garlic Block", [0.94, 0.86, 0.62]),
      slot(103, "Mint & Coriander", [0.14, 0.52, 0.18]),
      slot(104, "Roma Tomato"),
      slot(105, "Green Slit Chilli", [0.20, 0.62, 0.15]),
    ],
    protein: {
      accessNumber: 142,
      name: "Marinated Button Mushrooms",
      archetype: "CUBED_SEAR",
      primaryKine: "KINE_PAN_TOSS_ROLL",
      lengthCm: 7.0,
      widthCm: 5.5,
      heightCm: 2.2,
      rawTopRgb: [0.76, 0.68, 0.58],
      searedCrustRgb: [0.45, 0.27, 0.12],
      flipCalloutText: "PAN TOSS 180",
    },
    sauce: {
      name: "Saffron Ghee to Biryani Masala",
      vesselAccessNumber: 303,
      baseLiquidRgb: [0.969, 0.792, 0.271],
      reducedSauceRgb: [0.549, 0.220, 0.118],
      useLadleStir: true,
    },
    cookbookCards: [
      card(1, "PREP", "1/4 PREP: 0.8CM BRUNOISE", "Brunoise onion, ginger and chilli on the 0.8 cm guide lines.", "Tiny dice melt into the masala and carry flavour evenly."),
      card(2, "SKILLET", "2/4 WOK: SAUTE + TOSS", "Sear marinated mushrooms hot, then toss the wok so they roll over.", "A hard sear drives off water so mushrooms brown, not boil."),
      card(3, "SAUCEPOT", "3/4 DUM: LAYER + SEAL", "Ladle the masala, layer par-cooked rice, drizzle saffron ghee, seal.", "Trapped steam finishes rice gently, so every grain stays whole."),
      card(4, "PLATING", "4/4 SERVE: LIFT THE LID", "Lift the lid at the table, fold gently, crown with mint and serve.", "Opening it at the table releases the trapped aroma to the guest."),
    ],
    steps: [
      step("brunoise_aromatics", "PREP", "KINE_ROCK_CHOP", 30, "BRUNOISE THE AROMATICS", "Chop onion, ginger and chilli on the 0.8 cm lines. Fine dice melt into the masala."),
      step("pinch_spices", "PREP", "KINE_TWO_STAGE_POUR", 20, "PINCH IN THE SPICES", "Pour the garam masala and powders into the bowl. Blooming them in fat wakes their aroma."),
      step("sear_mushrooms", "SKILLET", "KINE_PAN_TOSS_ROLL", 40, "SEAR THE MUSHROOMS", "Sear marinated mushrooms in the hot wok. A hard sear drives off water so they brown."),
      step("toss_mushrooms", "SKILLET", "KINE_PAN_TOSS_ROLL", 30, "TOSS THE WOK", "Toss the wok so the mushrooms roll over. Even colour on every side, with no steaming."),
      step("ladle_masala", "SAUCEPOT", "KINE_LADLE_ORBITAL_STIR", 20, "LADLE THE MASALA", "Stir the masala in slow ladle orbits. Slow circles blend the base without breaking it."),
      step("layer_dum", "SAUCEPOT", "KINE_RICE_DUM_LAYER", 25, "LAYER RICE AND MUSHROOMS", "Layer par-cooked rice over the mushrooms and drizzle saffron ghee. Layers cook evenly."),
      step("seal_dum", "SAUCEPOT", "KINE_RICE_DUM_LAYER", 15, "SEAL THE DUM LID", "Press the domed lid on to seal. Trapped steam finishes the rice gently."),
      step("serve_biryani", "PLATING", "KINE_CONVERGENCE_PLATING", 15, "LIFT THE LID AND SERVE", "Open the lid, fold gently into the serving handi, crown with mint. Aroma hits first."),
    ],
    visionPromptContext: "Cubed marinated button mushrooms searing in a carbon-steel wok; judge browning and moisture release.",
    skilletPillVerb: "SAUTE",
    saucePillVerb: "DUM",
  },
  // ── 2: wok-tossed hakka noodles ──
  {
    dishId: "03_wok_hakka_noodles",
    dishTitle: "WOK-TOSSED HAKKA NOODLES",
    cuisineTag: "INDO-CHINESE WOK",
    found: true,
    notFoundMessage: NOT_FOUND_MESSAGE,
    prepDurationSec: 40,
    searDurationSec: 55,
    sauceDurationSec: 40,
    cutSpacingCm: 0.4,
    cutAngleDeg: 0,
    cutLabel: "0.4cm Fine Julienne",
    ingredientAccessNumbers: [124, 107, 122, 126, 102],
    starchAccessNumbers: [117],
    spiceAccessNumbers: [165],
    vesselAccessNumbers: [302, 304, 325],
    toolAccessNumbers: [321, 334],
    prepSlots: [
      slot(124, "Cabbage & Bok Choy"),
      slot(107, "Carrot Julienne"),
      slot(122, "Red Bell Pepper"),
      slot(126, "Scallion"),
      slot(102, "Garlic"),
    ],
    protein: {
      accessNumber: 147,
      name: "Wok-Crisped Tofu",
      archetype: "CUBED_SEAR",
      primaryKine: "KINE_PAN_TOSS_ROLL",
      lengthCm: 7.0,
      widthCm: 4.5,
      heightCm: 2.0,
      rawTopRgb: [0.98, 0.95, 0.89],
      searedCrustRgb: [0.62, 0.28, 0.09],
      flipCalloutText: "WOK TOSS 180",
    },
    sauce: {
      name: "Soy-Vinegar Hakka Sauce",
      vesselAccessNumber: 304,
      baseLiquidRgb: [0.62, 0.38, 0.18],
      reducedSauceRgb: [0.36, 0.18, 0.09],
      useLadleStir: false,
    },
    cookbookCards: [
      card(1, "PREP", "1/4 PREP: 0.4CM JULIENNE", "Julienne cabbage, carrot, pepper and scallion on the 0.4 cm lines.", "Thin strips cook in seconds and keep a crisp bite."),
      card(2, "SKILLET", "2/4 WOK: SEAR + TOSS", "Crisp the tofu in the hot wok, then lift and toss noodles with the veg.", "Smoking-hot metal gives wok hei, a smoky char you cannot fake."),
      card(3, "SAUCEPOT", "3/4 SAUCE: SOY + VINEGAR", "Simmer soy, vinegar and chilli in the saucier until glossy.", "Reducing concentrates salt and sweet, so a splash goes far."),
      card(4, "PLATING", "4/4 PLATE: TWIRL IN BOWL", "Pour the sauce over the noodles and twirl a nest into the deep bowl.", "A tight nest holds heat and lets the toppings sit on top."),
    ],
    steps: [
      step("julienne_veg", "PREP", "KINE_ROCK_CHOP", 25, "JULIENNE THE VEG", "Julienne cabbage, carrot, pepper and scallion on the 0.4 cm lines. Thin strips cook fast."),
      step("portion_veg", "PREP", "KINE_TWO_STAGE_POUR", 15, "PORTION INTO THE BOWL", "Pour the strips into the bowl in two scoops. Ready veg means the wok never waits."),
      step("sear_tofu", "SKILLET", "KINE_PAN_TOSS_ROLL", 20, "CRISP THE TOFU", "Sear tofu cubes in the smoking wok. Dry hot edges crisp instead of steaming."),
      step("build_sauce", "SAUCEPOT", "KINE_TWO_STAGE_POUR", 25, "SIMMER THE SAUCE", "Simmer soy, vinegar and chilli until glossy. Reduction concentrates salt and sweet."),
      step("lift_toss_noodles", "SKILLET", "KINE_NOODLE_LIFT_TOSS", 35, "LIFT AND TOSS NOODLES", "Lift the noodles high with chopsticks and toss. Air separates strands and adds wok hei."),
      step("glaze_pour", "SAUCEPOT", "KINE_TWO_STAGE_POUR", 15, "POUR THE GLAZE", "Pour the sauce down the wok rim in two passes. Rim-pour caramelises and coats evenly."),
      step("plate_bowl", "PLATING", "KINE_CONVERGENCE_PLATING", 15, "TWIRL INTO THE BOWL", "Twirl a tight nest into the deep bowl, top with scallion. A nest holds heat."),
    ],
    visionPromptContext: "Cubed tofu and noodle strands tossing in a carbon-steel wok; judge char marks and strand separation.",
    skilletPillVerb: "STIR",
    saucePillVerb: "SAUCE",
  },
  // ── 3: ribeye au poivre ──
  {
    dishId: "04_ribeye_au_poivre",
    dishTitle: "RIBEYE AU POIVRE",
    cuisineTag: "FRENCH BISTRO",
    found: true,
    notFoundMessage: NOT_FOUND_MESSAGE,
    prepDurationSec: 40,
    searDurationSec: 90,
    sauceDurationSec: 45,
    cutSpacingCm: 2.0,
    cutAngleDeg: 45,
    cutLabel: "2.0cm 45deg Bias",
    ingredientAccessNumbers: [101, 102, 103, 108, 107],
    starchAccessNumbers: [],
    spiceAccessNumbers: [162],
    vesselAccessNumbers: [301, 304, 325],
    toolAccessNumbers: [322, 331],
    prepSlots: [
      slot(101, "Shallot", [0.62, 0.35, 0.45]),
      slot(102, "Black Garlic", [0.22, 0.14, 0.12]),
      slot(103, "Fresh Thyme", [0.22, 0.45, 0.20]),
      slot(108, "Cremini Mushroom"),
      slot(107, "Asparagus", [0.35, 0.60, 0.20]),
    ],
    protein: {
      accessNumber: 141,
      name: "Prime Ribeye Steak",
      archetype: "MARBLED_STEAK",
      primaryKine: "KINE_SPATULA_FLIP_180",
      lengthCm: 10.0,
      widthCm: 7.0,
      heightCm: 3.0,
      rawTopRgb: [0.65, 0.14, 0.14],
      searedCrustRgb: [0.29, 0.13, 0.06],
      flipCalloutText: "FLIP 180 DEG",
    },
    sauce: {
      name: "Cognac to Peppercorn Au Poivre",
      vesselAccessNumber: 304,
      baseLiquidRgb: [0.80, 0.50, 0.18],
      reducedSauceRgb: [0.38, 0.24, 0.13],
      useLadleStir: false,
    },
    cookbookCards: [
      card(1, "PREP", "1/4 PREP: 2CM BIAS CUT", "Slice shallot, asparagus and cremini at 45 deg, 2 cm apart.", "Bias cuts expose more surface, so veg cook fast and glaze."),
      card(2, "SKILLET", "2/4 SEAR: HARD CRUST", "Press the ribeye into smoking cast iron. Hold 90 s, flip once.", "Leaving it alone builds the crust; early flips steam it."),
      card(3, "SAUCEPOT", "3/4 SAUCE: COGNAC + PEPPER", "Deglaze with cognac, add cream and cracked pepper; reduce.", "Reducing cognac burns off alcohol and leaves rich body."),
      card(4, "PLATING", "4/4 PLATE: REST + SAUCE", "Rest the steak, slice, fan it on the plate and nap with sauce.", "Resting lets juices settle so the slice stays pink and wet."),
    ],
    steps: [
      step("bias_cut_veg", "PREP", "KINE_ROCK_CHOP", 25, "BIAS-CUT THE VEG", "Slice shallot, asparagus and cremini at 45 deg, 2 cm apart. More surface means more glaze."),
      step("portion_veg", "PREP", "KINE_TWO_STAGE_POUR", 15, "PORTION INTO THE BOWL", "Sweep the cuts into the bowl in two scoops. Ready veg lets you watch the steak."),
      step("sear_crust", "SKILLET", "KINE_SPATULA_FLIP_180", 55, "SEAR THE HARD CRUST", "Press the ribeye into smoking cast iron and leave it. Stillness builds the crust."),
      step("flip_ribeye", "SKILLET", "KINE_SPATULA_FLIP_180", 35, "FLIP ONCE, 180 DEG", "Flip once with the spatula and sear the second side. One turn keeps the centre pink."),
      step("deglaze_pour", "SAUCEPOT", "KINE_TWO_STAGE_POUR", 20, "DEGLAZE WITH COGNAC", "Pour cognac into the saucier in two pours. Cooking off the alcohol leaves rich body."),
      step("reduce_peppercorn", "SAUCEPOT", "KINE_TWO_STAGE_POUR", 25, "REDUCE WITH PEPPER", "Add cream and cracked pepper and reduce. Gentle heat keeps the cream from splitting."),
      step("plate_rest", "PLATING", "KINE_CONVERGENCE_PLATING", 15, "REST, SLICE, SAUCE", "Rest the steak, slice and fan it, nap with sauce. Resting keeps the juices in."),
    ],
    visionPromptContext: "Thick prime ribeye steak searing in a cast-iron skillet; judge crust darkness and edge browning.",
    skilletPillVerb: "SEAR",
    saucePillVerb: "SAUCE",
  },
  // ── 4: paneer tikka makhani ──
  {
    dishId: "05_paneer_tikka_makhani",
    dishTitle: "PANEER TIKKA MAKHANI",
    cuisineTag: "NORTH INDIAN",
    found: true,
    notFoundMessage: NOT_FOUND_MESSAGE,
    prepDurationSec: 45,
    searDurationSec: 60,
    sauceDurationSec: 70,
    cutSpacingCm: 0.8,
    cutAngleDeg: 0,
    cutLabel: "0.8cm Brunoise",
    ingredientAccessNumbers: [101, 109, 103, 104, 122],
    starchAccessNumbers: [],
    spiceAccessNumbers: [161, 162, 164],
    vesselAccessNumbers: [301, 303, 325],
    toolAccessNumbers: [321, 331, 332],
    prepSlots: [
      slot(101, "Red Onion"),
      slot(109, "Ginger Block"),
      slot(103, "Kasuri Methi & Cilantro", [0.20, 0.48, 0.16]),
      slot(104, "Heirloom Tomato", [0.88, 0.25, 0.10]),
      slot(122, "Green Capsicum", [0.25, 0.58, 0.20]),
    ],
    protein: {
      accessNumber: 146,
      name: "Spiced Paneer Steak",
      archetype: "FILLET_SLAB",
      primaryKine: "KINE_SPATULA_FLIP_180",
      lengthCm: 8.0,
      widthCm: 5.0,
      heightCm: 2.2,
      rawTopRgb: [0.97, 0.89, 0.59],
      searedCrustRgb: [0.79, 0.36, 0.12],
      flipCalloutText: "FLIP 180 DEG",
    },
    sauce: {
      name: "Cashew-Butter to Makhani Gravy",
      vesselAccessNumber: 303,
      baseLiquidRgb: [0.96, 0.86, 0.66],
      reducedSauceRgb: [0.90, 0.38, 0.12],
      useLadleStir: true,
    },
    cookbookCards: [
      card(1, "PREP", "1/4 PREP: 0.8CM BRUNOISE", "Brunoise onion, ginger, tomato and capsicum on the 0.8 cm lines.", "Fine dice break down fast into a smooth, velvety gravy."),
      card(2, "SKILLET", "2/4 CHAR: PANEER STEAK", "Sear the spiced paneer until charred, then flip it once.", "Charring the marinade adds smoky tikka flavour to soft paneer."),
      card(3, "SAUCEPOT", "3/4 GRAVY: CASHEW + BUTTER", "Pour cashew base, then makhani; ladle in slow, even circles.", "Gentle stirring keeps the butter emulsified and the gravy silky."),
      card(4, "PLATING", "4/4 PLATE: GLAZE + GARNISH", "Set paneer in the gravy, finish with cream and kasuri methi.", "Crushed kasuri methi blooms at the end for a fragrant finish."),
    ],
    steps: [
      step("brunoise_base", "PREP", "KINE_ROCK_CHOP", 30, "BRUNOISE THE BASE", "Chop onion, ginger, tomato and capsicum on the 0.8 cm lines. Fine dice melt into gravy."),
      step("pinch_spices", "PREP", "KINE_TWO_STAGE_POUR", 15, "PINCH IN THE SPICES", "Pour the red chilli and garam powders into the bowl. Colour first, so the gravy glows."),
      step("char_paneer", "SKILLET", "KINE_SPATULA_FLIP_180", 35, "CHAR THE PANEER", "Lay the spiced paneer in the hot skillet. Charring the marinade adds smoky tikka flavour."),
      step("flip_paneer", "SKILLET", "KINE_SPATULA_FLIP_180", 25, "FLIP 180 DEG", "Flip the paneer once to char the second face. One turn keeps the centre soft."),
      step("pour_cashew", "SAUCEPOT", "KINE_TWO_STAGE_POUR", 20, "POUR THE CASHEW BASE", "Pour the cashew base into the handi in two pours. Slow pours keep the base smooth."),
      step("ladle_makhani", "SAUCEPOT", "KINE_LADLE_ORBITAL_STIR", 30, "LADLE THE MAKHANI", "Stir in slow, even ladle circles. Gentle motion keeps the butter emulsified."),
      step("finish_butter", "SAUCEPOT", "KINE_LADLE_ORBITAL_STIR", 20, "FINISH WITH BUTTER", "Fold in butter and cream with slow orbits. Off-boil butter makes the gravy silky."),
      step("plate_makhani", "PLATING", "KINE_CONVERGENCE_PLATING", 15, "GLAZE AND GARNISH", "Set the paneer in the gravy, finish with cream and kasuri methi. Aroma blooms last."),
    ],
    visionPromptContext: "Thick spiced paneer steak charring in a skillet; judge char marks and edge crisping without burning.",
    skilletPillVerb: "CHAR",
    saucePillVerb: "GRAVY",
  },
  // ── 5: butter-garlic tiger prawn pasta ──
  {
    dishId: "06_garlic_prawn_pasta",
    dishTitle: "BUTTER-GARLIC PRAWN PASTA",
    cuisineTag: "ITALIAN COASTAL",
    found: true,
    notFoundMessage: NOT_FOUND_MESSAGE,
    prepDurationSec: 40,
    searDurationSec: 50,
    sauceDurationSec: 70,
    cutSpacingCm: 0.4,
    cutAngleDeg: 0,
    cutLabel: "0.4cm Fine Mince",
    ingredientAccessNumbers: [102, 104, 103, 128, 105],
    starchAccessNumbers: [118],
    spiceAccessNumbers: [162, 165],
    vesselAccessNumbers: [301, 305, 325],
    toolAccessNumbers: [321, 306, 335, 336],
    prepSlots: [
      slot(102, "Garlic"),
      slot(104, "Cherry Tomato", [0.92, 0.18, 0.10], 0.85),
      slot(103, "Flat Parsley"),
      slot(128, "Lemon"),
      slot(105, "Red Chilli", [0.85, 0.12, 0.08]),
    ],
    protein: {
      accessNumber: 143,
      name: "Tiger Prawns",
      archetype: "MEDALLION_SCALLOP",
      primaryKine: "KINE_PAN_TOSS_ROLL",
      lengthCm: 6.5,
      widthCm: 5.0,
      heightCm: 2.2,
      rawTopRgb: [0.96, 0.60, 0.48],
      searedCrustRgb: [0.90, 0.35, 0.20],
      flipCalloutText: "PAN TOSS 180",
    },
    sauce: {
      name: "Garlic Butter Pasta-Water Emulsion",
      vesselAccessNumber: 305,
      baseLiquidRgb: [0.96, 0.90, 0.62],
      reducedSauceRgb: [0.98, 0.80, 0.35],
      useLadleStir: false,
    },
    cookbookCards: [
      card(1, "PREP", "1/4 PREP: 0.4CM MINCE", "Mince garlic and chilli on the 0.4 cm lines; halve the tomatoes.", "Fine garlic melts into butter instead of scorching in chunks."),
      card(2, "SKILLET", "2/4 SEAR: TOSS THE PRAWNS", "Sear the prawns hot until coral, then toss the pan so they roll over.", "Short, hard heat keeps prawns snappy, not rubbery."),
      card(3, "SAUCEPOT", "3/4 PASTA: BOIL + EMULSIFY", "Boil pasta, lift with the strainer, whisk starchy water into butter.", "Starchy water binds butter and oil into a glossy sauce."),
      card(4, "PLATING", "4/4 PLATE: TWIRL + CROWN", "Twirl the pasta into the bowl with tongs, top with prawns and parsley.", "Height and fresh herbs make the bowl look and smell alive."),
    ],
    steps: [
      step("mince_aromatics", "PREP", "KINE_ROCK_CHOP", 25, "MINCE THE AROMATICS", "Mince garlic and chilli on the 0.4 cm lines. Fine garlic melts into butter, no scorch."),
      step("portion_aromatics", "PREP", "KINE_TWO_STAGE_POUR", 15, "PORTION INTO THE BOWL", "Scoop the minced aromatics into the bowl. Ready garlic stops burning while you stir."),
      step("boil_pasta", "SAUCEPOT", "KINE_TWO_STAGE_POUR", 30, "BOIL THE PASTA", "Lower the pasta into salted water in two pours. Salted water seasons it from inside."),
      step("sear_prawns", "SKILLET", "KINE_PAN_TOSS_ROLL", 30, "SEAR THE PRAWNS", "Sear the prawns in the hot skillet until coral. Short hard heat keeps them snappy."),
      step("lift_drain", "SAUCEPOT", "KINE_NOODLE_LIFT_TOSS", 20, "LIFT AND DRAIN", "Lift the strainer basket high and drain, saving some water. Starch binds the sauce."),
      step("toss_garlic_butter", "SKILLET", "KINE_PAN_TOSS_ROLL", 20, "TOSS IN GARLIC BUTTER", "Add garlic and butter and toss the pan. Butter on moving heat browns, not burns."),
      step("emulsify_sauce", "SAUCEPOT", "KINE_WHISK_EMULSION", 20, "WHISK TO EMULSIFY", "Whisk starchy water into butter and oil. Emulsified sauce clings and gleams."),
      step("plate_pasta", "PLATING", "KINE_CONVERGENCE_PLATING", 15, "TWIRL AND CROWN", "Twirl the pasta into the bowl with tongs, top with prawns and parsley. Height wins."),
    ],
    visionPromptContext: "Tiger prawns searing in a cast-iron skillet with garlic butter; judge coral colour and curl, avoid overcooking.",
    skilletPillVerb: "SEAR",
    saucePillVerb: "EMULSIFY",
  },
];

/**
 * Lower-case keyword aliases per preset (longest alias contained in the query wins; tie -> lower index).
 * Matching is word-start based, so "prawns" matches "prawn" and "dum" does not fire inside "medium".
 */
const ALIASES: string[][] = [
  ["salmon", "beurre blanc", "beurre", "fish", "fillet", "lemon butter", "white butter sauce"],
  ["biryani", "mushroom", "dum", "hyderabadi", "rice", "pulao", "pilaf", "button mushroom"],
  ["noodle", "hakka", "ramen", "chow mein", "chowmein", "lo mein", "udon", "schezwan", "tofu", "stir fry", "stir-fry", "stirfry", "wok"],
  ["ribeye", "rib eye", "au poivre", "poivre", "steak", "beef", "peppercorn", "cognac", "pepper steak", "prime rib"],
  ["paneer", "makhani", "tikka", "butter masala", "cottage cheese", "butter chicken", "tikka masala"],
  ["prawn", "shrimp", "pasta", "scampi", "spaghetti", "linguine", "penne", "garlic butter", "aglio"],
];

function clone(bp: UniversalDishBlueprint): UniversalDishBlueprint {
  return JSON.parse(JSON.stringify(bp));
}

function wrap(i: number): number {
  const n = typeof i === "number" && isFinite(i) ? Math.floor(i) : 0;
  return ((n % PRESET_COUNT) + PRESET_COUNT) % PRESET_COUNT;
}

/** Deep copy of preset i (index wraps into 0..5), so callers may mutate/sanitize freely. */
export function getPreset(i: number): UniversalDishBlueprint {
  return clone(PREBUILT_COOKINGS[wrap(i)]);
}

/** Next preset index in the Btn_CycleDish order (wraps 5 -> 0). */
export function nextPresetIndex(i: number): number {
  return wrap(wrap(i) + 1);
}

/** Preset index whose keyword aliases best match the free-text query, or -1 when nothing matches (never guesses). */
export function matchByKeyword(query: string): number {
  if (typeof query !== "string") return -1;
  const q = query.toLowerCase().replace(/[^a-z0-9\- ]+/g, " ").replace(/\s+/g, " ").trim();
  if (q.length === 0) return -1;
  let best = -1;
  let bestLen = 0;
  for (let p = 0; p < ALIASES.length; p++) {
    for (let a = 0; a < ALIASES[p].length; a++) {
      const alias = ALIASES[p][a];
      // word-start match so "dum"/"rice" do not fire inside "medium"/"price"; plurals still match
      if (alias.length > bestLen && (" " + q).indexOf(" " + alias) >= 0) {
        best = p;
        bestLen = alias.length;
      }
    }
  }
  return best;
}
