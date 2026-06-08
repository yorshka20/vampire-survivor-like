# Debugging Guide

A practical guide to debugging this Vampire-Survivors–like game. It is written around
the actual architecture of this repo (an ECS engine + a canvas2d renderer), and ends with
a real case study.

---

## 1. Architecture you must keep in mind

The game is an **ECS** (Entity-Component-System) running on **two independent loops**.

### Two loops, two system categories

`GameLoop` ([packages/web-client/src/game/GameLoop.ts](../packages/web-client/src/game/GameLoop.ts)) drives the world with two separate clocks:

| Loop | Driver | Calls | Runs systems whose category is | Timestep |
|------|--------|-------|--------------------------------|----------|
| Logic | `setInterval` | `world.updateLogic(dt)` | `'logic'` (or `'both'`) | **fixed** (`1 / (15 * speedMultiplier)`) |
| Render | `requestAnimationFrame` | `world.updateRender(dt)` | `'render'` (or `'both'`) | **variable** (real frame delta) |

A system declares its category in its `super(name, priority, category)` call. Examples:

- `PhysicsSystem`, `AISystem`, `ChaseSystem`, `InputSystem` → `'logic'`
- `TransformSystem`, `AnimationSystem`, `RenderSystem` → `'render'`

> **Gotcha:** logic and render run at different rates and on different clocks. A value set
> by a render-category system is read by a logic-category system on a *different* tick. When
> chasing "why didn't my change take effect this frame", first check which loop each system
> is on. See `World.updateLogic` / `World.updateRender` in
> [packages/ecs/src/core/ecs/World.ts](../packages/ecs/src/core/ecs/World.ts).

### Execution order = priority, not registration order

Systems run sorted by `SystemPriorities` (lower number = earlier), defined in
[packages/ecs/src/constants/systemPriorities.ts](../packages/ecs/src/constants/systemPriorities.ts).
Current order of the movement-relevant systems:

```
INPUT (200) → AI (400) → CHASE (600) → PHYSICS (700) → TRANSFORM (800) → ... → RENDER (9999)
```

Note `PHYSICS (700)` integrates position *before* `TRANSFORM (800)` sets the player's
velocity from input — so input-driven velocity is applied on the next physics tick, not the
same one.

### The movement pipeline

```
keyboard ─▶ InputSystem ─▶ InputComponent.state
                                  │
   (render loop) TransformSystem ─┴▶ PhysicsComponent.setVelocity()   // player
   (logic loop)  AISystem / ChaseSystem ─▶ PhysicsComponent.setVelocity()  // enemies
                                  │
   (logic loop)  PhysicsSystem ───┴▶ transform.position += velocity * deltaTime
                                  │
   (render loop) RenderSystem + RenderLayers ─▶ screen = cameraOffset + worldPos
```

Projectiles are special: their velocity is set **once** at creation, directly in the
`PhysicsComponent` constructor — so they bypass `setVelocity()` (and its `maxSpeed` clamp)
and only depend on `PhysicsSystem`. If projectiles move but characters don't, the difference
is almost always in the *velocity-driver* systems (Input/Transform/AI/Chase), not in
`PhysicsSystem`.

### Camera-follow

`RenderSystem.setCameraFollow(playerId)` makes the camera track the player. Each frame
`updateCameraOffset()` computes:

```
cameraOffset = viewportCenter - playerWorldPos
```

and every layer renders an entity at `screen = cameraOffset + entityWorldPos`
([RenderLayer / EntityRenderLayer](../packages/render/src/canvas2d/layers/EntityRenderLayer.ts)).
Consequence: **the followed player is always pinned to the center of the screen by
construction.** "The player isn't moving" is therefore expected *visually* — what should
move is the **world** (background + other entities). Always reason in **world space**, not
screen space.

---

## 2. First triage: is it a logic bug or a render bug?

This single question saves the most time. Answer it before anything else.

> Log the entity's **world-space** `transform.getPosition()` over time (throttled).
>
> - Position **changes** but the screen doesn't reflect it → **render/camera** problem.
> - Position **does not change** → **logic** problem (input / AI / physics / sleep).

Because of camera-follow, also watch a *second* entity. If the **relative** world positions
of two entities never change, nothing is moving in world space → it is a logic problem,
regardless of what the screen shows.

---

## 3. Techniques

### 3.1 Throttled logging (don't log every frame)

Per-frame `console.log` floods the console and tanks the frame rate. Throttle it and only
log what you need:

```ts
private _dbg = 0;
update(dt: number) {
  if (this._dbg++ % 30 === 0) {            // ~ twice per second
    const p = this.getPlayer();
    const t = p?.getComponent<TransformComponent>(TransformComponent.componentName);
    const phys = p?.getComponent<PhysicsComponent>(PhysicsComponent.componentName);
    console.log('[Phys]', t?.getPosition(), 'v=', phys?.getVelocity(), 'sleep=', phys?.isAsleep());
  }
}
```

Prefer logging on **state transitions** (entered/left sleep, started/stopped moving) over
logging continuous values.

The `System` base class already has a `debug` flag and a `this.log(...)` helper
([packages/ecs/src/core/ecs/System.ts](../packages/ecs/src/core/ecs/System.ts)) — call
`system.setDebug(true)` and use `this.log(...)` so debug output is opt-in per system.

### 3.2 On-screen HUD (better than the console for per-frame values)

Draw diagnostics directly on the canvas: player world pos, velocity, `cameraOffset`, FPS
(`game.getFPS()`), entity counts. Reading values on the HUD beats scrolling the console.
Add it as a high-priority render layer so it draws on top.

### 3.3 Debug-draw layer (visualize, don't just print)

A toggleable render layer that draws:

- **Collision shapes** (AABB / circle) from `shape.getSize()` / `getHalfExtents()`.
- **Velocity vectors** — a line from each entity along its velocity. Instantly shows whether
  something is moving and in which direction.
- **Spatial grid** cells and the **viewport** rectangle.

All of these must use `cameraOffset + worldPos` so they line up with the entities.

### 3.4 A world-anchored reference (camera debugging)

If the background is a flat color you cannot tell whether the world scrolls. Draw a static
**world grid** and a **world-origin marker** using `cameraOffset`, plus a fixed **crosshair
at screen center** (no offset). When the player moves, the grid scrolls past the crosshair —
immediate, unambiguous proof that movement + camera work.

### 3.5 Decouple from input (isolation test)

To separate "input is broken" from "physics/render is broken", give the player a constant
velocity at creation and don't touch the keyboard:

```ts
world.createComponent(PhysicsComponent, { velocity: [50, 0], speed, maxSpeed: speed });
```

- Moves → input layer is the culprit.
- Still frozen → physics / sleep / render.

### 3.6 Layer isolation

Toggle individual render layers (`EntityRenderLayer`, `ProjectileLayer`,
`BackgroundRenderLayer`, …) on/off to find which layer owns the misbehaving visuals. Since
the layers share almost identical positioning math, comparing a working layer (projectiles)
against a broken one (entities) quickly localizes the difference.

### 3.7 Frame step / pause

Drive the game from the dev state (`gameState` store: `start` / `pause`) and step one logic
frame at a time to inspect state deterministically. Pausing also freezes the logic loop, so
you can log a single frame without spam.

### 3.8 Check for duplicate instances

Several classes are singletons: `World.instance`, `Game.instance`, `RenderSystem.getInstance()`.
The `World` constructor logs **`World already exists`** if instantiated twice (common with
React StrictMode double-mount or HMR). Two worlds = logic updates one set of entities while
the renderer reads another (frozen) set. Quick checks:

- Watch the console for `World already exists`.
- Log `world.getEntitiesByType('player').length` — should be `1`.
- Make sure imports use **one** module specifier for the engine (see §4 "Module
  duplication").

### 3.9 Browser DevTools

- **Rendering → Paint flashing** to see what actually repaints.
- **Performance** profiler for dropped frames / long logic ticks (the loop already warns:
  `Logic frame took too long`).

---

## 4. Engine-specific gotchas (read these before filing a "bug")

- **Camera-follow pins the player to screen center.** Reason in world space. (§1)

- **Velocity units are pixels/second.** `PhysicsSystem` integrates
  `position += velocity * deltaTime` with `deltaTime ≈ 1/60`. A "speed" of `5` means 5 px/s
  (≈ imperceptible), not 5 px/frame. Character speeds live in
  [packages/ecs/src/constants/speed.ts](../packages/ecs/src/constants/speed.ts) and per-entity
  overrides; projectile speeds come from the weapon. Keep everything in px/s.

- **The sleep system can freeze slow entities.** `PhysicsComponent` puts an entity to sleep
  after `SLEEP_TIME_THRESHOLD` (2 s) below `SLEEP_VELOCITY_THRESHOLD` (0.1 px/s), and
  `PhysicsSystem.updateLinearVelocity` early-returns for sleeping entities. An entity moving
  *below* the threshold (e.g. a mis-scaled speed) will look frozen. `setVelocity()` with a
  non-zero value wakes it; `stop()` does not.

- **`setVelocity()` clamps to `maxSpeed`; the constructor does not.** If `getSpeed()` returns
  more than `maxSpeed`, the velocity is silently clamped. Projectiles set `velocity` in the
  constructor and skip this clamp — which is why they can be much faster than characters.

- **`InputSystem` wires up in `init()`, not the constructor.** `init()` registers keyboard/
  touch listeners, snapshots existing input entities, and subscribes to `onEntityAdded`.
  If `world.initSystems()` runs *before* the player entity is added, the player is only
  tracked via the `onEntityAdded` subscription — so `world.addEntity(player)` must fire that
  event. Verify init order in
  [packages/web-client/src/vampireSurvivorsGame.ts](../packages/web-client/src/vampireSurvivorsGame.ts).

- **Module duplication from inconsistent path aliases.** The engine package is named
  `@brotov2/ecs`, but the code also uses the Vite/tsconfig aliases `@ecs` and `@render`.
  Importing the same source file under two different specifiers (`@ecs/...` vs
  `@brotov2/ecs/src/...`) can create two module instances → two `World` singletons, two
  component classes, broken `instanceof`. Keep imports on a single specifier (`@ecs`) and, if
  needed, add `resolve.dedupe: ['@brotov2/ecs']` to the web-client Vite config.

---

## 5. Case study: "player and enemies won't move, but projectiles fly"

A worked example of the workflow above.

1. **Triage (§2).** Logged the player's world position. It **changed** on key press — so
   input + physics worked. Not a frozen-logic bug.

2. **Render reasoning (§1, §3.6).** `EntityRenderLayer` (player/enemy) and `ProjectileLayer`
   use identical `cameraOffset + worldPos` math and the same world. Projectiles moved on
   screen; characters didn't. That pointed at the *values*, not the layer code.

3. **Instrumented the render layer (§3.1).** Threw a throttled log into
   `EntityRenderLayer.update` printing `players`, `id`, `world`, `cameraOffset`, `screen`.
   Output:
   - `players=1` → no duplicate world (ruled out §3.8).
   - `world` changed only a **few pixels over several seconds**.
   - `cameraOffset` exactly canceled it → `screen` stayed constant.

4. **Conclusion.** The player *was* moving — at ~5 px/s. Camera-follow pinned it to center,
   and because the whole world scrolled only ~5 px/s, enemies/background barely shifted, so
   it *looked* completely frozen.

5. **Root cause (§4 "Velocity units").** Character speeds were scaled for a per-frame world
   while `PhysicsSystem` integrates per-second (`* deltaTime`): player `maxSpeed = 5` clamped
   velocity to 5 px/s; enemies were `2 px/s × 0.1 = 0.2 px/s`. Projectiles set velocity
   directly (large, unclamped) so they flew.

6. **Fix.** Rescaled speeds to px/s — player `250`, enemy `~150`
   ([speed/spawn constants](../packages/ecs/src/constants/spawnConstants.ts), Player factory,
   `AISystem`).

**Lesson:** measure before fixing. The first three hypotheses (sleep gate, init/wiring,
module duplication) were all plausible and all wrong; one throttled log in the right place
settled it in a single run.
