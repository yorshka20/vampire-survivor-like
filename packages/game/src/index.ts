// Export core game classes
export { Game } from './core/Game';
export type { Viewport } from './core/Game';
export { GameLoop } from './core/GameLoop';

// Export game entities (only Player for now)
export * from './entities/Player';

// Export game-specific utilities
export * from './utils';
