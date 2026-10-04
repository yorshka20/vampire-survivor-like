import { System } from '@ecs';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { GAME_CONFIG } from '../config';
import { createFruit } from '../entities/fruit';
import { FRUIT_LEVELS, randomSpawnLevel } from '../fruits';
import { GameLayout } from '../layout';
import { MERGE_EVENTS, MergeState, snapshotOf } from '../state';

/**
 * Player input: the held fruit follows the pointer horizontally (clamped inside
 * the container) and a press drops it. After a drop the held slot is empty for
 * a short cooldown, then the queued "next" fruit becomes held.
 *
 * DOM handlers only record the latest pointer position / drop request; all game
 * state changes happen in update() on the logic tick.
 */
export class DropperSystem extends System {
  /** Latest pointer x in client (CSS) pixels; null until the pointer is seen. */
  private pointerClientX: number | null = null;
  private dropRequested = false;
  /** Seconds left before the next drop is allowed. */
  private cooldown = 0;

  constructor(
    private readonly rootElement: HTMLElement,
    private readonly layout: GameLayout,
    private readonly state: MergeState,
  ) {
    super('DropperSystem', SystemPriorities.INPUT, 'logic');
  }

  init(): void {
    super.init();
    const [x, , w] = this.layout.container;
    this.state.heldLevel = randomSpawnLevel();
    this.state.nextLevel = randomSpawnLevel();
    this.state.heldX = x + w / 2;
    this.state.heldVisible = true;

    // Pointer events cover mouse, touch and pen alike.
    this.rootElement.addEventListener('pointermove', this.handlePointerMove);
    this.rootElement.addEventListener('pointerdown', this.handlePointerDown);

    this.emitState();
  }

  destroy(): void {
    this.rootElement.removeEventListener('pointermove', this.handlePointerMove);
    this.rootElement.removeEventListener('pointerdown', this.handlePointerDown);
  }

  update(deltaTime: number): void {
    this.cooldown = Math.max(0, this.cooldown - deltaTime);

    if (this.pointerClientX !== null) {
      this.state.heldX = this.clampToContainer(this.clientToWorldX(this.pointerClientX));
    }

    // A press during the cooldown is dropped, not queued: queuing would fire a
    // surprise drop later.
    if (this.dropRequested) {
      this.dropRequested = false;
      if (this.cooldown === 0) {
        this.drop();
      }
    }

    this.state.heldVisible = this.cooldown === 0;
  }

  private drop(): void {
    const fruit = createFruit(this.world, {
      level: this.state.heldLevel,
      position: [this.state.heldX, this.layout.dropY],
    });
    this.world.addEntity(fruit);

    this.state.heldLevel = this.state.nextLevel;
    this.state.nextLevel = randomSpawnLevel();
    // The new held fruit may be larger: keep it inside the walls right away.
    this.state.heldX = this.clampToContainer(this.state.heldX);
    this.cooldown = GAME_CONFIG.dropCooldown;

    this.emitState();
  }

  private emitState(): void {
    this.world.emit(MERGE_EVENTS.state, () => snapshotOf(this.state));
  }

  /** Keep the held fruit's whole circle between the walls. */
  private clampToContainer(worldX: number): number {
    const [x, , w] = this.layout.container;
    const radius = FRUIT_LEVELS[this.state.heldLevel].radius;
    return Math.min(Math.max(worldX, x + radius), x + w - radius);
  }

  /**
   * Invert canvasPixel = zoom * (world + cameraOffset). The main canvas is not
   * DPR-scaled, so CSS pixels are lifted to device pixels first. View state is
   * read from the world's RenderContext, which RenderSystem refreshes each frame.
   */
  private clientToWorldX(clientX: number): number {
    const view = this.world.renderContext;
    const rect = this.rootElement.getBoundingClientRect();
    return ((clientX - rect.left) * view.dpr) / view.zoom - view.cameraOffset[0];
  }

  private handlePointerMove = (event: PointerEvent): void => {
    this.pointerClientX = event.clientX;
  };

  private handlePointerDown = (event: PointerEvent): void => {
    this.pointerClientX = event.clientX;
    this.dropRequested = true;
  };
}
