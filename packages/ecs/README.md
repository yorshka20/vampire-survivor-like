# Vampire Survivors-like Game

A browser-based action roguelike game built with TypeScript and a custom ECS (Entity Component System) framework.

## Game Features

### Core Gameplay

- **Automatic Combat**: Your character automatically attacks the nearest enemy
- **Enemy Waves**: Enemies spawn in increasing numbers and difficulty
- **Experience System**: Collect green gems from defeated enemies to level up
- **Item Drops**: Enemies can drop various items including:
  - Health pickups (red squares)
  - New weapons (yellow triangles)
  - Power-ups (colored circles)

### Controls

- **Movement**: Use WASD or Arrow keys to move your character
- **Combat**: Automatic - no need to aim or shoot manually

### Weapons

The game features multiple weapon types:

- **Basic Gun**: Starting weapon with balanced stats
- **Rapid Fire**: High attack speed, lower damage
- **Heavy Shot**: High damage, slow attack speed
- **Piercing Shot**: Medium damage with projectile penetration

### Power-ups

Collect power-ups to enhance your character:

- **Damage Boost**: Increases weapon damage
- **Attack Speed**: Increases fire rate
- **Movement Speed**: Move faster
- **Max Health**: Increases maximum health

### Progression

- Gain experience by defeating enemies
- Level up automatically when enough experience is collected
- Each level grants a random stat boost
- Difficulty increases over time with more and stronger enemies

## Technical Details

### ECS Components

- `HealthComponent`: Manages entity health
- `WeaponComponent`: Handles automatic attacking
- `VelocityComponent`: Physics-based movement
- `ExperienceComponent`: Player leveling system
- `DamageComponent`: Projectile damage dealing
- `AIComponent`: Enemy movement behavior
- `PickupComponent`: Collectible items
- `StatsComponent`: Upgradeable character statistics

### ECS Systems

- `VelocitySystem`: Handles physics-based movement
- `MovementSystem`: Player input handling
- `AISystem`: Enemy AI behavior
- `SpawnSystem`: Enemy wave spawning
- `WeaponSystem`: Automatic shooting
- `DamageSystem`: Damage calculation and application
- `PickupSystem`: Item collection and effects
- `DeathSystem`: Entity death and item drops

## Development

Run the game in development mode:

```bash
pnpm dev
```

Build for production:

```bash
pnpm build
```
