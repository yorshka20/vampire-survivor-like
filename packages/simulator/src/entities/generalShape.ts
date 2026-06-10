import {
  ColliderComponent,
  Color,
  createParametricDescriptor,
  createShapeDescriptor,
  Entity,
  GetParametricParams,
  InteractComponent,
  ParametricCurveName,
  PhysicsComponent,
  Point,
  RenderComponent,
  ShapeComponent,
  ShapeDescriptor,
  TransformComponent,
  Vec2,
  World,
} from '@ecs';
import { RenderLayerIdentifier } from '@render/constant';

type ShapeProps = {
  size: number;
  color: Color;
  velocity: Vec2;
  position: Point;
};

/** A randomly generated descriptor plus the collider that matches its extent. */
type GeneratedShape = {
  descriptor: ShapeDescriptor;
  collider: { type: 'circle' | 'rect'; size: [number, number] };
};

/** Random float in [min, max). `randomNumber` only yields integers, so we keep a local one. */
function randFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randInt(min: number, max: number): number {
  return Math.floor(randFloat(min, max + 1));
}

function pickOne<T>(items: readonly T[]): T {
  return items[randInt(0, items.length - 1)];
}

/**
 * Parametric param generators keyed by equation name.
 *
 * The mapped type forces an entry for every registered curve, and ties each
 * generator's return value to exactly the params that curve consumes. Adding a
 * new parametric curve to the registry makes this object fail to compile until
 * a matching generator is supplied — that is the "auto-match" guarantee.
 */
const parametricParamGen: {
  [K in ParametricCurveName]: (size: number) => GetParametricParams<K>;
} = {
  circle: (size) => ({ radius: size }),
  ellipse: (size) => ({ a: size, b: size * randFloat(0.4, 1) }),
  wave: (size) => ({
    baseRadius: size * 0.8,
    frequency: randInt(4, 10),
    amplitude: size * randFloat(0.1, 0.3),
  }),
  heart: (size) => ({ scale: size / 16 }),
  flower: (size) => ({
    petals: randInt(4, 8),
    innerRadius: size * 0.4,
    outerRadius: size,
  }),
};

const parametricNames = Object.keys(parametricParamGen) as ParametricCurveName[];

/**
 * One builder per shape "family". Each picks its own random parameters from the
 * `size` budget and returns a collider sized to roughly bound the result, so the
 * caller never has to know which descriptor was chosen.
 */
const shapeBuilders: Array<(size: number) => GeneratedShape> = [
  // Circle
  (size) => ({
    descriptor: createShapeDescriptor('circle', { radius: size }),
    collider: { type: 'circle', size: [size * 2, size * 2] },
  }),

  // Axis-aligned rectangle
  (size) => {
    const width = size * randFloat(1, 2);
    const height = size * randFloat(1, 2);
    return {
      descriptor: createShapeDescriptor('rect', { width, height }),
      collider: { type: 'rect', size: [width, height] },
    };
  },

  // Convex-ish polygon: N vertices spread around a circle with radius jitter
  (size) => {
    const count = randInt(3, 7);
    const vertices: Point[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const radius = size * randFloat(0.6, 1);
      vertices.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
    }
    return {
      descriptor: createShapeDescriptor('polygon', { vertices }),
      collider: { type: 'circle', size: [size * 2, size * 2] },
    };
  },

  // Parametric curve: pick an equation, then auto-match its params
  (size) => {
    const name = pickOne(parametricNames);
    const parameters = parametricParamGen[name](size);
    return {
      descriptor: createParametricDescriptor(name, parameters, { resolution: 64 }),
      collider: { type: 'circle', size: [size * 2, size * 2] },
    };
  },
];

/** Produce a random descriptor + matching collider for the given size budget. */
export function randomShape(size: number): GeneratedShape {
  return pickOne(shapeBuilders)(size);
}

/** The simple, low-vertex shape families selectable in the rendering test. */
export type StandardShapeKind = 'circle' | 'rect' | 'triangle';

/**
 * Geometry source for spawned entities:
 * - `'random'` → the full random builders above (incl. 64-segment parametric/polygon).
 * - a list of {@link StandardShapeKind} → restrict to those simple shapes, picked at random.
 */
export type GeometryMode = 'random' | StandardShapeKind[];

/** Builders for the simple standard shapes (low vertex count, no curve tessellation). */
const standardShapeBuilders: Record<StandardShapeKind, (size: number) => GeneratedShape> = {
  circle: (size) => ({
    descriptor: createShapeDescriptor('circle', { radius: size }),
    collider: { type: 'circle', size: [size * 2, size * 2] },
  }),
  rect: (size) => {
    const width = size * randFloat(1, 2);
    const height = size * randFloat(1, 2);
    return {
      descriptor: createShapeDescriptor('rect', { width, height }),
      collider: { type: 'rect', size: [width, height] },
    };
  },
  // A 3-vertex polygon — a genuinely simple path, in contrast to the random
  // mode's 64-segment outlines. Rendered through drawShape's polygon branch.
  triangle: (size) => {
    const vertices: Point[] = [
      [0, -size],
      [size * 0.866, size * 0.5],
      [-size * 0.866, size * 0.5],
    ];
    return {
      descriptor: createShapeDescriptor('polygon', { vertices }),
      collider: { type: 'circle', size: [size * 2, size * 2] },
    };
  },
};

/** Resolve a {@link GeometryMode} into a concrete descriptor + collider for one entity. */
export function buildShape(size: number, geometry: GeometryMode): GeneratedShape {
  if (geometry === 'random' || geometry.length === 0) {
    return randomShape(size);
  }
  return standardShapeBuilders[pickOne(geometry)](size);
}

export function createGeneralShape(
  world: World,
  props: ShapeProps,
  geometry: GeometryMode = 'random',
): Entity {
  const shape = world.createEntity('object');
  const { descriptor, collider } = buildShape(props.size, geometry);

  shape.addComponent(
    world.createComponent(TransformComponent, {
      position: props.position,
      rotation: 0,
    }),
  );

  shape.addComponent(
    world.createComponent(PhysicsComponent, {
      velocity: props.velocity,
      speed: 0,
      maxSpeed: 100000,
      entityType: 'PROJECTILE',
    }),
  );

  shape.addComponent(
    world.createComponent(ColliderComponent, {
      type: collider.type,
      size: collider.size,
    }),
  );

  shape.addComponent(world.createComponent(ShapeComponent, { descriptor }));

  shape.addComponent(
    world.createComponent(RenderComponent, {
      color: props.color,
      layer: RenderLayerIdentifier.PROJECTILE,
    }),
  );

  // Make the entity pointer-interactive: hover/select/drag handled by
  // MouseInteractSystem, border drawn by the InteractionLayer.
  shape.addComponent(world.createComponent(InteractComponent, {}));

  return shape;
}
