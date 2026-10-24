import { TPS_MIN_SAMPLE_MS, TPS_WINDOW_MS } from "./constants.ts";

/**
 * Source of monotonic milliseconds. Injected so tests can drive the clock
 * instead of sleeping, and so wall-clock jumps cannot skew the measurement.
 */
export type Clock = () => number;

const monotonicClock: Clock = () => performance.now();

export class TokenSpeedEngine {
  private _isStreaming = false;
  private _tokenCount = 0;
  private _startTime: number | null = null;
  private _stopTime: number | null = null;
  // Monotonic arrival times, oldest first. Pruned in recordToken, never in a getter,
  // so the buffer stays bounded even when tps is not read on every frame.
  private _tokenTimestamps: number[] = [];
  // Rate captured by stop() so the displayed value never decays after a turn.
  private _finalTps: number | null = null;

  constructor(private readonly now: Clock = monotonicClock) {}

  /**
   * Whether a streaming session is currently active
   */
  get isStreaming(): boolean {
    return this._isStreaming;
  }

  /**
   * Total number of tokens recorded since stream start
   */
  get tokenCount(): number {
    return this._tokenCount;
  }

  /**
   * Returns elapsed milliseconds since stream start (0 before start),
   * frozen at the instant stop() was called.
   */
  get elapsedMs(): number {
    if (this._startTime === null) return 0;
    const end = this._stopTime ?? this.now();
    // A backwards clock (sleep/resume) must never produce a negative duration.
    return Math.max(0, end - this._startTime);
  }

  /**
   * Returns elapsed seconds since stream start (0 if not started)
   */
  get elapsedSeconds(): number {
    return this.elapsedMs / 1000;
  }

  /**
   * Instantaneous tokens per second over the sliding window.
   *
   * Pure: it never mutates the buffer and never returns NaN, so it is safe to
   * read from the render path. While the stream is shorter than the window the
   * elapsed time is the denominator, which ramps the rate up smoothly instead of
   * switching between two different statistics mid-stream. After stop() the rate
   * frozen at stop time is returned.
   */
  get tps(): number {
    if (this._finalTps !== null) return this._finalTps;
    return this.liveTps();
  }

  /**
   * Returns average tokens per second over the whole stream, frozen after stop()
   */
  get tps_avg(): number {
    const seconds = this.elapsedSeconds;
    if (seconds === 0) return 0;
    return this._tokenCount / seconds;
  }

  /**
   * Starts a new streaming session, resetting every measurement.
   */
  start(): void {
    this._tokenCount = 0;
    this._isStreaming = true;
    this._startTime = this.now();
    this._stopTime = null;
    this._tokenTimestamps = [];
    this._finalTps = null;
  }

  /**
   * Stops streaming and freezes the current rate.
   * Repeated calls are ignored so the first frozen value wins.
   */
  stop(): void {
    if (!this._isStreaming) return;
    this._finalTps = this.liveTps();
    this._stopTime = this.now();
    this._isStreaming = false;
  }

  /**
   * Records a token. The current time is used for the sliding window.
   */
  recordToken(): void {
    if (!this._isStreaming) return;

    const now = this.now();
    this._tokenCount++;
    this._tokenTimestamps.push(now);
    this.prune(now - TPS_WINDOW_MS);
  }

  /**
   * Rate over the last TPS_WINDOW_MS, with the denominator clamped to a sane
   * sample so the first few milliseconds cannot report thousands of tokens/s.
   */
  private liveTps(): number {
    const elapsedMs = this.elapsedMs;
    if (elapsedMs === 0) return 0;
    const windowMs = Math.max(TPS_MIN_SAMPLE_MS, Math.min(elapsedMs, TPS_WINDOW_MS));
    const inWindow = this.countSince(this.now() - TPS_WINDOW_MS);
    if (inWindow === 0) return 0;
    return (inWindow * 1000) / windowMs;
  }

  /** Number of timestamps inside the window, counting back from the newest. */
  private countSince(cutoff: number): number {
    let count = 0;
    for (let i = this._tokenTimestamps.length - 1; i >= 0; i--) {
      // Half-open window (cutoff, now]: a token exactly on the edge is excluded,
      // otherwise evenly spaced tokens would be counted once too often.
      if (this._tokenTimestamps[i]! <= cutoff) break;
      count++;
    }
    return count;
  }

  /** Drop timestamps that fell out of the window, in one splice per burst. */
  private prune(cutoff: number): void {
    let drop = 0;
    while (drop < this._tokenTimestamps.length && this._tokenTimestamps[drop]! <= cutoff) {
      drop++;
    }
    if (drop > 0) this._tokenTimestamps.splice(0, drop);
  }
}
