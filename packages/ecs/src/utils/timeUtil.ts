export class TimeUtil {
  static now(): number {
    return performance.now();
  }

  static toMilliseconds(seconds: number): number {
    return seconds * 1000;
  }

  static toSeconds(milliseconds: number): number {
    return milliseconds / 1000;
  }
}
