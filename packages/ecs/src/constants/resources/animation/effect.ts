import { AnimationData } from '@ecs/types/animation';

/**
 * Spirit effect animations - 8 different colored spirit effects
 * Each spirit has 12 frames showing expansion and fade animation
 * Sprite sheet layout: 8 rows x 12 columns
 * Row 0: Orange/Yellow spirit
 * Row 1: Purple/Pink spirit
 * Row 2: Light Blue/Cyan spirit
 * Row 3: Green/Lime spirit
 * Row 4: Brown/Orange-Brown spirit
 * Row 5: White/Grey spirit
 * Row 6: Red/Orange-Red spirit
 * Row 7: Blue/Indigo spirit
 */
export const spiritEffectAnimations = new Map<string, AnimationData>([
  // Orange/Yellow spirit (Row 0)
  [
    'spirit_orange',
    {
      frames: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], // Frames 0-11 (first row)
      frameDuration: 0.1, // Fast expansion and fade effect
      loop: false, // One-shot animation
    },
  ],

  // Purple/Pink spirit (Row 1)
  [
    'spirit_purple',
    {
      frames: [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], // Frames 12-23 (second row)
      frameDuration: 0.1,
      loop: false,
    },
  ],

  // Light Blue/Cyan spirit (Row 2)
  [
    'spirit_cyan',
    {
      frames: [24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35], // Frames 24-35 (third row)
      frameDuration: 0.1,
      loop: false,
    },
  ],

  // Green/Lime spirit (Row 3)
  [
    'spirit_green',
    {
      frames: [36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47], // Frames 36-47 (fourth row)
      frameDuration: 0.1,
      loop: false,
    },
  ],

  // Brown/Orange-Brown spirit (Row 4)
  [
    'spirit_brown',
    {
      frames: [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59], // Frames 48-59 (fifth row)
      frameDuration: 0.1,
      loop: false,
    },
  ],

  // White/Grey spirit (Row 5)
  [
    'spirit_white',
    {
      frames: [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71], // Frames 60-71 (sixth row)
      frameDuration: 0.1,
      loop: false,
    },
  ],

  // Red/Orange-Red spirit (Row 6)
  [
    'spirit_red',
    {
      frames: [72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83], // Frames 72-83 (seventh row)
      frameDuration: 0.1,
      loop: false,
    },
  ],

  // Blue/Indigo spirit (Row 7)
  [
    'spirit_blue',
    {
      frames: [84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95], // Frames 84-95 (eighth row)
      frameDuration: 0.1,
      loop: false,
    },
  ],

  // Loop versions for continuous spirit effects
  [
    'spirit_orange_loop',
    {
      frames: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      frameDuration: 0.15, // Slightly slower for looping
      loop: true,
    },
  ],

  [
    'spirit_purple_loop',
    {
      frames: [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
      frameDuration: 0.15,
      loop: true,
    },
  ],

  [
    'spirit_cyan_loop',
    {
      frames: [24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35],
      frameDuration: 0.15,
      loop: true,
    },
  ],

  [
    'spirit_green_loop',
    {
      frames: [36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47],
      frameDuration: 0.15,
      loop: true,
    },
  ],

  [
    'spirit_brown_loop',
    {
      frames: [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59],
      frameDuration: 0.15,
      loop: true,
    },
  ],

  [
    'spirit_white_loop',
    {
      frames: [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71],
      frameDuration: 0.15,
      loop: true,
    },
  ],

  [
    'spirit_red_loop',
    {
      frames: [72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83],
      frameDuration: 0.15,
      loop: true,
    },
  ],

  [
    'spirit_blue_loop',
    {
      frames: [84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95],
      frameDuration: 0.15,
      loop: true,
    },
  ],
]);

// once
// const orangeSpirit = spiritEffectAnimations.get('spirit_orange');

// loop
// const purpleSpiritLoop = spiritEffectAnimations.get('spirit_purple_loop');

/**
 * Explosion spirit animations - 8 different colored explosion effects
 * Each explosion has 12 frames showing burst, expand, and dissipate animation
 * Sprite sheet layout: 8 rows x 12 columns (same as spirit effects)
 * Perfect for weapon impacts, enemy deaths, and magical explosions
 * Row 0: Orange/Yellow explosion (fire/energy)
 * Row 1: Purple/Pink explosion (magic/void)
 * Row 2: Light Blue/Cyan explosion (ice/water)
 * Row 3: Green/Lime explosion (nature/poison)
 * Row 4: Brown/Orange-Brown explosion (earth/stone)
 * Row 5: White/Grey explosion (light/holy)
 * Row 6: Red/Orange-Red explosion (fire/blood)
 * Row 7: Blue/Indigo explosion (lightning/arcane)
 */
export const explosionEffectAnimations = new Map<string, AnimationData>([
  // Orange/Yellow explosion (Row 0) - Fire/Energy type
  [
    'explosion_fire',
    {
      frames: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], // Frames 0-11 (first row)
      frameDuration: 0.2 / 13, // Fast burst effect for explosions
      loop: false, // One-shot explosion
    },
  ],

  // Purple/Pink explosion (Row 1) - Magic/Void type
  [
    'explosion_magic',
    {
      frames: [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], // Frames 12-23 (second row)
      frameDuration: 0.2 / 13,
      loop: false,
    },
  ],

  // Light Blue/Cyan explosion (Row 2) - Ice/Water type
  [
    'explosion_ice',
    {
      frames: [24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35], // Frames 24-35 (third row)
      frameDuration: 0.2 / 13,
      loop: false,
    },
  ],

  // Green/Lime explosion (Row 3) - Nature/Poison type
  [
    'explosion_nature',
    {
      frames: [36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47], // Frames 36-47 (fourth row)
      frameDuration: 0.2 / 13,
      loop: false,
    },
  ],

  // Brown/Orange-Brown explosion (Row 4) - Earth/Stone type
  [
    'explosion_earth',
    {
      frames: [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59], // Frames 48-59 (fifth row)
      frameDuration: 0.2 / 13,
      loop: false,
    },
  ],

  // White/Grey explosion (Row 5) - Light/Holy type
  [
    'explosion_holy',
    {
      frames: [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71], // Frames 60-71 (sixth row)
      frameDuration: 0.2 / 13,
      loop: false,
    },
  ],

  // Red/Orange-Red explosion (Row 6) - Fire/Blood type
  [
    'explosion_blood',
    {
      frames: [72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83], // Frames 72-83 (seventh row)
      frameDuration: 0.2 / 13,
      loop: false,
    },
  ],

  // Blue/Indigo explosion (Row 7) - Lightning/Arcane type
  [
    'explosion_lightning',
    {
      frames: [84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95], // Frames 84-95 (eighth row)
      frameDuration: 0.2 / 13,
      loop: false,
    },
  ],

  // Slower explosion variants for dramatic effects
  [
    'explosion_fire_slow',
    {
      frames: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      frameDuration: 0.2 / 13, // Slower for dramatic effect
      loop: false,
    },
  ],

  [
    'explosion_magic_slow',
    {
      frames: [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
      frameDuration: 0.2 / 13,
      loop: false,
    },
  ],

  [
    'explosion_ice_slow',
    {
      frames: [24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35],
      frameDuration: 0.2 / 13,
      loop: false,
    },
  ],

  [
    'explosion_nature_slow',
    {
      frames: [36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47],
      frameDuration: 0.2 / 13,
      loop: false,
    },
  ],

  [
    'explosion_earth_slow',
    {
      frames: [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59],
      frameDuration: 0.2 / 13,
      loop: false,
    },
  ],

  [
    'explosion_holy_slow',
    {
      frames: [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71],
      frameDuration: 0.2 / 13,
      loop: false,
    },
  ],

  [
    'explosion_blood_slow',
    {
      frames: [72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83],
      frameDuration: 0.2 / 13,
      loop: false,
    },
  ],

  [
    'explosion_lightning_slow',
    {
      frames: [84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95],
      frameDuration: 0.2 / 13,
      loop: false,
    },
  ],
]);

// // attack
// const fireExplosion = explosionEffectAnimations.get('explosion_fire');

// // death
// const bloodExplosion = explosionEffectAnimations.get('explosion_blood_slow');

// // magic
// const magicExplosion = explosionEffectAnimations.get('explosion_magic');

// // ice
// const iceExplosion = explosionEffectAnimations.get('explosion_ice');
