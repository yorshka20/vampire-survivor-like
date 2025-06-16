import { ResourceManager } from '@ecs/core/resources/ResourceManager';
import { RenderSystem } from '@ecs/systems/rendering/RenderSystem';
import { AnimationData } from '@ecs/types/animation';
import { SpriteSheetLoader } from '@ecs/utils/SpriteSheetLoader';

// Define animations for different entities
const knightAnimations = new Map<string, AnimationData>([
  [
    'idle',
    {
      frames: [0, 1, 2, 3],
      frameDuration: 0.2,
      loop: true,
    },
  ],
  [
    'walk',
    {
      frames: [4, 5, 6, 7],
      frameDuration: 0.15,
      loop: true,
    },
  ],
]);

const slimeAnimations = new Map([
  [
    'idle',
    {
      frames: [0, 1],
      frameDuration: 0.8,
      loop: true,
    },
  ],
  [
    'walk',
    {
      frames: [2, 3, 4, 5],
      frameDuration: 0.15,
      loop: true,
    },
  ],
  [
    'jump',
    {
      frames: [6, 7],
      frameDuration: 0.2,
      loop: false,
    },
  ],
  [
    'hurt',
    {
      frames: [8],
      frameDuration: 0.1,
      loop: false,
    },
  ],
  [
    'attack',
    {
      frames: [9, 10],
      frameDuration: 0.12,
      loop: false,
    },
  ],
]);

// Load all game resources
export async function loadGameResources(renderSystem: RenderSystem) {
  const resourceManager = ResourceManager.getInstance();

  await resourceManager.loadImage('bg', '/assets/texture.png');
  const bg = resourceManager.getImage('bg');
  if (bg) {
    renderSystem.setBackgroundImage(bg);
  }
  console.log('Background image loaded');

  // Load audio
  await resourceManager.loadAudio('bgm', '/assets/music/time_for_adventure.mp3');
  await resourceManager.loadAudio('coin', '/assets/sounds/coin.wav');
  await resourceManager.loadAudio('death', '/assets/sounds/death.mp3');
  await resourceManager.loadAudio('explosion', '/assets/sounds/explosion.wav');
  await resourceManager.loadAudio('hit', '/assets/sounds/hit.mp3');
  await resourceManager.loadAudio('hurt', '/assets/sounds/hurt.wav');
  await resourceManager.loadAudio('jump', '/assets/sounds/jump.wav');
  await resourceManager.loadAudio('power_up', '/assets/sounds/power_up.wav');
  await resourceManager.loadAudio('tap', '/assets/sounds/tap.wav');
  console.log('Audio resources loaded');

  // Load sprite sheets
  const spriteLoader = SpriteSheetLoader.getInstance();
  await spriteLoader.preloadSpriteSheets([
    {
      name: 'knight',
      url: '/assets/sprites/knight.png',
      frameWidth: 32,
      frameHeight: 32,
      animations: knightAnimations,
    },
    {
      name: 'slime_green',
      url: '/assets/sprites/slime_green.png',
      frameWidth: 24,
      frameHeight: 24,
      animations: slimeAnimations,
    },
  ]);
  console.log('Sprite sheets loaded');
}
