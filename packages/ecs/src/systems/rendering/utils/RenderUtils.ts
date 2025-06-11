import { RenderComponent } from '@ecs/components';
import { Color } from '@ecs/utils/types';

export class RenderUtils {
  static colorToString(color: Color): string {
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
  }

  static drawShape(
    ctx: CanvasRenderingContext2D,
    render: RenderComponent,
    sizeX: number,
    sizeY: number,
  ): void {
    const color = render.getColor();
    const shape = render.getShape();

    ctx.fillStyle = this.colorToString(color);
    switch (shape) {
      case 'circle':
        ctx.beginPath();
        ctx.arc(0, 0, sizeX / 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'triangle':
        ctx.beginPath();
        ctx.moveTo(0, -sizeY / 2);
        ctx.lineTo(sizeX / 2, sizeY / 2);
        ctx.lineTo(-sizeX / 2, sizeY / 2);
        ctx.closePath();
        ctx.fill();
        break;
      case 'rect':
      default:
        ctx.fillRect(-sizeX / 2, -sizeY / 2, sizeX, sizeY);
        break;
    }
  }

  static drawPatternImage(
    ctx: CanvasRenderingContext2D,
    patternImage: HTMLImageElement,
    sizeX: number,
    sizeY: number,
  ): void {
    // Calculate dimensions to maintain aspect ratio
    const aspectRatio = patternImage.width / patternImage.height;
    let drawWidth = sizeX;
    let drawHeight = sizeY;

    if (sizeX / sizeY > aspectRatio) {
      // Height is the limiting factor
      drawWidth = sizeY * aspectRatio;
    } else {
      // Width is the limiting factor
      drawHeight = sizeX / aspectRatio;
    }

    // Center the image
    const x = -drawWidth / 2;
    const y = -drawHeight / 2;

    // Render pattern image
    ctx.drawImage(patternImage, x, y, drawWidth, drawHeight);
  }
}
