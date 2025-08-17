import { RenderPatternType } from '@ecs/components';
import { PatternAssetManager } from './PatternAssetManager';

/**
 * Initialize pattern assets by preloading all required patterns
 * This should be called during game initialization
 */
export async function initPatternAssets(): Promise<void> {
  const patternTypes: RenderPatternType[] = [
    'player',
    'enemy',
    'heart',
    'star',
    'diamond',
    'triangle',
    'square',
    'circle',
    'rect',
    'exp',
    'magnet',
    'projectile',
    'burst',
  ];

  const patternManager = PatternAssetManager.getInstance();
  await patternManager.preloadPatterns(patternTypes);
}
