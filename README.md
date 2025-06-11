# Vampire Survivors-like Game Demo

A modern implementation of a Vampire Survivors-like game using Entity Component System (ECS) architecture. This project demonstrates how to build a roguelike survival game with clean architecture and modern web technologies.

## Project Structure

The project is organized as a monorepo using pnpm workspaces, consisting of two main packages:

- `@brotov2/ecs`: Core ECS implementation
- `@brotov2/web-client`: Game client implementation

### ECS Package Structure

```
packages/ecs/
├── components/    # Game entity components
├── systems/       # Game systems
├── entities/      # Entity definitions
├── core/          # Core ECS implementation
├── constants/     # Game constants
└── utils/         # Utility functions
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

The game is built using an Entity Component System (ECS) architecture, which provides:

- Clear separation of concerns
- Efficient game logic processing
- Easy extensibility
- Better performance through data-oriented design

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This project is licensed under the ISC License.
