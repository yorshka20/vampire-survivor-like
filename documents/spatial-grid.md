# Spatial Grid: Design, Implementation Pitfalls, and Fixes

The spatial grid (`SpatialGridComponent` + `SpatialGridSystem`) is the broad-phase
index that every position query in the game goes through: collision, damage,
pickup, obstacle, laser line-cast, and the ray-tracing debug layer. The **design**
is good — an unbounded spatial hash with per-query-type cached neighbor lists. The
original **implementation** was not: a single frame profile showed the grid's
`update`/`insert` dominating the logic phase, well above the collision system it
exists to serve.

This document explains why, and what was changed.

---

## 1. Design (what is correct and worth keeping)

- **Unbounded spatial hash.** Cells are keyed by `"${cellX},${cellY}"` with
  `cellX = floor(x / cellSize)`. Negative coordinates are valid; there is no
  viewport re-bounding step. Good — the world is larger than the screen.
- **Pre-classified cells.** Each cell stores entities in per-type Sets
  (`enemies`, `projectiles`, `pickups`, `players`, `areaEffects`, `objects`,
  `obstacles`) so a query never filters by type at read time.
- **Per-query-type caches.** `getNearbyEntities` caches neighbor lists per query
  type with a TTL and an update frequency (collision every frame, pickup every 5
  frames, etc.). This is why the collision system looks cheap in the profile — the
  cache absorbs most of the neighbor-gathering cost.
- **Incremental update API.** `updatePosition` only touches the grid when an
  entity crosses a cell boundary. This is the right primitive for grid
  maintenance.

---

## 2. Implementation pitfalls (what was wrong)

### 2.1 Cache invalidation during a full rebuild — the dominant cost

`SpatialGridSystem.update` rebuilds the grid every frame: `clear()` then re-insert
every entity. But:

- `clear()` already wipes **all** caches (`invalidateCaches → updateCaches →
  cache.clear()` for all 6 query types).
- Each `insert()` then called `invalidateCacheForCell`, which loops a 3×3 cell
  neighborhood × 6 caches = **54 `Map.delete` calls per covered cell per entity** —
  all no-ops, because the caches were emptied a moment earlier by `clear()`.

For `N` entities that is on the order of `54·N` wasted `Map.delete` calls every
frame, producing nothing. This was the bulk of the `invalidateCacheForCell` time in
the profile. Cache invalidation belongs to *incremental* updates, not to a full
rebuild that has already cleared everything.

**Fix:** `insert` takes an `invalidate` flag (default `true` for incremental use).
The rebuild path passes `false`. `clear()` clears the caches once; queries that run
afterward see an empty cache and recompute — which is correct, since every position
changed.

### 2.2 Per-frame cell reallocation → GC churn

`clear()` did `grid.clear()`, so every occupied cell was dropped and then rebuilt
via `createGridCell()` — **8 fresh `Set` allocations per occupied cell, every
frame**. With hundreds of occupied cells this is constant minor-GC pressure (the
sawtooth GC ticks in the profile).

**Fix:** cells are recycled through a `cellPool`. `clear()` releases each occupied
cell (clears its Sets in place) back to the pool; `insert` reuses a pooled cell
before allocating. Steady-state allocation per frame drops to ~zero.

### 2.3 Triple bookkeeping per insert

Every `insert` wrote to three places: the legacy `cell.entities` Set, the
`cell.entityTypes` Map, **and** the type-specific Set. No query type ever reads the
legacy `entities`/`entityTypes` — every `SpatialQueryType` maps to one or more of
the classified Sets. The legacy storage existed only to answer "is this cell empty"
and "what type is this id" inside `remove`.

**Fix:** legacy `entities`/`entityTypes` removed. Emptiness is tracked by a single
`count` integer per cell; `remove` takes the type (callers already pass it) and
falls back to probing the classified Sets only when the type is unknown. One write
per insert instead of three.

### 2.4 Indexing entities no query ever reads

The system inserts every entity that has a `TransformComponent`, including
`spawner` and `other` types. These map to no query type, so the old code dumped them
into the legacy `entities` Set where nothing ever read them.

**Fix:** `insert`/`remove` early-return for non-indexed types via `isIndexedType`.
`spawner`/`other` are simply not indexed.

### 2.5 Redundant per-cell dedup in queries

`getEntitiesByQueryType` wrapped each cell's result in `Array.from(new Set(...))`.
But within one cell an id lives in exactly one classified Set (an entity has one
type), so there are never intra-cell duplicates. Cross-cell duplicates (a large
AABB spanning cells) are already deduped once by `calculateNearbyEntities`.

**Fix:** the per-cell `new Set` is removed; the single dedup in
`calculateNearbyEntities` is kept.

### 2.6 Dead throttle code / misleading comment

`SpatialGridSystem` declared `UPDATE_INTERVAL = 100` and `lastUpdateTime` with a
doc comment claiming the grid updates "only when the time since the last update
exceeds UPDATE_INTERVAL." Neither field was ever used — the grid rebuilt every
frame. Honoring a 100 ms throttle would actually be *wrong* (it would feed stale
positions to collision and cause tunneling/jitter); the real answer is incremental
maintenance, not throttling.

**Fix:** dead fields and the misleading comment removed, then the full rebuild was
replaced by incremental maintenance (see §3).

---

## 3. Incremental maintenance (replaces the full rebuild)

The full rebuild was O(N) every frame regardless of whether anything moved:
`clear()` + re-insert every entity. But at `cellSize = 100` and enemy speed
~125 px/s, an entity moves ~2 px/frame — the overwhelming majority of entities do
**not** cross a cell boundary in a given frame. Rebuilding all of them is wasted
work.

`SpatialGridSystem` now maintains the grid incrementally and the grid persists
across frames:

- **Add** (`world.onEntityAdded`) → `insert` once; start tracking the entity.
- **Remove** (`world.onEntityRemoved`) → `remove` once; stop tracking. The removal
  uses the stored record, because by the time `entityRemoved` fires the entity's
  components are already detached — the live position is gone, but the record still
  has the position/size/type the entity was inserted with.
- **Move** — each frame `update()` walks the tracked set and, for each entity,
  compares its live position's cell `(floor(x/cs), floor(y/cs))` against the cell it
  was last registered in. Same cell → skip (no grid or cache touch). Crossed →
  `updatePosition`, which removes from the old covered cells and inserts into the
  new ones, invalidating only the affected caches.

### Why this design (and not a movement-system hook)

Positions are mutated by several systems in both phases — `PhysicsSystem` and
`ChaseSystem` (logic), `TransformSystem` player input (render), `CollisionSystem`
and `BorderSystem` push-out. There is no single "movement" choke point to hook.
Re-deriving the cell from the authoritative `TransformComponent` each frame is
robust regardless of *which* system moved the entity, while still only paying grid
mutation cost for the entities that actually crossed a boundary.

### Important implementation details

- **`pos` is copied, not referenced.** `TransformComponent.getPosition()` returns
  the live array; storing that reference would make "current vs last" always equal
  and movement would never be detected. The record stores `[x, y]` copies taken at
  insert / boundary-cross time.
- **Boundary check uses integer cell coords, not string keys** — no per-entity
  string allocation for the (common) non-movers.
- **Size is captured once.** `ShapeComponent.getSize()` is derived from an immutable
  descriptor and there is no `setSize` in the codebase, so an entity's footprint is
  constant for its lifetime; there is no need to re-read it each frame.
- **`reseed()`** (init + window resize) drops and rebuilds grid + tracking from the
  current world entities, keeping the incremental state authoritative if the grid is
  ever cleared externally.
- **Freshness bonus.** Entities spawned mid-frame (e.g. `SpawnSystem` at priority
  300) are now indexed immediately, so same-frame collision (priority 900) can see
  them. The old rebuild (priority 0) only picked them up the following frame.

The per-frame work is now: O(N) cheap "compute cell + integer compare" + actual grid
mutation only for the few boundary-crossers — versus the old O(N) clear + N inserts +
cache-invalidation storm.

---

## 4. Spawn spike (related fix)

The profile also showed `createEnemyEntity` running in a synchronous burst mid-frame.
`SpawnerEntity.spawn` built an entire wave's batch
(`floor(waveNumber * 10 * multiplier)` enemies — dozens to hundreds) in one loop on
the interval frame. Every new enemy adds ~10 pooled components, so the whole batch
landed in a single frame.

**Fix (frame buffering):** the wave's batch is now *queued* (`pendingSpawnCount`)
when the spawn interval elapses, and drained at most `MAX_SPAWN_PER_FRAME` (8) per
frame. A large wave is spread across several frames instead of spiking one. The
backlog is capped at `MAX_ENEMIES` so it cannot grow unbounded.

See `Spawner.ts` (`refillSpawnQueue` / `drainSpawnQueue`) and
`spawnConstants.ts` (`MAX_SPAWN_PER_FRAME`).

---

## 5. Known follow-ups (not yet done)

- **`getEntitiesWithComponents` full scan.** `World.getEntitiesWithComponents` does
  `Array.from(this.entities).filter(...)` on every call (and several systems call it
  every frame). A component index / archetype cache would remove this O(N) scan.
- **Redundant entity reset on creation.** `createEntity → pool.get()` resets and
  recreates, then `createEntity` recreates again — `reset()` runs ~3× and the entity
  id is generated ~2× per entity. Worth collapsing.
- **Cold pools.** Entity/component pools start at `initialSize: 0`, so early game
  pays full `new` cost during the opening spawn wave. Warming the pools would help.

These were intentionally left out of this pass (scoped to the spatial grid + spawn
buffering).
