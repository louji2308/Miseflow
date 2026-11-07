import { scenariosIndex } from "Leaf.lspkg/Scenarios/decorator/ScenarioIndexDecorator";
import { ScenarioMetadata } from "Leaf.lspkg/Scenarios/scenario/ScenarioMetadata";
import { DefaultScenarioManager } from "Leaf.lspkg/Scenarios/scenario/manager/DefaultLeafScenarioManager";
import { StationSetupScenario } from "./StationSetupScenario";
import { MetricBladeSteppingScenario } from "./MetricBladeSteppingScenario";
import { VolumetricPortionDomeScenario } from "./VolumetricPortionDomeScenario";
import { TransferArcScenario } from "./TransferArcScenario";
import { TimeWarpPlatingScenario } from "./TimeWarpPlatingScenario";
import { PrepDriftResolverScenario } from "./PrepDriftResolverScenario";
import { GazeWayfindingBeaconScenario } from "./GazeWayfindingBeaconScenario";
import { ProposalGateRejectionScenario } from "./ProposalGateRejectionScenario";
import { SpatulaFlipGuideScenario } from "./SpatulaFlipGuideScenario";
import { AutoCookFullFlowScenario } from "./AutoCookFullFlowScenario";
import { UniversalDishPageTableScenario } from "./UniversalDishPageTableScenario";
import { MultiDishAutoCookScenario } from "./MultiDishAutoCookScenario";
import { DishStudioFlowScenario } from "./DishStudioFlowScenario";
import { StepEngineScenario } from "./StepEngineScenario";
import { DishBiryaniCookScenario } from "./DishBiryaniCookScenario";
import { DishNoodlesCookScenario } from "./DishNoodlesCookScenario";
@component
export class LeafIndex extends BaseScriptComponent {
  @scenariosIndex
  static scenariosIndex: ScenarioMetadata[] = [
    {
      id: "station-setup-scenario",
      typename: StationSetupScenario.getTypeName(),
    },
    {
      id: "metric-blade-stepping-scenario",
      typename: MetricBladeSteppingScenario.getTypeName(),
    },
    {
      id: "volumetric-portion-dome-scenario",
      typename: VolumetricPortionDomeScenario.getTypeName(),
    },
    {
      id: "transfer-arc-scenario",
      typename: TransferArcScenario.getTypeName(),
    },
    {
      id: "time-warp-plating-scenario",
      typename: TimeWarpPlatingScenario.getTypeName(),
    },
    {
      id: "prep-drift-resolver-scenario",
      typename: PrepDriftResolverScenario.getTypeName(),
    },
    {
      id: "gaze-wayfinding-beacon-scenario",
      typename: GazeWayfindingBeaconScenario.getTypeName(),
    },
    {
      id: "proposal-gate-rejection-scenario",
      typename: ProposalGateRejectionScenario.getTypeName(),
    },
    {
      id: "spatula-flip-guide-scenario",
      typename: SpatulaFlipGuideScenario.getTypeName(),
    },
    {
      id: "auto-cook-full-flow",
      typename: AutoCookFullFlowScenario.getTypeName(),
      // test-only pacing multiplier for Auto Cook dwell times ("1" = real demo pacing, ~60 s)
      parameters: { speed: "8" },
    },
    {
      id: "universal-dish-page-table",
      typename: UniversalDishPageTableScenario.getTypeName(),
    },
    {
      id: "multi-dish-auto-cook",
      typename: MultiDishAutoCookScenario.getTypeName(),
      parameters: { speed: "8" },
    },
    {
      id: "dish-studio-flow",
      typename: DishStudioFlowScenario.getTypeName(),
    },
    {
      id: "step-engine",
      typename: StepEngineScenario.getTypeName(),
    },
    {
      id: "dish-biryani-cook",
      typename: DishBiryaniCookScenario.getTypeName(),
      parameters: { speed: "8" },
    },
    {
      id: "dish-noodles-cook",
      typename: DishNoodlesCookScenario.getTypeName(),
      parameters: { speed: "8", chip: "2" },
    },
  ];

  @input
  autoRunScenarios: boolean = false;

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => {
      const manager = DefaultScenarioManager.getInstance();
      const ids = manager.listScenarioIds();
      print(`[LeafIndex] Registered LEAF scenarios (${ids.length}): ${ids.join(", ")}`);
    });
  }

  private async runAllScenarios(ids: string[]): Promise<void> {
    const manager = DefaultScenarioManager.getInstance();
    for (const id of ids) {
      await manager.startScenario(id);
    }
  }
}
