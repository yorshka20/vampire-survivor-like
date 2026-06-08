import { Component } from '@ecs/core/ecs/Component';

/**
 * Tag component carried only while an entity is "active" for interaction — i.e.
 * currently hovered and/or selected. It holds no data; its sole purpose is to
 * give the World a dedicated, tiny component bucket (normally 0-2 entities) so
 * consumers can pull exactly the active entities via getEntitiesWithComponents
 * instead of scanning the full InteractComponent bucket (which, when everything
 * on screen is interactive, is every entity).
 *
 * MouseInteractSystem owns it: it attaches the tag when an entity becomes
 * hovered/selected and detaches it when neither holds. The InteractionLayer reads
 * the bucket to draw borders — with no reference to the interaction system.
 */
export class InteractActiveComponent extends Component {
  static componentName = 'InteractActive';

  constructor() {
    super(InteractActiveComponent.componentName);
  }
}
