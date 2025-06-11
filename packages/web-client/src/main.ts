import { mount } from 'svelte';
import GameUI from './GameUI.svelte';
import { gameState } from './stores/gameState';
import { createVampireSurvivorsGame } from './vampireSurvivorsGame';

import './style.css';

const { game, player } = createVampireSurvivorsGame(document.body);

// set game instance in gameState store
gameState.setGame(game);
gameState.setPlayer(player);

// create ui
mount(GameUI, {
  target: document.body,
});

// expose game instance to window
(window as any).game = game;
(window as any).player = player;
