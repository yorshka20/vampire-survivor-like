import { Entity, PhysicsComponent, System, TransformComponent } from '@ecs';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Point, Vec2 } from '@ecs/utils';
import { FruitComponent } from '../components/FruitComponent';
import { GAME_CONFIG } from '../config';
import { createFruit } from '../entities/fruit';
import { FRUIT_LEVELS, MAX_FRUIT_LEVEL } from '../fruits';
import { MERGE_EVENTS, MergeState, snapshotOf } from '../state';

interface PendingMerge {
  a: Entity;
  b: Entity;
  level: number;
}

/**
 * Two touching fruits of the same level merge into one fruit of the next level
 * at their midpoint, inheriting their average velocity.
 *
 * Runs right after collision resolution. The solver pushes bodies apart, so
 * "touching" uses a small tolerance (GAME_CONFIG.mergeContactSlop) instead of
 * requiring overlap. The fruit count stays small (tens), so a plain O(n^2) pair
 * scan is cheaper than going through the spatial grid. The collision system
 * exposes no contact events, which is why this does its own narrow phase.
 *
 * Merges are collected first and applied after the scan, and each fruit takes
 * part in at most one merge per tick, so chains resolve over successive ticks.
 */
export class MergeSystem extends System {
  private readonly merged = new Set<Entity>();
  private readonly pending: PendingMerge[] = [];

  constructor(private readonly state: MergeState) {
    // Right after COLLISION (900); DAMAGE (901) etc. are not registered in this game.
    super('MergeSystem', (SystemPriorities.COLLISION + 50) as SystemPriorities, 'logic');
  }

  update(): void {
    const fruits = this.world.getEntitiesWithComponents([FruitComponent, TransformComponent]);
    this.findMerges(fruits);
    if (this.pending.length === 0) {
      return;
    }

    for (const merge of this.pending) {
      this.applyMerge(merge);
    }
    this.pending.length = 0;
    this.merged.clear();

    this.world.emit(MERGE_EVENTS.state, () => snapshotOf(this.state));
  }

  private findMerges(fruits: Entity[]): void {
    const slop = GAME_CONFIG.mergeContactSlop;
    for (let i = 0; i < fruits.length; i++) {
      const a = fruits[i];
      if (a.toRemove || this.merged.has(a)) {
        continue;
      }
      const level = getLevel(a);
      if (level >= MAX_FRUIT_LEVEL) {
        continue;
      }
      const reach = FRUIT_LEVELS[level].radius * 2 + slop;
      const [ax, ay] = getPosition(a);

      for (let j = i + 1; j < fruits.length; j++) {
        const b = fruits[j];
        if (b.toRemove || this.merged.has(b) || getLevel(b) !== level) {
          continue;
        }
        const [bx, by] = getPosition(b);
        const dx = bx - ax;
        const dy = by - ay;
        if (dx * dx + dy * dy <= reach * reach) {
          this.merged.add(a);
          this.merged.add(b);
          this.pending.push({ a, b, level });
          break;
        }
      }
    }
  }

  private applyMerge({ a, b, level }: PendingMerge): void {
    const [ax, ay] = getPosition(a);
    const [bx, by] = getPosition(b);
    const position: Point = [(ax + bx) / 2, (ay + by) / 2];
    const [avx, avy] = getVelocity(a);
    const [bvx, bvy] = getVelocity(b);
    const velocity: Vec2 = [(avx + bvx) / 2, (avy + bvy) / 2];

    // Remove first: the new fruit must not be paired with its own parents.
    this.world.removeEntity(a);
    this.world.removeEntity(b);

    const nextLevel = level + 1;
    this.world.addEntity(createFruit(this.world, { level: nextLevel, position, velocity }));
    this.state.score += FRUIT_LEVELS[nextLevel].score;
  }
}

function getLevel(entity: Entity): number {
  return entity.getComponent<FruitComponent>(FruitComponent.componentName).level;
}

function getPosition(entity: Entity): Point {
  return entity.getComponent<TransformComponent>(TransformComponent.componentName).getPosition();
}

function getVelocity(entity: Entity): Vec2 {
  return entity.getComponent<PhysicsComponent>(PhysicsComponent.componentName).getVelocity();
}
