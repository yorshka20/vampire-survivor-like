# Debugging Object Pools

This document describes a class of bugs unique to our pooled-component ECS, how
to recognize them, and how to write Components that are safe to pool. It is
intended as a checklist for anyone touching `Component` subclasses or chasing
mysterious "works for a few seconds, then silently stops" behavior in-game.

## The setup

`PoolManager` recycles both Entities and Components via `ObjectPool<T>`. The
hot path is:

```ts
// ObjectPool.get
if (this.pool.length > 0) {
  const obj = this.pool.pop()!;
  obj.reset();
  obj.recreate(props);
  return obj;
}
return this.factory(props);
```

A freshly minted instance is born via `factory` (which calls
`new Component(props)`). A recycled instance is born via `reset() + recreate(props)`.
**Both paths must produce equivalent state.**

The default `Component.recreate` is:

```ts
recreate(props: any): void {
  this.reset();
  if (props) Object.assign(this, safeClone(props));
}
```

It will faithfully copy whatever lives on `props`. It will NOT replay any work
the constructor did beyond `Object.assign`. If your constructor loads an asset,
seeds a derived field, registers with an external manager, or otherwise does
work that is not pure-`props`-copy, the recycled instance is broken.

## The invariant

> For every pooled `Component` subclass, the observable state of
> `new ComponentClass(p)` and `existing.reset() + existing.recreate(p)` must be
> equivalent.

Every Component that violates this invariant is a latent time bomb that goes
off as soon as that component is recycled for the first time.

## The bug pattern

Look for constructor bodies that go beyond `super()` + assignment from props.
Typical offenders:

1. **External-resource lookup.** The constructor asks a manager / singleton for
   a cached resource and stashes it on the instance.
2. **Derived-field seeding.** The constructor iterates a prop and populates a
   second field (lookup map, index, cache) from it.
3. **Side-effect registration.** The constructor adds itself to an external
   registry, subscribes to an event, etc. (less common in our code, but worth
   watching for).

All three are unaffected by `Object.assign(this, props)`, so they silently
disappear after the first pool round-trip.

## Real-world examples in this repo

Two we have already hit and fixed; use them as templates.

### `ShapeComponent` — external-resource lookup

The constructor calls `loadPatternImage(descriptor.patternType)`, which fetches
the preloaded pattern bitmap from `PatternAssetManager` and assigns it to
`this.patternImage`. `recreate` did not replay this, so pooled pickups had
`patternImage === null` and `ItemRenderLayer` fell through to the fallback
shape. Player and enemies were unaffected because their AnimationComponent
overrides the rendering path.

Fix: an explicit `recreate` override that calls `loadPatternImage` after
`super.recreate(props)`.

### `WeaponComponent` — derived-field seeding

The constructor runs:

```ts
this.weapons.forEach((w) => (this.lastAttackTimes[w.id] = 0));
```

…seeding the per-weapon attack-time map from the `weapons` prop. `recreate`
did not replay this, so pooled WeaponComponents arrived with
`lastAttackTimes = {}`. Downstream `canAttack` did
`currentTime - this.lastAttackTimes[id]` (no fallback) which evaluates to
`NaN` for missing entries, and `NaN >= attackInterval` is always false.
Result: child-weapon projectiles fired for the first ~5 seconds (while the
SpiralOrb projectile pool was still empty and components were minted fresh),
then went silent forever as the pool filled up.

Fix: an explicit `recreate` override that re-seeds `lastAttackTimes`. We also
added `?? 0` fallbacks to `canAttack` / `isWeaponOnCooldown` so the failure
mode degrades gracefully if anyone forgets the seed again.

## Symptoms checklist

When a feature "works at first and stops working a few seconds later", or
"works once and never again", or "works for some entities and not for visually
identical others", suspect pool reuse before suspecting logic bugs. Concretely:

- A short delay (seconds, not milliseconds) before the break correlates with
  entity `projectileLifetime` / `LifecycleComponent` — that's how long it
  takes for the first instance to return to the pool.
- "Recently spawned" entities are broken while "long-lived" ones (e.g. the
  player) are fine — the long-lived ones never went through the pool.
- A class of entities renders a fallback shape (boring rectangle / circle)
  instead of the intended sprite — usually means an asset reference was lost
  on pool reuse.
- A timer-based check (cooldown, interval, lifetime) is permanently failing
  for newly spawned entities — usually means a seeded map / timestamp is
  missing.

## Triage flow

1. **Identify the broken entity type.** Find its factory in `packages/ecs/src/entities/`.
2. **List every Component it owns.** For each, open the Component file.
3. **Read the constructor.** Anything beyond `super()` and `this.x = props.x` is
   suspect. In particular: function calls, `forEach`, `Map`/`Set` population,
   conditionals that gate side effects.
4. **Read the `recreate` method.** If the constructor does X and `recreate`
   does not do X, that is your bug. If the Component has no `recreate`
   override, the base implementation is `Object.assign` — anything beyond that
   in the constructor is missing on the reuse path.
5. **Verify with a quick experiment.** Add a `console.log` at the top of the
   factory, or break inside `ObjectPool.get` after `recreate`, and compare the
   instance state on a fresh vs. reused entity. The diff is the bug.

## Writing pool-safe Components

The minimal contract:

- If your constructor does anything beyond `super()` and copying from props,
  override `recreate` to replay that work.
- Mirror the constructor's structure in `recreate`. Easiest pattern:

  ```ts
  constructor(props: SomeProps) {
    super('Some');
    Object.assign(this, props);
    this.initDerived();
  }

  recreate(props: SomeProps): void {
    super.recreate(props);   // does reset + Object.assign
    this.initDerived();
  }

  private initDerived(): void {
    // load assets, seed maps, etc.
  }
  ```

  Now the construction and reuse paths share `initDerived`, and the invariant
  is structurally enforced.

- Make sure `reset()` actually clears the derived fields, otherwise stale state
  from the previous owner leaks across instances.

- Defensive coding helps. If a downstream consumer reads a runtime-seeded map,
  default missing entries with `?? 0` (or whatever the semantically-correct
  initial value is). That alone would not have prevented our WeaponComponent
  bug — `canAttack` was strict — but it would have turned a silent forever-bug
  into a tolerable degraded state.

## Future hardening options (not yet implemented)

Three complementary mechanisms ranked from least to most invasive:

1. **Meta-test.** A single Vitest that, for each pooled Component, instantiates
   it with sample props, returns it to a pool, gets it again, and asserts the
   reused instance has the same shape (non-null where the fresh one was
   non-null). Catches today's bugs and any future regression in CI. Requires
   each Component to register `sampleProps`.

2. **Constructor-routed-through-recreate refactor.** Change `Component`'s base
   constructor to call `this.recreate(props)` rather than letting subclasses do
   their own init. This makes A and B paths share code by construction, so
   the invariant is impossible to violate. Requires touching every Component
   subclass once. The right long-term fix.

3. **Dev-mode runtime assertion in `ObjectPool.get`.** Take a snapshot of the
   first-ever `new` of each Component class, then compare every subsequent
   `recreate` result against it; warn if previously-truthy fields are now
   null/undefined. Cheap, zero production cost if guarded by an env flag,
   catches first-ever pool reuse without per-Component test scaffolding.

Pick one or stack them — option 1 is the lowest barrier and would have caught
both bugs the day it was added.

## Quick reference

Components in this repo with a current `recreate` override (i.e. ones already
aware of the pool-reuse path). When adding new resource-loading or derived-
field logic, model after these:

- `AnimationComponent` — re-binds sprite sheet
- `ShapeComponent` — reloads pattern image
- `WeaponComponent` — re-seeds `lastAttackTimes`
- `RenderComponent`, `DamageComponent`, `DamageTextComponent`,
  `ExperienceComponent`, `PickupComponent`, `HealthComponent`,
  `LifecycleComponent` — simple property restoration; no external resources

If you add a Component that does external-resource lookup or derived-field
seeding and forget the `recreate` override, the symptoms in the checklist
above will eventually surface. Now you know where to look.
