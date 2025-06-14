import { RenderPatternType } from '@ecs/components';
import { getEmojiBase64 } from '@ecs/utils/emojiToBase64';

/**
 * Pattern state type definition
 * This can be extended to include more states in the future
 */
export type PatternState = 'normal' | 'hit' | 'invincible' | 'powerup';

/**
 * Pattern effect type definition
 * This can be extended to include more effects in the future
 */
export type PatternEffect = 'whiteSilhouette' | 'glow' | 'blur';

/**
 * Pattern state configuration
 */
interface PatternStateConfig {
  effect: PatternEffect;
  params?: Record<string, any>; // Additional parameters for the effect
}

/**
 * Pattern asset manager for handling pattern images and their various states/effects
 */
export class PatternAssetManager {
  private static instance: PatternAssetManager;

  // Cache for original patterns
  private patternCache: Map<RenderPatternType, HTMLImageElement> = new Map();

  // Cache for pattern states/effects
  // Structure: Map<patternType, Map<state, Map<effect, image>>>
  private stateEffectCache: Map<
    RenderPatternType,
    Map<PatternState, Map<PatternEffect, HTMLImageElement>>
  > = new Map();

  // Track loading promises to prevent duplicate loading
  private loadingPromises: Map<string, Promise<void>> = new Map();

  private constructor() {}

  static getInstance(): PatternAssetManager {
    if (!PatternAssetManager.instance) {
      PatternAssetManager.instance = new PatternAssetManager();
    }
    return PatternAssetManager.instance;
  }

  /**
   * Preload all required patterns and their effects
   * @param patternTypes Array of pattern types to preload
   */
  async preloadPatterns(patternTypes: RenderPatternType[]): Promise<void> {
    const loadPromises = patternTypes.map((type) => this.ensurePatternLoaded(type));
    await Promise.all(loadPromises);
  }

  /**
   * Ensure a pattern is loaded and cached
   */
  private async ensurePatternLoaded(patternType: RenderPatternType): Promise<void> {
    const cacheKey = patternType;
    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey)!;
    }

    const loadPromise = (async () => {
      if (!this.patternCache.has(patternType)) {
        const pattern = await this.createPattern(patternType);
        if (pattern) {
          this.patternCache.set(patternType, pattern);
          // Preload all state effects for this pattern
          await this.preloadStateEffects(patternType);
        }
      }
    })();

    this.loadingPromises.set(cacheKey, loadPromise);
    return loadPromise;
  }

  /**
   * Preload all state effects for a pattern
   */
  private async preloadStateEffects(patternType: RenderPatternType): Promise<void> {
    const basePattern = this.patternCache.get(patternType);
    if (!basePattern) return;

    const states: PatternState[] = ['normal', 'hit'];
    const effects: PatternEffect[] = ['whiteSilhouette'];

    for (const state of states) {
      for (const effect of effects) {
        const cacheKey = `${patternType}-${state}-${effect}`;
        if (!this.loadingPromises.has(cacheKey)) {
          const loadPromise = (async () => {
            const modifiedPattern = await this.applyEffect(basePattern, effect);
            if (modifiedPattern) {
              if (!this.stateEffectCache.has(patternType)) {
                this.stateEffectCache.set(patternType, new Map());
              }
              const patternStateMap = this.stateEffectCache.get(patternType)!;
              if (!patternStateMap.has(state)) {
                patternStateMap.set(state, new Map());
              }
              patternStateMap.get(state)!.set(effect, modifiedPattern);
            }
          })();
          this.loadingPromises.set(cacheKey, loadPromise);
        }
      }
    }
  }

  /**
   * Get a pattern image synchronously
   */
  getPattern(patternType: RenderPatternType): HTMLImageElement | null {
    return this.patternCache.get(patternType) ?? null;
  }

  /**
   * Get a pattern with state and effect synchronously
   */
  getPatternWithState(
    patternType: RenderPatternType,
    state: PatternState,
    effect: PatternEffect,
  ): HTMLImageElement | null {
    return this.stateEffectCache.get(patternType)?.get(state)?.get(effect) ?? null;
  }

  /**
   * Create a new pattern image from emoji
   */
  private async createPattern(patternType: RenderPatternType): Promise<HTMLImageElement | null> {
    const emoji = getRenderPattern(patternType);
    if (!emoji) return null;

    const base64 = getEmojiBase64(emoji);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = base64;
    });
  }

  /**
   * Apply an effect to a pattern image
   */
  private async applyEffect(
    basePattern: HTMLImageElement,
    effect: PatternEffect,
  ): Promise<HTMLImageElement | null> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    canvas.width = basePattern.width;
    canvas.height = basePattern.height;
    ctx.drawImage(basePattern, 0, 0);

    switch (effect) {
      case 'whiteSilhouette':
        return this.applyWhiteSilhouetteEffect(ctx, canvas);
      case 'glow':
        return this.applyGlowEffect(ctx, canvas);
      default:
        return basePattern;
    }
  }

  /**
   * Apply white silhouette effect
   */
  private async applyWhiteSilhouetteEffect(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
  ): Promise<HTMLImageElement> {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 0) {
        data[i] = 255; // R
        data[i + 1] = 255; // G
        data[i + 2] = 255; // B
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return this.canvasToImage(canvas);
  }

  /**
   * Apply glow effect (placeholder for future implementation)
   */
  private async applyGlowEffect(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
  ): Promise<HTMLImageElement> {
    // TODO: Implement glow effect
    return this.canvasToImage(canvas);
  }

  /**
   * Convert canvas to image
   */
  private async canvasToImage(canvas: HTMLCanvasElement): Promise<HTMLImageElement> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = canvas.toDataURL();
    });
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.patternCache.clear();
    this.stateEffectCache.clear();
    this.loadingPromises.clear();
  }
}

function getRenderPattern(patternType: string) {
  switch (patternType) {
    case 'player':
      return '😮';
    case 'enemy':
      return '👹';
    case 'heart':
      return '💖';
    case 'star':
      return '⭐';
    case 'diamond':
      return '💎';
    case 'exp':
      return '📙';
    case 'magnet':
      return '🧲';
    case 'projectile':
      return '💣';
    default:
      return '';
  }
}
