/**
 * Game-side shared blackboard (data only, no logic), in the same spirit as the
 * world's RenderContext: systems write it, the overlay layer reads it, and the
 * UI receives snapshots through world.emit. One per game.
 */
export class MergeState {
  /** Fruit level currently held above the container, waiting to be dropped. */
  heldLevel = 0;
  /** World x of the held fruit (already clamped inside the container). */
  heldX = 0;
  /** False during the post-drop cooldown, when nothing is held. */
  heldVisible = true;
  /** Level that becomes held after the next drop. */
  nextLevel = 0;
  score = 0;
}

/** Outbound ECS → UI channel names (see World.emit / World.observe). */
export const MERGE_EVENTS = {
  /** Payload: {@link MergeSnapshot}. */
  state: 'merge:state',
} as const;

export interface MergeSnapshot {
  score: number;
  heldLevel: number;
  nextLevel: number;
}

export function snapshotOf(state: MergeState): MergeSnapshot {
  return {
    score: state.score,
    heldLevel: state.heldLevel,
    nextLevel: state.nextLevel,
  };
}
