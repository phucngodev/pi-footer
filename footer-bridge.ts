import type { ReadonlyFooterDataProvider } from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";
import type { FooterState } from "./types.ts";

export class FooterBridge implements Component {
  constructor(
    private readonly getState: () => FooterState,
    private readonly footerData: ReadonlyFooterDataProvider,
  ) {
    this.sync();
  }

  dispose(): void {}

  invalidate(): void {
    this.sync();
  }

  render(_width: number): string[] {
    this.sync();
    return [];
  }

  private sync(): void {
    const state = this.getState();
    let changed = false;

    const providerCount = this.footerData.getAvailableProviderCount();
    if (state.providers.availableCount !== providerCount) {
      state.providers.availableCount = providerCount;
      changed = true;
    }

    if (changed) state.version++;
  }
}
