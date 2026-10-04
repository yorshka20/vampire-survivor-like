import { IEntity } from '@ecs/core/ecs/types';
import { RectArea } from '@ecs/types/types';
import { CanvasRenderLayer } from '@render/canvas2d/base';
import { RenderLayerIdentifier, RenderLayerPriority } from '@render/constant';
import { FRUIT_LEVELS } from '../fruits';
import { GameLayout } from '../layout';
import { MergeState } from '../state';

const WALL_COLOR = 'rgba(255, 255, 255, 0.85)';
const WALL_WIDTH = 6;
const GUIDE_COLOR = 'rgba(255, 255, 255, 0.25)';

/**
 * Game overlay drawn on top of the entity layers: container walls, the drop
 * guide line and the held-fruit preview (and, in later phases, the danger line).
 *
 * It renders no entities; it reads the game layout + MergeState, injected via
 * {@link bind} after the renderer constructs it.
 */
export class MergeOverlayLayer extends CanvasRenderLayer {
  private layout: GameLayout | null = null;
  private state: MergeState | null = null;

  constructor(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
    super(RenderLayerIdentifier.OVERLAY, RenderLayerPriority.OVERLAY, canvas, context);
  }

  bind(layout: GameLayout, state: MergeState): void {
    this.layout = layout;
    this.state = state;
  }

  update(_deltaTime: number, _viewport: RectArea, cameraOffset: [number, number]): void {
    if (!this.layout || !this.state) {
      return;
    }
    this.renderContainer(this.layout.container, cameraOffset);
    if (this.state.heldVisible) {
      this.renderHeldFruit(this.layout, this.state, cameraOffset);
    }
  }

  /** Open-top container: left wall, floor, right wall. */
  private renderContainer(container: RectArea, cameraOffset: [number, number]): void {
    const [x, y, w, h] = container;
    const left = x + cameraOffset[0];
    const top = y + cameraOffset[1];
    // Offset by half the stroke so the walls sit just outside the interior.
    const half = WALL_WIDTH / 2;

    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = WALL_COLOR;
    ctx.lineWidth = WALL_WIDTH;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(left - half, top);
    ctx.lineTo(left - half, top + h + half);
    ctx.lineTo(left + w + half, top + h + half);
    ctx.lineTo(left + w + half, top);
    ctx.stroke();
    ctx.restore();
  }

  /** The fruit waiting to be dropped, plus a dashed line down to the floor. */
  private renderHeldFruit(
    layout: GameLayout,
    state: MergeState,
    cameraOffset: [number, number],
  ): void {
    const { radius, color } = FRUIT_LEVELS[state.heldLevel];
    const cx = state.heldX + cameraOffset[0];
    const cy = layout.dropY + cameraOffset[1];
    const floor = layout.container[1] + layout.container[3] + cameraOffset[1];

    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = GUIDE_COLOR;
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(cx, cy + radius);
    ctx.lineTo(cx, floor);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = this.colorToString(color);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  filterEntity(_entity: IEntity, _viewport: RectArea): boolean {
    return false;
  }
}
