type Subscriber<T> = (value: T) => void;

class Observable<T> {
  private subscribers: Subscriber<T>[] = [];

  subscribe(subscriber: Subscriber<T>): () => void {
    this.subscribers.push(subscriber);
    return () => {
      const index = this.subscribers.indexOf(subscriber);
      if (index > -1) {
        this.subscribers.splice(index, 1);
      }
    };
  }

  notify(value: T): void {
    this.subscribers.forEach((subscriber) => subscriber(value));
  }
}

export type GameState = 'idle' | 'running' | 'paused';

interface GameStateData {
  state: GameState;
  currentWave: number;
  enemyCount: number;
  timeUntilNextWave: number;
  waveDuration: number;
  lastWaveTime: number;
}

/**
 * GameStore class that manages game state and wave-related state
 */
export class GameStore {
  private static instance: GameStore;
  private state: GameStateData;
  private state$: Observable<GameStateData>;

  private constructor() {
    this.state = {
      state: 'idle',
      currentWave: 1,
      enemyCount: 0,
      timeUntilNextWave: 0,
      waveDuration: 20000,
      lastWaveTime: 0,
    };
    this.state$ = new Observable<GameStateData>();
  }

  static getInstance(): GameStore {
    if (!GameStore.instance) {
      GameStore.instance = new GameStore();
    }
    return GameStore.instance;
  }

  // Game state methods
  start(): void {
    this.updateState({ state: 'running' });
  }

  pause(): void {
    this.updateState({ state: 'paused' });
  }

  stop(): void {
    this.updateState({ state: 'idle' });
  }

  destroy(): void {
    // Clean up if needed
  }

  // Wave-related methods
  setWave(wave: number): void {
    this.updateState({ currentWave: wave });
  }

  getWave(): number {
    return this.state.currentWave;
  }

  setEnemyCount(count: number): void {
    this.updateState({ enemyCount: count });
  }

  getEnemyCount(): number {
    return this.state.enemyCount;
  }

  setTimeUntilNextWave(time: number): void {
    this.updateState({ timeUntilNextWave: time });
  }

  getTimeUntilNextWave(): number {
    return this.state.timeUntilNextWave;
  }

  setWaveDuration(duration: number): void {
    this.updateState({ waveDuration: duration });
  }

  getWaveDuration(): number {
    return this.state.waveDuration;
  }

  setLastWaveTime(time: number): void {
    this.updateState({ lastWaveTime: time });
  }

  getLastWaveTime(): number {
    return this.state.lastWaveTime;
  }

  // Helper method to update state
  private updateState(partialState: Partial<GameStateData>): void {
    this.state = {
      ...this.state,
      ...partialState,
    };
    this.state$.notify(this.state);
  }

  // Get the state observable
  getState$() {
    return this.state$;
  }

  // Get a specific state key observable
  getStateKey$(key: keyof GameStateData): Observable<GameStateData[keyof GameStateData]> {
    const observable = new Observable<GameStateData[keyof GameStateData]>();
    this.state$.subscribe((state) => {
      observable.notify(state[key]);
    });
    return observable;
  }
}
