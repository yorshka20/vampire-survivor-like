import { RenderPatternType } from '@ecs/components';
import { playerAnimations, slimeAnimations } from '@ecs/constants/resources/animation';
import { RenderSystem } from '@ecs/systems/rendering/RenderSystem';
import { SpriteSheetLoader } from '@ecs/utils/SpriteSheetLoader';
import { PatternAssetManager } from './PatternAssetManager';
import { ResourceManager } from './ResourceManager';

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
  ];

  const patternManager = PatternAssetManager.getInstance();
  await patternManager.preloadPatterns(patternTypes);
}

export async function initAudioAssets() {
  const resourceManager = ResourceManager.getInstance();
  await resourceManager.loadAudio('bgm', '/assets/music/time_for_adventure.mp3');
  await resourceManager.loadAudio('coin', '/assets/sounds/coin.wav');
  await resourceManager.loadAudio('death', '/assets/sounds/death.mp3');
  await resourceManager.loadAudio('explosion', '/assets/sounds/explosion.wav');
  await resourceManager.loadAudio('hit', '/assets/sounds/hit.mp3');
  await resourceManager.loadAudio('hurt', '/assets/sounds/hurt.wav');
  await resourceManager.loadAudio('jump', '/assets/sounds/jump.wav');
  await resourceManager.loadAudio('power_up', '/assets/sounds/power_up.wav');
  await resourceManager.loadAudio('tap', '/assets/sounds/tap.wav');
}

export async function initImageAssets(renderSystem: RenderSystem) {
  const resourceManager = ResourceManager.getInstance();
  await resourceManager.loadImage('bg', '/assets/texture.png');
  const bg = resourceManager.getImage('bg');
  if (bg) {
    renderSystem.setBackgroundImage(bg);
  }
}

export async function initSpriteSheetAssets() {
  const spriteLoader = SpriteSheetLoader.getInstance();
  await spriteLoader.preloadSpriteSheets([
    {
      name: 'knight',
      url: '/assets/sprites/knight.png',
      frameWidth: 32,
      frameHeight: 32,
      animations: playerAnimations,
    },
    {
      name: 'slime_green',
      url: '/assets/sprites/slime_green.png',
      frameWidth: 24,
      frameHeight: 24,
      animations: slimeAnimations,
    },
  ]);
}
