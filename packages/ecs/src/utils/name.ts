import { type EntityType } from '@ecs/core/ecs/types';

export function generateEntityId(type: EntityType): string {
  return `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
