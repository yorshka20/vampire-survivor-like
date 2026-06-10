import { RenderComponent, ShapeComponent } from '@ecs/components';

export class RenderUtils {
  /**
   * Global experiment toggle: when false, the per-shape outline (stroke) is
   * skipped in {@link drawShape}. Each stroke is a separate anti-aliased outline
   * geometry — roughly doubling a path's GPU work — so this is the main lever for
   * the geometry-bound stress test. Lives here as a static so the test UI can flip
   * it without threading a flag through every render call.
   */
  static strokeShapes = true;

  /**
   * Draw a shape centered at `(cx, cy)` scaled by `scale`.
   *
   * The translation and per-entity scale are baked into the coordinates here so
   * callers can draw straight onto the shared layer context without pushing a
   * `save / translate / scale / restore` per entity — the dominant overhead at
   * high entity counts. With the default `(0, 0, 1)` it behaves exactly like the
   * old origin-centered draw, so callers that still set up a transform matrix
   * (e.g. rotated entities) keep working unchanged.
   */
  static drawShape(
    ctx: CanvasRenderingContext2D,
    render: RenderComponent,
    shape: ShapeComponent,
    cx = 0,
    cy = 0,
    scale = 1,
  ): void {
    const shapeType = shape.getType();
    // getSize() narrows the descriptor internally and returns [width, height]
    // (for circles it returns [diameter, diameter], so radius = width / 2).
    const [width, height] = shape.getSize();

    ctx.fillStyle = render.getColorString();
    switch (shapeType) {
      case 'line':
        // Orientation-based projectile: only meaningful under a rotation
        // transform, so it ignores cx/cy/scale and draws at the current origin.
        this.drawLineProjectile(ctx, width, height, render.getColorString());
        break;
      case 'circle':
        ctx.beginPath();
        ctx.arc(cx, cy, (width / 2) * scale, 0, Math.PI * 2);
        if (RenderUtils.strokeShapes) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2 * scale;
          ctx.stroke();
        }
        ctx.fill();
        break;
      case 'triangle': {
        const hw = (width / 2) * scale;
        const hh = (height / 2) * scale;
        ctx.beginPath();
        ctx.moveTo(cx, cy - hh);
        ctx.lineTo(cx + hw, cy + hh);
        ctx.lineTo(cx - hw, cy + hh);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'polygon':
      case 'parametric':
      case 'bezier': {
        // Draw the tessellated outline as a closed path. Falls back to a box if
        // the shape has no polyline form (shouldn't happen for these types).
        const outline = shape.getOutline();
        if (outline.length >= 3) {
          ctx.beginPath();
          ctx.moveTo(cx + outline[0][0] * scale, cy + outline[0][1] * scale);
          for (let i = 1; i < outline.length; i++) {
            ctx.lineTo(cx + outline[i][0] * scale, cy + outline[i][1] * scale);
          }
          ctx.closePath();
          ctx.fill();
          if (RenderUtils.strokeShapes) {
            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.lineWidth = 2 * scale;
            ctx.stroke();
          }
        } else {
          this.drawBox(ctx, width * scale, height * scale, cx, cy);
        }
        break;
      }
      case 'rect':
      case 'composite':
      case 'path':
      case 'text':
      default:
        this.drawBox(ctx, width * scale, height * scale, cx, cy);
        break;
    }
  }

  /** Filled rectangle with a faint outline, centered at `(cx, cy)`. */
  private static drawBox(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    cx = 0,
    cy = 0,
  ): void {
    const x = cx - width / 2;
    const y = cy - height / 2;
    ctx.fillRect(x, y, width, height);
    if (RenderUtils.strokeShapes) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, width, height);
    }
  }

  static drawPatternImage(
    ctx: CanvasRenderingContext2D,
    patternImage: HTMLImageElement,
    shape: ShapeComponent,
    cx = 0,
    cy = 0,
    scale = 1,
  ): void {
    const [sizeX, sizeY] = shape.getSize();

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

    drawWidth *= scale;
    drawHeight *= scale;

    // Center the image on (cx, cy)
    const x = cx - drawWidth / 2;
    const y = cy - drawHeight / 2;

    // Render pattern image
    ctx.drawImage(patternImage, x, y, drawWidth, drawHeight);
  }

  static drawLaser(
    ctx: CanvasRenderingContext2D,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    color: string,
  ): void {
    // Calculate laser lifetime (0 to 1)
    const lifeTime = (Date.now() % 1000) / 1000; // Animation cycle of 1 second
    const opacity = Math.sin(lifeTime * Math.PI); // Sine wave for smooth animation

    // Draw outer glow
    ctx.beginPath();
    ctx.shadowBlur = 20;
    ctx.shadowColor = color;
    ctx.lineWidth = 20;
    ctx.globalAlpha = 0.3 * opacity;
    ctx.strokeStyle = color;
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
    color: string,
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
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, thickness * 0.6);
    ctx.beginPath();
    ctx.moveTo(-halfLen, 0);
    ctx.lineTo(halfLen, 0);
    ctx.stroke();
  }
}
