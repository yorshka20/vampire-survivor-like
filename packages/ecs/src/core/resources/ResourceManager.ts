/**
 * ResourceManager class that manages game resources
 */
export class ResourceManager {
  private static instance: ResourceManager;

  private images: Map<string, HTMLImageElement> = new Map();
  private audios: Map<string, HTMLAudioElement> = new Map();

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
        this.images.set(key, img);
        resolve();
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  getImage(key: string): HTMLImageElement | undefined {
    return this.images.get(key);
  }

  async loadAudio(key: string, url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.oncanplaythrough = () => {
        this.audios.set(key, audio);
        resolve();
      };
      audio.onerror = reject;
      audio.src = url;
    });
  }

  getAudio(key: string): HTMLAudioElement | undefined {
    return this.audios.get(key);
  }

  clear(): void {
    this.images.clear();
    this.audios.clear();
  }
}
