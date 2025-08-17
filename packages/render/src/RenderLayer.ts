// RenderLayer抽象基类，供具体渲染层继承，实现IRenderLayer接口
import { IEntity } from '@ecs/core/ecs/types';
import { IRenderLayer, IRenderer } from '@ecs/systems/rendering/IRenderer';
import { RectArea } from '@ecs/utils/types';

export abstract class RenderLayer implements IRenderLayer {
  identifier: string;
  priority: number;
  visible: boolean = true;
  protected renderer: IRenderer | null = null;

  constructor(identifier: string, priority: number) {
    this.identifier = identifier;
    this.priority = priority;
  }

  initialize(renderer: IRenderer): void {
    this.renderer = renderer;
    // TODO: 初始化渲染层
  }
  abstract update(deltaTime: number, viewport: RectArea, cameraOffset: [number, number]): void;
  abstract filterEntity(entity: IEntity, viewport: RectArea): boolean;
  onResize(): void {
    // TODO: 处理窗口尺寸变化
  }
  onDestroy(): void {
    // TODO: 销毁渲染层
  }
}
