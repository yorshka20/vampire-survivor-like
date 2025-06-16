import { mount } from 'svelte';
import GameUI from './GameUI.svelte';
import { gameState } from './stores/gameState';
import { createVampireSurvivorsGame } from './vampireSurvivorsGame';

import './style.css';

async function initGame() {
  // Mount UI first, without initializing resources
  mount(GameUI, {
    target: document.body,
  });

  console.log('UI mounted');
}

// Start the game
initGame();

export async function createGame() {
  try {
    console.log('Starting game initialization...');
    const { game, player } = await createVampireSurvivorsGame(document.body);
    console.log('Game instance created');

    // Set game instance in store
    gameState.setGame(game);
    console.log('Game state set');

    // Set player in store
    gameState.setPlayer(player);
    console.log('Player set in store');

    (window as any).game = game;
    (window as any).player = player;
    (window as any).gameState = gameState;
  } catch (error) {
    console.error('Failed to initialize game:', error);
    document.body.innerHTML = `
      <div style="color: red; padding: 20px;">
        Failed to initialize game: ${error}
      </div>
    `;
  }
}
