## 整体架构设计

### 核心模块划分

**RayTracingRenderer**：主渲染器
**SceneAdapter**：ECS到3D场景的转换层
**GeometryManager**：几何体管理和相交检测
**LightingEngine**：光照计算核心
**WorkerPool**：并行计算管理

## 关键接口设计

### 1. 主渲染器接口

```typescript
interface RayTracingRenderer {
  // 初始化渲染器
  initialize(config: RendererConfig): void;

  // 从ECS场景渲染一帧
  render(entities: Entity[], viewport: Viewport, lights: Light[]): Promise<ImageData>;

  // 更新渲染参数
  updateConfig(config: Partial<RendererConfig>): void;

  // 清理资源
  dispose(): void;
}

interface RendererConfig {
  maxBounces: number;
  samplesPerPixel: number;
  tileSize: number; // Worker任务分块大小
  defaultEntityHeight: number; // 2D实体的默认3D高度
}
```

### 2. 场景转换层接口

```typescript
interface SceneAdapter {
  // 将ECS实体转换为3D几何场景
  buildScene(entities: Entity[]): Scene3D;

  // 更新动态物体（避免重建整个场景）
  updateDynamicObjects(entities: Entity[], scene: Scene3D): void;
}

interface Scene3D {
  geometries: Geometry3D[];
  spatialIndex: SpatialIndex; // 加速结构
  bounds: BoundingBox;
}

interface Geometry3D {
  id: string; // 对应ECS实体ID
  type: 'cylinder' | 'sphere' | 'box';
  transform: Transform3D;
  material: Material;
}
```

### 3. 几何计算接口

```typescript
interface GeometryManager {
  // 光线与几何体相交测试
  rayIntersect(ray: Ray3D, geometry: Geometry3D): Intersection | null;

  // 批量相交测试（用于阴影检测）
  rayIntersectAll(ray: Ray3D, geometries: Geometry3D[]): Intersection[];

  // 构建/更新空间加速结构
  buildSpatialIndex(geometries: Geometry3D[]): SpatialIndex;
}

interface Ray3D {
  origin: Vector3;
  direction: Vector3;
  tMin: number;
  tMax: number;
}

interface Intersection {
  point: Vector3;
  normal: Vector3;
  distance: number;
  geometry: Geometry3D;
}
```

### 4. 光照计算接口

```typescript
interface LightingEngine {
  // 计算点的光照
  calculateLighting(intersection: Intersection, ray: Ray3D, lights: Light[], scene: Scene3D): Color;

  // 阴影测试
  isInShadow(point: Vector3, light: Light, scene: Scene3D): boolean;

  // 反射光线计算
  calculateReflection(ray: Ray3D, intersection: Intersection): Ray3D | null;
}

interface Light {
  type: 'point' | 'directional' | 'ambient';
  position?: Vector3; // 点光源位置
  direction?: Vector3; // 方向光方向
  color: Color;
  intensity: number;
}
```

### 5. Worker任务接口

```typescript
interface RenderTask {
  tileX: number;
  tileY: number;
  tileWidth: number;
  tileHeight: number;
  scene: Scene3D;
  lights: Light[];
  camera: Camera;
  config: RendererConfig;
}

interface RenderResult {
  tileX: number;
  tileY: number;
  pixels: Uint8ClampedArray; // RGBA像素数据
}

interface WorkerPool {
  execute(task: RenderTask): Promise<RenderResult>;
  resize(workerCount: number): void;
}
```

### 6. 相机和视口接口

```typescript
interface Camera {
  position: Vector3; // 相机位置 (x, y, height)
  target: Vector3; // 看向的点 (通常是场景中心)
  fov: number; // 视野角度
  near: number;
  far: number;
}

interface Viewport {
  width: number;
  height: number;
  pixelRatio: number;
}
```

## 实现流程

### 主渲染流程

1. **场景转换**：SceneAdapter将ECS实体转换为3D几何场景
2. **任务分割**：将屏幕分割为多个tile，创建RenderTask
3. **并行计算**：WorkerPool执行光线追踪计算
4. **结果合成**：将各个tile的结果合成最终图像

### Worker内部流程

1. **光线生成**：为tile内每个像素生成camera ray
2. **相交检测**：使用GeometryManager找到最近相交点
3. **光照计算**：使用LightingEngine计算该点的颜色
4. **递归追踪**：处理反射光线（如果需要）

### 2D到3D的映射策略

- **位置映射**：(x, y) → (x, y, 0)
- **几何映射**：圆形粒子 → 圆柱体，半径保持不变
- **高度设定**：使用defaultEntityHeight或实体特定的高度属性

这个架构的优势是模块化清晰，每个接口职责单一，便于测试和优化。你觉得这个设计思路如何？需要调整哪些部分？

// gemini conclusion

Here is a summary of the design and implementation of the ray-tracing renderer:

**Overall Goal:**
To implement a 2D ray-tracing renderer within the existing ECS (Entity Component System) game engine, replacing the standard canvas renderer to display the `createSimulator` demo scene with dynamic lighting and shadows.

**Core Design Philosophy:**
The renderer is designed as a new `RenderLayer` (`RayTracingLayer`) that integrates seamlessly into the existing `RenderSystem`. To handle the computationally intensive nature of ray tracing, the core logic is offloaded to a pool of Web Workers, allowing for parallel processing and leveraging multi-core CPUs.

**Implementation Details:**

1.  **ECS Component Integration:**

    - We defined two new components: `CameraComponent` to represent the viewer's position and properties (like FOV), and `LightSourceComponent` to define lights in the scene with properties like position, color, radius, and intensity.
    - These components can be attached to any entity, allowing for a flexible, data-driven scene setup.

2.  **`RayTracingLayer` - The Main Thread Orchestrator:**

    - **Responsibility:** This layer acts as the "brain" on the main thread. It does not perform any rendering itself. Instead, its primary jobs are to prepare the scene data, manage the web workers, and assemble the final image.
    - **Scene Preparation:** In each frame (`update` loop), it queries the ECS world to find the active camera and all light sources. It also gathers all renderable entities (those with `ShapeComponent` and `TransformComponent`).
    - **Serialization:** It then serializes this scene data—converting the complex component objects into a simple, transferable format (plain JavaScript objects)—to be sent to the workers.
    - **Task Management:** The layer divides the canvas into a grid of smaller `tiles`. It then distributes these tiles as tasks to the `WorkerPoolManager`, with each task including the complete serialized scene data.

3.  **Web Workers - The Renderers:**

    - **Responsibility:** The workers perform the actual ray-tracing calculations. Each worker receives a list of tiles it's responsible for rendering.
    - **Ray Tracing Logic:** For each pixel within a tile, the worker:
      1.  **Casts a Primary Ray:** A ray is generated from the camera's position through the pixel's location on the virtual screen.
      2.  **Finds Intersections:** It checks for intersections between this ray and the geometry of every serialized entity in the scene. It keeps track of the closest intersection point.
      3.  **Shading and Shadows:** If an intersection is found, it calculates the pixel's color. It does this by casting a "shadow ray" from the intersection point toward each light source. If this shadow ray hits another object before reaching the light, that point is in shadow for that light. Otherwise, it calculates the light's contribution to the final color based on distance and angle.
    - **Result:** The worker calculates the final RGBA value for every pixel in its assigned tiles and sends this raw pixel data back to the main thread.

4.  **Final Image Assembly:**
    - The `RayTracingLayer` listens for the results from all workers.
    - As each worker completes its tiles, the layer takes the returned pixel data and draws it into the correct position within a single `ImageData` object.
    - Once all workers have finished, this complete `ImageData` is painted onto the canvas in one single, efficient `putImageData` call, displaying the final rendered frame.

In summary, we've created a parallelized rendering pipeline where the main thread gathers and delegates work, and a pool of background workers performs the heavy lifting of ray tracing. This modular design fits cleanly into the existing ECS architecture.
