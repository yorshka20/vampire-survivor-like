/**
 * ResourceManager class that manages game resources
 */
export class ResourceManager {
  private static instance: ResourceManager;
  private resources: Map<string, any> = new Map();

  private constructor() {}

  static getInstance(): ResourceManager {
    if (!ResourceManager.instance) {
      ResourceManager.instance = new ResourceManager();
    }
    return ResourceManager.instance;
  }

  async loadImage(key: string, url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.resources.set(key, img);
        resolve();
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  getImage(key: string): HTMLImageElement | undefined {
    return this.resources.get(key);
  }

  async loadAudio(key: string, url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.oncanplaythrough = () => {
        this.resources.set(key, audio);
        resolve();
      };
      audio.onerror = reject;
      audio.src = url;
    });
  }

  getAudio(key: string): HTMLAudioElement | undefined {
    return this.resources.get(key);
  }

  clear(): void {
    this.resources.clear();
  }
}
