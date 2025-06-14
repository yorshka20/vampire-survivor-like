import { ResourceManager } from './ResourceManager';

interface SoundPool {
  key: string;
  instances: HTMLAudioElement[];
  currentIndex: number;
}

export class SoundManager {
  private static instance: SoundManager;
  private pools: Map<string, SoundPool> = new Map();
  private volume: number = 0.2;
  private readonly POOL_SIZE = 5; // Number of audio instances per sound

  private lastPlayTimes: Map<string, number> = new Map(); // Track last play time for each sound
  private readonly COOLDOWN_MS = 50; // Minimum time between playing the same sound

  private constructor() {}

  static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    // Update volume for all audio instances
    this.pools.forEach((pool) => {
      pool.instances.forEach((audio) => {
        audio.volume = this.volume;
      });
    });
  }

  getVolume(): number {
    return this.volume;
  }

  private createSoundPool(key: string): SoundPool {
    const instances: HTMLAudioElement[] = [];
    const baseAudio = ResourceManager.getInstance().getAudio(key);

    if (!baseAudio) {
      throw new Error(`Sound ${key} not found in ResourceManager`);
    }

    // Create multiple instances of the audio
    for (let i = 0; i < this.POOL_SIZE; i++) {
      const audio = new Audio(baseAudio.src);
      audio.volume = this.volume;
      instances.push(audio);
    }

    return {
      key,
      instances,
      currentIndex: 0,
    };
  }

  play(key: string, volume: number = 0.5): void {
    // Check cooldown
    const lastPlayTime = this.lastPlayTimes.get(key) || 0;
    const currentTime = performance.now();
    if (currentTime - lastPlayTime < this.COOLDOWN_MS) {
      return; // Skip if cooldown hasn't elapsed
    }

    // Get or create sound pool
    let pool = this.pools.get(key);
    if (!pool) {
      try {
        pool = this.createSoundPool(key);
        this.pools.set(key, pool);
      } catch (error) {
        console.warn(`Failed to create sound pool for ${key}:`, error);
        return;
      }
    }

    // Get next available audio instance
    const audio = pool.instances[pool.currentIndex];

    // Reset and play
    audio.currentTime = 0;
    audio.volume = volume;
    audio.play().catch((err) => console.warn(`Failed to play sound ${key}:`, err));

    // Update last play time
    this.lastPlayTimes.set(key, currentTime);

    // Move to next instance
    pool.currentIndex = (pool.currentIndex + 1) % this.POOL_SIZE;
  }

  stop(key: string): void {
    const pool = this.pools.get(key);
    if (pool) {
      pool.instances.forEach((audio) => {
        audio.pause();
        audio.currentTime = 0;
      });
    }
  }

  stopAll(): void {
    this.pools.forEach((pool) => {
      pool.instances.forEach((audio) => {
        audio.pause();
        audio.currentTime = 0;
      });
    });
  }
}
