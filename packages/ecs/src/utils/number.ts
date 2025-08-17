export function randomNumber(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomNumberGenerator(min: number, max: number): () => number {
  return () => randomNumber(min, max);
}
