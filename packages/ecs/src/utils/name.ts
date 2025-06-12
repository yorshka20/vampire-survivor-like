import { type EntityType } from '@ecs/core/ecs/types';

export function generateEntityId(type: EntityType): string {
  // get the milliseconds from Date.now()
  const milliseconds = Date.now().toString().slice(-4);
  const random = Math.random().toString().slice(2, 9);
  // merge two number
  return `${type}-${milliseconds}${random}`;
}
