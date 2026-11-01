import { MiseFlowEventBus } from "./MiseFlowEventBus";
import { makePbrMaterial } from "./StationPropsBuilder";

function findByName(parent: SceneObject, name: string): SceneObject | null {
  if (parent.name === name) return parent;
  const count = parent.getChildrenCount();
  for (let i = 0; i < count; i++) {
    const found = findByName(parent.getChild(i), name);
    if (found) return found;
  }
  return null;
}

function createBuilder(): MeshBuilder {
  const builder = new MeshBuilder([
    { name: "position", components: 3 },
    { name: "normal", components: 3, normalized: true },
    { name: "texture0", components: 2 },
    { name: "color", components: 4 },
  ]);
  builder.topology = MeshTopology.Triangles;
  builder.indexType = MeshIndexType.UInt16;
  return builder;
}

function addBox(
  builder: MeshBuilder,
  indices: number[],
  cx: number,
  cy: number,
  cz: number,
  hw: number,
  hh: number,
  hd: number,
  color: [number, number, number, number],
  baseIdx: number
): number {
  const x0 = cx - hw;
  const x1 = cx + hw;
  const y0 = cy - hh;
  const y1 = cy + hh;
  const z0 = cz - hd;
  const z1 = cz + hd;

  const verts: number[] = [];
  let vi = baseIdx;

  const face = (
    p0: [number, number, number],
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number],
    n: [number, number, number]
  ) => {
    verts.push(
      p0[0], p0[1], p0[2], n[0], n[1], n[2], 0, 0, color[0], color[1], color[2], color[3],
      p1[0], p1[1], p1[2], n[0], n[1], n[2], 1, 0, color[0], color[1], color[2], color[3],
      p2[0], p2[1], p2[2], n[0], n[1], n[2], 1, 1, color[0], color[1], color[2], color[3],
      p3[0], p3[1], p3[2], n[0], n[1], n[2], 0, 1, color[0], color[1], color[2], color[3]
    );
    indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    vi += 4;
  };

  face([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
  face([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
  face([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]);
  face([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
  face([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
  face([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);

  builder.appendVerticesInterleaved(verts);
  return vi;
}

/**
 * SpatialTransferArc.ts — Grandmaster Edition
 * Replaces the crude static tubes ("stick like things") with an animated stream
 * of shallot pieces flying along a parabolic Bézier curve into the saucepan.
 * Also renders a subtle luminous violet spline thread when saucepot is WAITING on prep.
 */
@component
export class SpatialTransferArc extends BaseScriptComponent {
  @input
  transferArcObject?: SceneObject;

  @input
  attentionConduitObject?: SceneObject;

  // Dynamic flying shallot particle objects
  private flyingShallotsRoot?: SceneObject;
  private flyingPieces: SceneObject[] = [];
  private readonly pieceCount: number = 7;

  private isTransferring: boolean = false;
  private transferProgress: number = 0.0;
  private readonly transferDuration: number = 1.35; // 1.35s flight time

  private isWaitingDependency: boolean = false;

  private eventBus: MiseFlowEventBus = MiseFlowEventBus.getInstance();

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => {
      this.resolveReferences();
      this.suppressCrudeSticks();
      this.buildFlyingShallots();
      this.initListeners();
    });

    this.createEvent("UpdateEvent").bind(() => {
      this.onUpdate();
    });
  }

  private resolveReferences(): void {
    const selfObj = this.getSceneObject();
    if (!this.transferArcObject) {
      this.transferArcObject = findByName(selfObj, "TransferArcTube");
    }
    if (!this.attentionConduitObject) {
      this.attentionConduitObject = findByName(selfObj, "CountertopConduit");
    }
  }

  /**
   * Hide the crude static stick cylinders so they never clutter the AR view.
   */
  private suppressCrudeSticks(): void {
    if (this.transferArcObject) {
      this.transferArcObject.enabled = false;
      this.transferArcObject.getTransform().setLocalScale(new vec3(0.0001, 0.0001, 0.0001));
    }
    if (this.attentionConduitObject) {
      this.attentionConduitObject.enabled = false;
      this.attentionConduitObject.getTransform().setLocalScale(new vec3(0.0001, 0.0001, 0.0001));
    }
  }

  /**
   * Pre-allocates realistic shallot dice pieces for dynamic trajectory flight.
   */
  private buildFlyingShallots(): void {
    const root = this.getSceneObject();
    const existing = findByName(root, "FlyingShallotsGroup");
    if (existing) existing.destroy();

    const group = global.scene.createSceneObject("FlyingShallotsGroup");
    group.setParent(root);
    this.flyingShallotsRoot = group;
    this.flyingPieces = [];
    const shallotMat = makePbrMaterial(0.68, 0.32, 0.54, 0.05, 0.35);

    for (let i = 0; i < this.pieceCount; i++) {
      const piece = global.scene.createSceneObject(`ShallotFlight_${i}`);
      piece.setParent(group);

      const rmv = piece.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      rmv.mainMaterial = shallotMat;
      const b = createBuilder();
      const idx: number[] = [];
      // Realistic purple-shallot colored box
      addBox(b, idx, 0, 0, 0, 0.32, 0.28, 0.32, [0.72, 0.32, 0.58, 1.0], 0);
      b.appendIndices(idx);
      rmv.mesh = b.getMesh();
      b.updateMesh();

      piece.enabled = false;
      this.flyingPieces.push(piece);
    }
  }

  private initListeners(): void {
    // When prep drifts, mark waiting state
    this.eventBus.on("DRIFT_RECORDED", () => {
      this.isWaitingDependency = true;
      print("[TransferArc] Schedule waiting dependency ACTIVE: Board -> Saucepot.");
    });

    // When transfer is triggered: launch dynamic shallot arc
    this.eventBus.on("STATION_STEP_COMPLETED", (data: any) => {
      if (data && data.stationId === "PREP") {
        this.isWaitingDependency = false;
        this.triggerTransfer();
      }
    });

    this.eventBus.on("TASK_COMPLETED", (data: any) => {
      if (data && data.taskId === "prep_shallots") {
        this.isWaitingDependency = false;
        this.triggerTransfer();
      }
    });

    this.eventBus.on("RESET_REQUESTED", () => {
      this.resetTransfer();
    });
  }

  public triggerTransfer(): void {
    this.isTransferring = true;
    this.transferProgress = 0.0;

    // Enable transfer arc object for LEAF validation and trajectory guidance
    if (this.transferArcObject) {
      this.transferArcObject.enabled = true;
    }

    // Enable the parabolic ribbon trail — built by StationPropsBuilder.buildTransferConduit
    const selfObj = this.getSceneObject();
    const ribbon = findByName(selfObj, "TransferParabolicRibbon");
    if (ribbon) ribbon.enabled = true;

    for (let i = 0; i < this.flyingPieces.length; i++) {
      this.flyingPieces[i].enabled = true;
    }

    print("[TransferArc] Dynamic Shallot Stream ACTIVE: 7 pieces flying smoothly into Saucepan.");
  }

  public isTransferActive(): boolean {
    return this.isTransferring || this.isWaitingDependency;
  }

  public pulseAttentionConduit(_enable: boolean): void {
    // No-op for clean visual aesthetics
  }

  private resetTransfer(): void {
    this.isTransferring = false;
    this.transferProgress = 0.0;
    this.isWaitingDependency = false;

    if (this.transferArcObject) {
      this.transferArcObject.enabled = false;
    }

    // Hide parabolic ribbon on reset
    const selfObj = this.getSceneObject();
    const ribbon = findByName(selfObj, "TransferParabolicRibbon");
    if (ribbon) ribbon.enabled = false;

    for (let i = 0; i < this.flyingPieces.length; i++) {
      this.flyingPieces[i].enabled = false;
    }
  }

  /**
   * Quadratic Bézier curve interpolation for natural gravity-assisted culinary arc
   * P0: Cutting board ramekin (11.5, 1.2, -2.5)
   * P1: High arc peak (5.5, 6.2, -6.5)
   * P2: Saucepan mouth (0.0, 1.6, -10.5)
   */
  private evaluateArcPoint(t: number): vec3 {
    const clampedT = Math.max(0.0, Math.min(1.0, t));
    const u = 1.0 - clampedT;

    const p0 = new vec3(11.5, 1.2, -2.5);
    const p1 = new vec3(5.5, 6.2, -6.5);
    const p2 = new vec3(0.0, 1.6, -10.5);

    // B(t) = u^2 * P0 + 2*u*t * P1 + t^2 * P2
    const x = u * u * p0.x + 2 * u * clampedT * p1.x + clampedT * clampedT * p2.x;
    const y = u * u * p0.y + 2 * u * clampedT * p1.y + clampedT * clampedT * p2.y;
    const z = u * u * p0.z + 2 * u * clampedT * p1.z + clampedT * clampedT * p2.z;

    return new vec3(x, y, z);
  }

  private onUpdate(): void {
    if (!this.isTransferring) return;

    const dt = getDeltaTime();
    this.transferProgress += dt / this.transferDuration;

    // Animate each flying shallot with a slight cascade offset
    const stepOffset = 0.08;
    for (let i = 0; i < this.flyingPieces.length; i++) {
      const pieceT = this.transferProgress - i * stepOffset;
      if (pieceT >= 0.0 && pieceT <= 1.0) {
        this.flyingPieces[i].enabled = true;
        const pos = this.evaluateArcPoint(pieceT);
        this.flyingPieces[i].getTransform().setLocalPosition(pos);

        // Gentle tumbling spin in flight
        const spinAngle = pieceT * Math.PI * 4.0;
        this.flyingPieces[i].getTransform().setLocalRotation(
          quat.fromEulerAngles(spinAngle, spinAngle * 0.7, spinAngle * 0.3)
        );
      } else if (pieceT > 1.0) {
        // Shallot has landed inside the saucepot!
        this.flyingPieces[i].enabled = false;
      } else {
        // Not yet launched
        this.flyingPieces[i].enabled = false;
      }
    }

    // Flight finished
    if (this.transferProgress >= 1.0 + this.pieceCount * stepOffset) {
      this.isTransferring = false;
      this.resetTransfer();
      print("[TransferArc] All shallots successfully landed into sauce reduction. Simmer engaged.");
    }
  }
}
