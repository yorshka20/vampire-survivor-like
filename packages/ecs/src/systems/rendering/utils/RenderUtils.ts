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
      case 'line':
        this.drawLineProjectile(ctx, sizeX, sizeY, color);
        break;
      case 'circle':
        ctx.beginPath();
        ctx.arc(0, 0, sizeX / 2, 0, Math.PI * 2);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
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

  static drawLaser(
    ctx: CanvasRenderingContext2D,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    color: Color,
  ): void {
    // Calculate laser lifetime (0 to 1)
    const lifeTime = (Date.now() % 1000) / 1000; // Animation cycle of 1 second
    const opacity = Math.sin(lifeTime * Math.PI); // Sine wave for smooth animation

    // Draw outer glow
    ctx.beginPath();
    ctx.shadowBlur = 20;
    ctx.shadowColor = this.colorToString(color);
    ctx.lineWidth = 20;
    ctx.globalAlpha = 0.3 * opacity;
    ctx.strokeStyle = this.colorToString(color);
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Draw middle layer
    ctx.beginPath();
    ctx.shadowBlur = 10;
    ctx.lineWidth = 15;
    ctx.globalAlpha = 0.5 * opacity;
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Draw core
    ctx.beginPath();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 5;
    ctx.globalAlpha = opacity;
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Reset context properties
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.closePath();
  }

  /**
   * Draw a small glowing line projectile centered at origin, oriented by canvas rotation
   */
  static drawLineProjectile(
    ctx: CanvasRenderingContext2D,
    length: number,
    thickness: number,
    color: Color = { r: 255, g: 255, b: 180, a: 1 },
  ): void {
    const halfLen = length / 2;

    // Outer glow
    ctx.strokeStyle = 'rgba(255,255,200,0.85)';
    ctx.lineWidth = Math.max(1, thickness);
    ctx.lineCap = 'round';
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(255,255,200,0.8)';
    ctx.beginPath();
    ctx.moveTo(-halfLen, 0);
    ctx.lineTo(halfLen, 0);
    ctx.stroke();

    // Core
    ctx.shadowBlur = 0;
    ctx.strokeStyle = this.colorToString(color);
    ctx.lineWidth = Math.max(1, thickness * 0.6);
    ctx.beginPath();
    ctx.moveTo(-halfLen, 0);
    ctx.lineTo(halfLen, 0);
    ctx.stroke();
  }
}
