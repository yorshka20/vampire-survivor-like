import { RectArea } from '@ecs/types/types';
import { RenderLayerIdentifier, RenderLayerPriority } from '../../constant';
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

    // draw grid layout
    this.renderGridLayout(viewport, cameraOffset);

    // highlight cells
    this.renderHighlightedCells(viewport, cameraOffset);
  }

  private renderGridLayout(viewport: RectArea, cameraOffset: [number, number]): void {
    // draw grid layout with 100*100 cells
    this.ctx.save();
    this.ctx.globalAlpha = 0.3;
    this.ctx.strokeStyle = '#888';
    this.ctx.lineWidth = 1;
    this.ctx.font = '12px monospace';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    // calculate viewport top left world coordinates
    const worldLeft = viewport[0] - cameraOffset[0];
    const worldTop = viewport[1] - cameraOffset[1];
    const worldRight = worldLeft + viewport[2];
    const worldBottom = worldTop + viewport[3];
    const cellSize = 100;
    // round to nearest cell boundary
    const startX = Math.floor(worldLeft / cellSize) * cellSize;
    const startY = Math.floor(worldTop / cellSize) * cellSize;
    const endX = Math.ceil(worldRight / cellSize) * cellSize;
    const endY = Math.ceil(worldBottom / cellSize) * cellSize;
    for (let x = startX; x < endX; x += cellSize) {
      for (let y = startY; y < endY; y += cellSize) {
        // screen coordinates
        const screenX = x - worldLeft;
        const screenY = y - worldTop;
        // draw cell border
        this.ctx.strokeRect(screenX, screenY, cellSize, cellSize);
        // draw cell center world coordinates
        const centerX = screenX + cellSize / 2;
        const centerY = screenY + cellSize / 2;
        this.ctx.fillStyle = 'rgba(255,255,255,0.8)';
        this.ctx.fillText(`(${x},${y})`, centerX, centerY);
      }
    }
    this.ctx.restore();
  }

  private renderHighlightedCells(viewport: RectArea, cameraOffset: [number, number]): void {
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
