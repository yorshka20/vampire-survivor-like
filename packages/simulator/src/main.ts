import { mount } from 'svelte';
import GameUI from './ui/GameUI.svelte';
import RenderingTest from './ui/RenderingTest.svelte';

// Tiny hash router. Each app owns process-wide singletons (Game / RenderSystem /
// GameStore), so switching routes does a fresh boot rather than trying to tear
// those down and re-init in place.
//
//   #/rendering-test  -> high-count render benchmark (pan/zoom + HUD)
//   (anything else)   -> the main simulator
function resolveRoute() {
  const hash = window.location.hash;
  if (hash === '#/rendering-test') {
    return RenderingTest;
  }
  return GameUI;
}

mount(resolveRoute(), {
  target: document.body,
});

window.addEventListener('hashchange', () => window.location.reload());
