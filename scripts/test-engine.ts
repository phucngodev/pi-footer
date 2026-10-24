import { strict as assert } from "node:assert";
import { TPS_MIN_SAMPLE_MS, TPS_WINDOW_MS } from "../constants.ts";
import { TokenSpeedEngine } from "../engine.ts";

/** Deterministic clock so the tests never sleep. */
function makeClock(start = 10_000) {
  let current = start;
  return {
    now: () => current,
    advance(ms: number): void {
      current += ms;
    },
    /** Move the clock backwards, simulating a sleep/resume or NTP correction. */
    rewind(ms: number): void {
      current -= ms;
    },
  };
}

function near(actual: number, expected: number, message: string): void {
  assert.ok(
    Math.abs(actual - expected) < 0.01,
    `${message}: expected ~${expected}, got ${actual}`,
  );
}

/** Before start() every reading is a harmless zero. */
function assertIdle(): void {
  const clock = makeClock();
  const engine = new TokenSpeedEngine(clock.now);
  assert.equal(engine.tps, 0, "idle tps");
  assert.equal(engine.tps_avg, 0, "idle average");
  assert.equal(engine.elapsedMs, 0, "idle elapsed");
  assert.equal(engine.tokenCount, 0, "idle token count");
  assert.equal(engine.isStreaming, false, "idle is not streaming");

  // Tokens are ignored outside a stream so a stale engine cannot accumulate.
  engine.recordToken();
  assert.equal(engine.tokenCount, 0, "tokens are ignored when not streaming");
}

/** A full window of evenly spaced tokens gives the true rate. */
function assertSteadyState(): void {
  const clock = makeClock();
  const engine = new TokenSpeedEngine(clock.now);
  engine.start();
  // One token every 100ms for two seconds -> 10 tokens per second.
  for (let i = 0; i < 20; i++) {
    clock.advance(100);
    engine.recordToken();
  }
  near(engine.tps, 10, "steady state uses the full window as the denominator");
  near(engine.tps_avg, 20 / 2, "whole-stream average matches the steady rate");
}

/** Clustered tokens must not be divided by their intra-window span. */
function assertClusteredBurstDoesNotSpike(): void {
  const clock = makeClock();
  const engine = new TokenSpeedEngine(clock.now);
  engine.start();
  clock.advance(1500);
  // Three tokens arriving together: 3 tokens inside a 1s window is ~3 tok/s.
  engine.recordToken();
  engine.recordToken();
  engine.recordToken();
  near(engine.tps, 3, "a burst is measured over the window, not over its own span");

  clock.advance(20);
  near(engine.tps, 3, "the burst does not inflate 20ms later");
}

/** Same-millisecond tokens must not report zero (the old `span === 0` early return). */
function assertZeroSpanIsNotZeroRate(): void {
  const clock = makeClock();
  const engine = new TokenSpeedEngine(clock.now);
  engine.start();
  clock.advance(2000);
  engine.recordToken();
  engine.recordToken();
  const tps = engine.tps;
  assert.ok(tps > 0, `zero intra-burst span still reports a positive rate, got ${tps}`);
  near(tps, 2, "two tokens in the window is 2 tok/s");
}

/** An empty window reports zero instead of NaN. */
function assertEmptyWindowIsZero(): void {
  const clock = makeClock();
  const engine = new TokenSpeedEngine(clock.now);
  engine.start();
  engine.recordToken();
  assert.ok(Number.isFinite(engine.tps), "rate is finite while a token is in the window");

  clock.advance(TPS_WINDOW_MS + 1);
  const tps = engine.tps;
  assert.equal(tps, 0, "an empty window reports 0");
  assert.ok(Number.isFinite(tps), "an empty window never reports NaN");
  assert.equal(tps.toFixed(1), "0.0", "the formatted value stays printable");
}

/** Reading the rate must not mutate the buffer (the old getter called shift()). */
function assertTpsIsPure(): void {
  const clock = makeClock();
  const engine = new TokenSpeedEngine(clock.now);
  engine.start();
  clock.advance(1000);
  for (let i = 0; i < 5; i++) engine.recordToken();

  const first = engine.tps;
  for (let i = 0; i < 20; i++) {
    assert.equal(engine.tps, first, "repeated reads agree");
  }
  assert.equal(engine.tokenCount, 5, "reads do not change the token count");

  // If reads pruned the buffer, these tokens would be lost from the window.
  clock.advance(10);
  engine.recordToken();
  near(engine.tps, 6, "the buffer survives repeated reads");
}

/** stop() freezes the rate and every derived value. */
function assertStopFreezes(): void {
  const clock = makeClock();
  const engine = new TokenSpeedEngine(clock.now);
  engine.start();
  for (let i = 0; i < 10; i++) {
    clock.advance(100);
    engine.recordToken();
  }
  const liveTps = engine.tps;
  const liveAvg = engine.tps_avg;
  const liveElapsed = engine.elapsedMs;

  engine.stop();
  assert.equal(engine.isStreaming, false, "stop clears the streaming flag");
  assert.equal(engine.tps, liveTps, "stop keeps the final windowed rate");
  assert.equal(engine.tps_avg, liveAvg, "stop keeps the final average");
  assert.equal(engine.elapsedMs, liveElapsed, "stop freezes elapsed time");

  // Wall-clock time passing must not decay the displayed measurement.
  clock.advance(60_000);
  assert.equal(engine.tps, liveTps, "rate does not decay after stop");
  assert.equal(engine.tps_avg, liveAvg, "average does not decay after stop");
  assert.equal(engine.elapsedMs, liveElapsed, "elapsed does not grow after stop");

  // A second stop must not overwrite the frozen value.
  const beforeSecondStop = engine.tps;
  engine.stop();
  assert.equal(engine.tps, beforeSecondStop, "repeated stop keeps the first frozen rate");
}

/** A new stream resets every measurement. */
function assertStartResets(): void {
  const clock = makeClock();
  const engine = new TokenSpeedEngine(clock.now);
  engine.start();
  clock.advance(500);
  engine.recordToken();
  engine.recordToken();
  engine.stop();

  clock.advance(5000);
  engine.start();
  assert.equal(engine.tokenCount, 0, "start resets the token count");
  assert.equal(engine.elapsedMs, 0, "start resets elapsed time");
  assert.equal(engine.tps, 0, "start clears the frozen rate");
  assert.equal(engine.isStreaming, true, "start marks the stream active");
}

/** Early tokens are clamped by TPS_MIN_SAMPLE_MS instead of spiking to thousands. */
function assertWarmUpClamp(): void {
  const clock = makeClock();
  const engine = new TokenSpeedEngine(clock.now);
  engine.start();
  clock.advance(1);
  engine.recordToken();
  const tps = engine.tps;
  // One token over a 1ms span would be 1000 tok/s without the clamp.
  near(tps, 1000 / TPS_MIN_SAMPLE_MS, `warm-up is clamped to ${TPS_MIN_SAMPLE_MS}ms`);
  assert.ok(tps < 1000, `warm-up never reports 1000 tok/s, got ${tps}`);
}

/** A backwards clock cannot produce negative elapsed time or negative rates. */
function assertBackwardsClock(): void {
  const clock = makeClock();
  const engine = new TokenSpeedEngine(clock.now);
  engine.start();
  clock.advance(500);
  engine.recordToken();
  clock.rewind(1000);
  assert.ok(engine.elapsedMs >= 0, "elapsed time never goes negative");
  assert.ok(engine.tps >= 0, "rate never goes negative");
}

/** The buffer stays bounded even when the rate is never read. */
function assertBufferIsBounded(): void {
  const clock = makeClock();
  const engine = new TokenSpeedEngine(clock.now);
  engine.start();
  // 5,000 tokens spread over 100 seconds: only the last second can matter.
  for (let i = 0; i < 5000; i++) {
    clock.advance(20);
    engine.recordToken();
    // Deliberately never read engine.tps, so pruning must happen on write.
  }
  clock.advance(10);
  engine.recordToken();
  // Tokens in the last second = 1000ms / 20ms = 50, plus the final one.
  near(engine.tps, 51, "pruning on write keeps the rate correct without reads");
  assert.equal(engine.tokenCount, 5001, "pruning keeps the total count");
}

/** The formatted footer value is always printable. */
function assertFormattedValueIsPrintable(): void {
  const clock = makeClock();
  const engine = new TokenSpeedEngine(clock.now);
  engine.start();
  for (const advance of [0, 1, TPS_MIN_SAMPLE_MS, TPS_WINDOW_MS, TPS_WINDOW_MS * 2]) {
    clock.advance(advance);
    const text = `${engine.tps.toFixed(1)} tok/s`;
    assert.equal(text.includes("NaN"), false, `formatted value is printable: ${text}`);
    assert.equal(text.includes("Infinity"), false, `formatted value is finite: ${text}`);
  }
}

assertIdle();
assertSteadyState();
assertClusteredBurstDoesNotSpike();
assertZeroSpanIsNotZeroRate();
assertEmptyWindowIsZero();
assertTpsIsPure();
assertStopFreezes();
assertStartResets();
assertWarmUpClamp();
assertBackwardsClock();
assertBufferIsBounded();
assertFormattedValueIsPrintable();

console.log("✓ token speed engine checks passed");
