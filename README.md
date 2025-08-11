# Vampire Survivors-like Game Demo

A modern implementation of a Vampire Survivors-like game using Entity Component System (ECS) architecture. This project demonstrates how to build a roguelike survival game with clean architecture and modern web technologies. This project is developed with the assistance of AI tools to enhance development efficiency and code quality.

## Project Structure

The project is organized as a monorepo using pnpm workspaces, consisting of three main packages:

- `@brotov2/ecs`: Pure ECS engine (reusable game engine core)
- `@brotov2/game`: Game-specific logic and entities
- `@brotov2/web-client`: Game client implementation

### ECS Package Structure (Pure Engine)

```
packages/ecs/
├── components/    # Generic ECS components
├── systems/       # Generic ECS systems
├── core/          # Core ECS implementation
├── constants/     # Engine constants
└── utils/         # Engine utilities
```

### Game Package Structure

```
packages/game/
├── core/          # Game management (Game, GameLoop)
├── entities/      # Game-specific entities
└── utils/         # Game-specific utilities
```

### Web Client Structure

```
packages/web-client/
├── src/
│   ├── stores/    # Game state management
│   ├── types/     # TypeScript type definitions
│   └── GameUI.svelte  # Main game UI component
```

## Features

- Entity Component System (ECS) architecture for efficient game logic
- Modern web-based implementation
- TypeScript for type safety
- Svelte for reactive UI components
- Clean and maintainable codebase

## Getting Started

### Prerequisites

- Node.js (Latest LTS version recommended)
- pnpm (v10.8.1 or later)

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   pnpm install
   ```

### Development

To start the development server:

```bash
pnpm dev
```

### Building

To build the project:

```bash
pnpm build
```

## Available Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build the project
- `pnpm typecheck` - Run TypeScript type checking
- `pnpm lint` - Run ESLint
- `pnpm format` - Format code with Prettier

## Architecture

The project uses a layered architecture with clear separation of concerns:

### ECS Engine Layer (@brotov2/ecs)

- Pure Entity Component System implementation
- Generic components, systems, and utilities
- Reusable across different game projects
- Focuses on performance and extensibility

### Game Logic Layer (@brotov2/game)

- Game-specific logic and entities
- Uses ECS engine as foundation
- Contains game mechanics and rules
- Easy to modify for different game types

### Client Layer (@brotov2/web-client)

- Web-based game client
- User interface and game presentation
- Integrates with game logic layer

This architecture provides:

- Clear separation of concerns
- Efficient game logic processing
- Easy extensibility
- Better performance through data-oriented design
- Reusable engine components

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This project is licensed under the ISC License.
