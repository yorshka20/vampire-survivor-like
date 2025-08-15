# Shape Component System Documentation

## Overview

The Shape Component System provides a flexible and extensible way to describe object shapes in a TypeScript ECS (Entity Component System) architecture. It supports basic geometric primitives, parametric curves, Signed Distance Functions (SDF), and composite shapes with CSG operations.

## Core Components

### ShapeComponent

The primary component for describing geometric shapes. It stores shape descriptors and manages caching for performance optimization.

```typescript
const shapeComponent = new ShapeComponent({
  descriptor: {
    type: 'circle',
    radius: 10
  }
});
```

### ShapeRendererComponent

Handles rendering properties separate from geometric data, following the separation of concerns principle.

```typescript
const rendererComponent = new ShapeRendererComponent({
  fillColor: 'rgba(255, 0, 0, 0.8)',
  strokeColor: 'rgba(0, 0, 0, 1)',
  strokeWidth: 2,
  wireframe: false
});
```

### CurveRegistry

A singleton that manages mathematical equations for parametric curves and SDF functions.

```typescript
const registry = CurveRegistry.getInstance();
registry.registerParametric('myShape', (t, params) => {
  // Your mathematical equation here
  return [x, y];
});
```

## Shape Types

### Basic Geometric Shapes

#### Circle
```typescript
const circle = ShapeComponent.createCircle(15);
// Or using descriptor:
const circle = new ShapeComponent({
  descriptor: {
    type: 'circle',
    radius: 15
  }
});
```

#### Rectangle
```typescript
const rect = ShapeComponent.createRect(20, 10);
// Or using descriptor:
const rect = new ShapeComponent({
  descriptor: {
    type: 'rect',
    width: 20,
    height: 10
  }
});
```

#### Polygon
```typescript
const triangle = ShapeComponent.createPolygon([
  [0, 10],
  [-10, -10], 
  [10, -10]
]);
```

### Curve-Based Shapes

#### Bézier Curves
```typescript
const bezier = ShapeComponent.createBezier([
  [0, 0],     // Start point
  [10, 20],   // Control point 1
  [30, 20],   // Control point 2
  [40, 0]     // End point
], 50); // Resolution (number of segments)
```

#### Spline Curves
```typescript
const spline = new ShapeComponent({
  descriptor: {
    type: 'spline',
    points: [
      [0, 0], [10, 15], [25, 10], [40, 0]
    ],
    tension: 0.5,
    resolution: 60
  }
});
```

### Parametric Curves

Parametric curves are defined by mathematical equations where `t` ranges from 0 to 1.

#### Built-in Parametric Shapes

**Circle:**
```typescript
const parametricCircle = new ShapeComponent({
  descriptor: {
    type: 'parametric',
    equationName: 'circle',
    parameters: { radius: 12 },
    resolution: 32
  }
});
```

**Ellipse:**
```typescript
const ellipse = new ShapeComponent({
  descriptor: {
    type: 'parametric',
    equationName: 'ellipse',
    parameters: { a: 20, b: 10 }, // Semi-major and semi-minor axes
    resolution: 64
  }
});
```

**Wave (Perfect for Slime-like Objects):**
```typescript
const slimeShape = new ShapeComponent({
  descriptor: {
    type: 'parametric',
    equationName: 'wave',
    parameters: {
      baseRadius: 15,    // Base size
      frequency: 6,      // Number of waves
      amplitude: 3       // Wave height
    },
    resolution: 48
  }
});
```

#### Custom Parametric Curves

Register your own mathematical equations:

```typescript
const registry = CurveRegistry.getInstance();

// Heart shape
registry.registerParametric('heart', (t, params) => {
  const scale = params.scale || 1;
  const angle = t * Math.PI * 2;
  const x = 16 * Math.sin(angle) ** 3;
  const y = 13 * Math.cos(angle) - 5 * Math.cos(2 * angle) - 
           2 * Math.cos(3 * angle) - Math.cos(4 * angle);
  return [x * scale, -y * scale];
});

// Usage
const heart = new ShapeComponent({
  descriptor: {
    type: 'parametric',
    equationName: 'heart',
    parameters: { scale: 0.8 }
  }
});
```

### Signed Distance Functions (SDF)

SDF shapes are defined by distance fields, excellent for collision detection and complex shapes.

#### Built-in SDF Shapes

**Circle:**
```typescript
const sdfCircle = new ShapeComponent({
  descriptor: {
    type: 'sdf',
    equationName: 'circle',
    parameters: { radius: 10 },
    bounds: { min: [-10, -10], max: [10, 10] }
  }
});
```

**Rounded Rectangle:**
```typescript
const roundedRect = new ShapeComponent({
  descriptor: {
    type: 'sdf',
    equationName: 'roundedRect',
    parameters: {
      width: 20,
      height: 15,
      radius: 3
    }
  }
});
```

#### Custom SDF Functions

```typescript
const registry = CurveRegistry.getInstance();

// Custom capsule shape
registry.registerSDF('capsule', (point, params) => {
  const length = params.length || 10;
  const radius = params.radius || 3;
  
  const x = Math.abs(point[0]) - length * 0.5;
  const y = point[1];
  
  return Math.sqrt(Math.max(x, 0) ** 2 + y ** 2) + 
         Math.min(Math.max(x, Math.abs(y)), 0) - radius;
});
```

### Composite Shapes

Combine multiple shapes using CSG (Constructive Solid Geometry) operations.

```typescript
const compositeShape = new ShapeComponent({
  descriptor: {
    type: 'composite',
    children: [
      {
        type: 'circle',
        radius: 20
      },
      {
        type: 'rect',
        width: 15,
        height: 40
      },
      {
        type: 'sdf',
        equationName: 'circle',
        parameters: { radius: 8 }
      }
    ],
    operations: ['union', 'subtract'] // Apply operations sequentially
  }
});
```

**Available CSG Operations:**
- `'union'` - Combine shapes (OR operation)
- `'subtract'` - Remove second shape from first
- `'intersect'` - Keep only overlapping areas (AND operation)

## Performance Features

### Caching System

The component automatically caches expensive computations:

```typescript
// Check if tessellation needs recalculation
if (shapeComponent.isDirty()) {
  const vertices = computeTessellation(shapeComponent.descriptor);
  shapeComponent.setTessellated(vertices);
  shapeComponent.markClean();
}

// Access cached vertices
const cachedVertices = shapeComponent.tessellated;
```

### Bounds Optimization

Store bounding boxes for efficient culling:

```typescript
const bounds = computeBounds(shapeComponent.descriptor);
shapeComponent.setBounds(bounds.min, bounds.max);

// Later, use for quick collision checks
if (isInsideBounds(point, shapeComponent.bounds)) {
  // Perform detailed collision detection
}
```

## Common Usage Patterns

### Creating a Game Entity with Shape

```typescript
import { Entity } from '@ecs/core/ecs/Entity';
import { TransformComponent } from './TransformComponent';
import { ShapeComponent, ShapeRendererComponent } from './ShapeComponent';

function createSlimeEntity(): Entity {
  const entity = new Entity();
  
  // Position and orientation
  entity.addComponent(new TransformComponent({
    position: [100, 200],
    rotation: 0,
    scale: 1.5
  }));
  
  // Shape geometry
  entity.addComponent(new ShapeComponent({
    descriptor: {
      type: 'parametric',
      equationName: 'wave',
      parameters: {
        baseRadius: 20,
        frequency: 8,
        amplitude: 4
      },
      resolution: 64
    }
  }));
  
  // Visual appearance
  entity.addComponent(new ShapeRendererComponent({
    fillColor: 'rgba(0, 255, 100, 0.8)',
    strokeColor: 'rgba(0, 150, 50, 1)',
    strokeWidth: 2
  }));
  
  return entity;
}
```

### Dynamic Shape Modification

```typescript
// Change shape parameters at runtime
const shapeComponent = entity.getComponent('Shape') as ShapeComponent;

// Update wave parameters for animation
shapeComponent.updateDescriptor({
  type: 'parametric',
  equationName: 'wave',
  parameters: {
    baseRadius: 20,
    frequency: 8,
    amplitude: Math.sin(time * 2) * 5 // Animated amplitude
  },
  resolution: 64
});
```

### Shape Morphing

```typescript
class ShapeMorphingSystem {
  update(entities: Entity[], deltaTime: number): void {
    entities.forEach(entity => {
      const shape = entity.getComponent('Shape') as ShapeComponent;
      if (!shape) return;
      
      // Morph between different shapes over time
      const morphProgress = (Math.sin(this.time) + 1) * 0.5; // 0 to 1
      
      shape.updateDescriptor({
        type: 'parametric',
        equationName: 'wave',
        parameters: {
          baseRadius: 15 + morphProgress * 10,
          frequency: 6 + morphProgress * 4,
          amplitude: 2 + morphProgress * 3
        }
      });
    });
  }
}
```

## Best Practices

### 1. Choose the Right Shape Type

- **Basic shapes** (circle, rect, polygon): For simple, static geometry
- **Parametric curves**: For organic, animated shapes that need smooth curves
- **SDF**: For complex collision detection and boolean operations
- **Composite**: For combining multiple simple shapes

### 2. Performance Optimization

```typescript
// Cache tessellation for complex curves
const TESSELLATION_CACHE = new Map();

function getTessellation(descriptor: AnyShapeDescriptor): Point[] {
  const key = JSON.stringify(descriptor);
  if (!TESSELLATION_CACHE.has(key)) {
    TESSELLATION_CACHE.set(key, computeTessellation(descriptor));
  }
  return TESSELLATION_CACHE.get(key);
}
```

### 3. Resolution Guidelines

- **Low detail** (16-32 segments): Background objects, distant shapes
- **Medium detail** (32-64 segments): Standard game objects
- **High detail** (64-128 segments): Hero objects, close-up details
- **Very high detail** (128+ segments): Special effects, cinematics

### 4. Memory Management

```typescript
// Properly reset components when using object pooling
class ShapeComponent extends Component {
  reset(): void {
    super.reset();
    this.descriptor = { type: 'circle', radius: 1 };
    this.tessellated = []; // Clear cached data
    this.bounds = null;
    this._dirty = true;
  }
}
```

## Integration with Physics

The shape system works seamlessly with physics engines:

```typescript
// For collision detection
function getCollisionBounds(entity: Entity): BoundingBox {
  const transform = entity.getComponent('Transform') as TransformComponent;
  const shape = entity.getComponent('Shape') as ShapeComponent;
  
  if (!shape.bounds) {
    // Compute bounds if not cached
    shape.setBounds(computeBounds(shape.descriptor));
  }
  
  // Transform bounds to world space
  return transformBounds(shape.bounds, transform);
}

// For soft-body physics (like slime simulation)
function getPhysicsVertices(entity: Entity): Point[] {
  const shape = entity.getComponent('Shape') as ShapeComponent;
  
  if (shape.isDirty()) {
    const vertices = tessellateShape(shape.descriptor);
    shape.setTessellated(vertices);
    shape.markClean();
  }
  
  return shape.tessellated;
}
```

## Advanced Examples

### Animated Flower Shape

```typescript
// Register a flower equation
registry.registerParametric('flower', (t, params) => {
  const petals = params.petals || 5;
  const innerRadius = params.innerRadius || 5;
  const outerRadius = params.outerRadius || 15;
  const angle = t * Math.PI * 2;
  
  const radius = innerRadius + (outerRadius - innerRadius) * 
    Math.abs(Math.sin(angle * petals * 0.5));
    
  return [
    Math.cos(angle) * radius,
    Math.sin(angle) * radius
  ];
});

// Create animated flower
const flower = new ShapeComponent({
  descriptor: {
    type: 'parametric',
    equationName: 'flower',
    parameters: {
      petals: 6,
      innerRadius: 8,
      outerRadius: 20
    },
    resolution: 72
  }
});
```

### Complex Character Shape

```typescript
// Body made of multiple parts
const characterShape = new ShapeComponent({
  descriptor: {
    type: 'composite',
    children: [
      // Head
      {
        type: 'sdf',
        equationName: 'circle',
        parameters: { radius: 15 }
      },
      // Body  
      {
        type: 'sdf',
        equationName: 'roundedRect',
        parameters: { width: 20, height: 30, radius: 5 }
      },
      // Arms (simplified as small circles)
      {
        type: 'circle',
        radius: 8
      }
    ],
    operations: ['union', 'union']
  }
});
```

This documentation should provide a comprehensive guide for using the Shape Component System. The design allows for both simple usage and complex, mathematically-driven shapes while maintaining good performance through caching and efficient data structures.