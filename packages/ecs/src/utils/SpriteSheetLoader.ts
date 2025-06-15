import { AnimationData, SpriteSheetData } from '@ecs/types/animation';

export class SpriteSheetLoader {
  private static instance: SpriteSheetLoader;
  private loadedSpriteSheets: Map<string, SpriteSheetData> = new Map();

  private constructor() {}

  static getInstance(): SpriteSheetLoader {
    if (!SpriteSheetLoader.instance) {
      SpriteSheetLoader.instance = new SpriteSheetLoader();
    }
    return SpriteSheetLoader.instance;
  }

  async loadSpriteSheet(
    name: string,
    url: string,
    frameWidth: number,
    frameHeight: number,
    animations: Map<string, AnimationData>,
  ): Promise<SpriteSheetData> {
    if (this.loadedSpriteSheets.has(name)) {
      return this.loadedSpriteSheets.get(name)!;
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const spriteSheet: SpriteSheetData = {
          image: img,
          frameWidth,
          frameHeight,
          frameCount: Math.floor((img.width / frameWidth) * (img.height / frameHeight)),
          animations,
        };
        this.loadedSpriteSheets.set(name, spriteSheet);
        resolve(spriteSheet);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  getSpriteSheet(name: string): SpriteSheetData | undefined {
    return this.loadedSpriteSheets.get(name);
  }

  preloadSpriteSheets(
    spriteSheets: Array<{
      name: string;
      url: string;
      frameWidth: number;
      frameHeight: number;
      animations: Map<string, AnimationData>;
    }>,
  ): Promise<void> {
    const promises = spriteSheets.map((sheet) =>
      this.loadSpriteSheet(
        sheet.name,
        sheet.url,
        sheet.frameWidth,
        sheet.frameHeight,
        sheet.animations,
      ),
    );
    return Promise.all(promises).then(() => {});
  }
}
