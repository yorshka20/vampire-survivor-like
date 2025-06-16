import { RenderLayerIdentifier, RenderLayerPriority } from '@ecs/constants/renderLayerPriority';
import { RectArea } from '@ecs/utils/types';
import { CanvasRenderLayer } from '../base';

export class GridDebugLayer extends CanvasRenderLayer {
  private highlightedCells: string[] = [];
  private cellSize: number = 0;

  constructor(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, cellSize: number) {
    super(RenderLayerIdentifier.GRID_DEBUG, RenderLayerPriority.GRID_DEBUG, canvas, context);
    this.cellSize = cellSize;
  }

  update(deltaTime: number, viewport: RectArea, cameraOffset: [number, number]): void {
    this.clearCanvas(viewport, cameraOffset);
    if (!this.highlightedCells.length) return;
    this.ctx.save();
    this.ctx.globalAlpha = 0.5;
    this.ctx.strokeStyle = 'red';
    this.ctx.lineWidth = 2;
    this.ctx.font = '14px monospace';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    for (const cellKey of this.highlightedCells) {
      const [cellX, cellY] = cellKey.split(',').map(Number);
      const worldX = cellX * this.cellSize;
      const worldY = cellY * this.cellSize;
      const screenX = worldX - (viewport[0] - cameraOffset[0]);
      const screenY = worldY - (viewport[1] - cameraOffset[1]);

      // Draw cell border
      this.ctx.strokeRect(screenX, screenY, this.cellSize, this.cellSize);

      // Draw cell coordinates
      this.ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
      this.ctx.fillRect(screenX, screenY, this.cellSize, this.cellSize);

      // Draw cell coordinates text
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      this.ctx.fillText(cellKey, screenX + this.cellSize / 2, screenY + this.cellSize / 2);
    }
    this.ctx.restore();
  }

  // Set cells to highlight
  setHighlightedCells(cellKeys: string[]): void {
    this.highlightedCells = [...cellKeys];
  }

  // Clear all highlighted cells
  clearHighlightedCells(): void {
    this.highlightedCells.length = 0;
  }

  filterEntity(): boolean {
    return false; // Grid debug layer does not filter entities
  }
}
