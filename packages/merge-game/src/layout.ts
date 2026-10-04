import { RectArea } from '@ecs/types/types';
import { GAME_CONFIG } from './config';

/**
 * Where the container sits in world space and the zoom that fits it on screen.
 *
 * The camera offset stays [0, 0], so canvas pixel = zoom * worldPos. Instead of
 * moving the camera we place the container at a world origin that lands centered
 * on screen after zooming.
 */
export interface GameLayout {
  zoom: number;
  /** Container interior in world space: [x, y, width, height]. */
  container: RectArea;
  /** World y at which held fruits hover / are dropped from. */
  dropY: number;
}

/**
 * @param viewport the renderer viewport in canvas (device) pixels
 */
export function computeLayout(viewport: RectArea): GameLayout {
  const { container, dropZoneHeight, screenPadding } = GAME_CONFIG;
  const totalWidth = container.width + screenPadding * 2;
  const totalHeight = dropZoneHeight + container.height + screenPadding * 2;

  const zoom = Math.min(viewport[2] / totalWidth, viewport[3] / totalHeight);

  // Visible world size at this zoom; center the content block inside it.
  const visibleWidth = viewport[2] / zoom;
  const visibleHeight = viewport[3] / zoom;
  const left = (visibleWidth - container.width) / 2;
  const blockTop = (visibleHeight - (dropZoneHeight + container.height)) / 2;
  const top = blockTop + dropZoneHeight;

  return {
    zoom,
    container: [left, top, container.width, container.height],
    dropY: blockTop + dropZoneHeight / 2,
  };
}
