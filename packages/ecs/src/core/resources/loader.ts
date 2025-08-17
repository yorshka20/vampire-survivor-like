import {
  explosionEffectAnimations,
  orcAnimations,
  playerAnimations,
  slimeAnimations,
  spiritEffectAnimations,
} from '@ecs/constants/resources/animation';
import { SpriteSheetLoader } from '@ecs/utils/SpriteSheetLoader';
import { ResourceManager } from './ResourceManager';

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
  await resourceManager.loadAudio('laser', '/assets/sounds/laser.mp3');
  await resourceManager.loadAudio('burst', '/assets/sounds/burst.mp3');
}

export async function initImageAssets() {
  const resourceManager = ResourceManager.getInstance();
  await resourceManager.loadImage('bg', '/assets/texture.png');
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
    {
      name: 'orc',
      url: '/assets/sprites/orc.png',
      frameWidth: 100,
      frameHeight: 100,
      animations: orcAnimations,
      cropScale: 0.5, // Crop center 50% to remove large transparent margins
    },
    {
      name: 'fireball_effect',
      url: '/assets/sprites/effects/04.png',
      frameWidth: 54,
      frameHeight: 54,
      animations: spiritEffectAnimations,
    },
    {
      name: 'explosion_effect',
      url: '/assets/sprites/effects/03.png',
      frameWidth: 64,
      frameHeight: 64,
      animations: explosionEffectAnimations,
    },
  ]);
}
