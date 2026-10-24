import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { loadConfig, saveConfig } from "./config.ts";
import { FooterEditor } from "./editor.ts";
import { FooterBridge } from "./footer-bridge.ts";
import { GitRefresher } from "./git.ts";
import { showFooterPane } from "./pane.ts";
import {
  clearContextUsage,
  computeUsageTotals,
  createInitialState,
  refreshContextUsage,
  refreshModel,
  refreshWorkspace,
  setGitSnapshot,
  setUsageTotals,
} from "./state.ts";
import { TokenSpeedEngine } from "./engine.ts";
import type { FooterConfig, FooterState } from "./types.ts";

export default function piFooter(pi: ExtensionAPI): void {
  let config: FooterConfig | undefined;
  let state: FooterState | undefined;
  let footerBridge: FooterBridge | undefined;
  let gitRefresher: GitRefresher | undefined;
  let requestRender: (() => void) | undefined;
  let speedEngine: TokenSpeedEngine | undefined;

  async function ensureConfig(): Promise<FooterConfig> {
    config ??= await loadConfig();
    return config;
  }

  function getConfig(): FooterConfig {
    if (!config) throw new Error("pi-footer config not loaded");
    return config;
  }

  function ensureState(ctx: ExtensionContext): FooterState {
    if (!state) {
      state = createInitialState(ctx, getConfig(), pi.getThinkingLevel());
    }
    return state;
  }

  function renderNow(): void {
    footerBridge?.invalidate();
    requestRender?.();
  }

  function ensureGitRefresher(): GitRefresher {
    gitRefresher ??= new GitRefresher(
      () => getConfig(),
      () => state?.workspace.path,
      (cwd, snapshot) => {
        if (state && setGitSnapshot(state, cwd, snapshot)) renderNow();
      },
    );
    return gitRefresher;
  }

  function scheduleGitRefresh(immediate = false): void {
    gitRefresher?.schedule(immediate);
  }

  function refreshReliableSnapshot(
    ctx: ExtensionContext,
    options: { model?: boolean; git?: boolean } = {},
  ): void {
    if (!state) return;
    const workspaceChanged = refreshWorkspace(state, ctx);
    if (options.model) refreshModel(state, ctx, getConfig(), pi.getThinkingLevel());
    setUsageTotals(state, computeUsageTotals(ctx));
    refreshContextUsage(state, ctx);
    if (options.git || workspaceChanged) scheduleGitRefresh(options.git || workspaceChanged);
  }

  function refreshThinkingLevel(ctx: ExtensionContext): void {
    if (!state) return;
    refreshModel(state, ctx, getConfig(), pi.getThinkingLevel());
  }

  function clearBridge(): void {
    footerBridge?.dispose();
    footerBridge = undefined;
  }

  function clearGitRefresher(): void {
    gitRefresher?.dispose();
    gitRefresher = undefined;
  }

  function clearUI(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;
    clearBridge();
    clearGitRefresher();
    ctx.ui.setEditorComponent(undefined);
    ctx.ui.setFooter(undefined);
    requestRender = undefined;
  }

  function installInputSurface(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;
    ensureState(ctx);
    const activeConfig = getConfig();
    if (!activeConfig.enabled) {
      clearUI(ctx);
      return;
    }

    ensureGitRefresher().schedule(true);
    clearBridge();
    ctx.ui.setFooter((tui, _theme, footerData) => {
      requestRender = () => tui.requestRender();
      footerBridge = new FooterBridge(() => state ?? ensureState(ctx), footerData);
      return footerBridge;
    });

    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      requestRender = () => tui.requestRender();
      return new FooterEditor(
        tui,
        theme,
        keybindings,
        () => state ?? ensureState(ctx),
        () => getConfig(),
        () => {
          refreshThinkingLevel(ctx);
          renderNow();
        },
      );
    });
  }

  pi.registerCommand("footer", {
    description: "Open pi-footer configuration pane",
    handler: async (_args, ctx) => {
      const current = await ensureConfig();
      ensureState(ctx);
      const result = await showFooterPane(current, ctx, state);
      if (result.action === "cancel") {
        ctx.ui.notify("pi-footer configuration cancelled", "info");
        return;
      }

      config = result.config;
      await saveConfig(config);
      if (state) {
        refreshReliableSnapshot(ctx, { model: true, git: true });
      }
      installInputSurface(ctx);
      renderNow();
      ctx.ui.notify("pi-footer configuration saved", "info");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    config = await loadConfig();
    state = createInitialState(ctx, config, pi.getThinkingLevel());
    installInputSurface(ctx);
  });

  // Token speed engine lifecycle
  pi.on("session_start", async (_event, ctx) => {
    await ensureConfig();
    ensureState(ctx);
    // Created here but not started: start() is per assistant message, so the
    // engine is never "streaming" while the session sits idle.
    speedEngine = new TokenSpeedEngine();
    if (state) state.speedEngine = speedEngine;
    installInputSurface(ctx);
  });

  pi.on("message_start", async (event, ctx) => {
    await ensureConfig();
    ensureState(ctx);
    if (event.message?.role === "assistant" && speedEngine) {
      speedEngine.start();
    }
  });

  pi.on("message_update", async (event, ctx) => {
    await ensureConfig();
    ensureState(ctx);
    const ev = event.assistantMessageEvent;
    if (ev.type === "text_delta" || ev.type === "thinking_delta") {
      if (speedEngine) {
        speedEngine.recordToken();
        // Touch the state to trigger a render; the segment reads the engine.
        if (state) state.version++;
      }
    }
  });

  pi.on("message_end", async (event, ctx) => {
    await ensureConfig();
    ensureState(ctx);
    if (event.message?.role === "assistant" && speedEngine) {
      // stop() freezes the rate, so the footer keeps the final measurement.
      speedEngine.stop();
      if (state) state.version++;
    }
  });

  pi.on("turn_end", async (_event, ctx) => {
    await ensureConfig();
    ensureState(ctx);
    if (speedEngine) {
      speedEngine.stop();
    }
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    await ensureConfig();
    ensureState(ctx);
    if (speedEngine) {
      speedEngine.stop();
    }
    clearUI(ctx);
  });

  pi.on("model_select", async (_event, ctx) => {
    await ensureConfig();
    ensureState(ctx);
    refreshReliableSnapshot(ctx, { model: true, git: true });
    renderNow();
  });

  pi.on("turn_start", async (_event, ctx) => {
    await ensureConfig();
    ensureState(ctx);
    refreshReliableSnapshot(ctx, { model: true });
    renderNow();
  });

  pi.on("tool_execution_end", async (_event, ctx) => {
    await ensureConfig();
    ensureState(ctx);
    refreshReliableSnapshot(ctx, { git: true });
    renderNow();
  });

  pi.on("session_tree", async (_event, ctx) => {
    await ensureConfig();
    ensureState(ctx);
    refreshReliableSnapshot(ctx, { model: true, git: true });
    renderNow();
  });

  pi.on("session_compact", async (_event, ctx) => {
    await ensureConfig();
    ensureState(ctx);
    refreshWorkspace(state!, ctx);
    refreshModel(state!, ctx, getConfig(), pi.getThinkingLevel());
    setUsageTotals(state!, computeUsageTotals(ctx));
    clearContextUsage(state!, ctx);
    scheduleGitRefresh(true);
    renderNow();
  });

  pi.on("message_end", async (event, ctx) => {
    await ensureConfig();
    ensureState(ctx);
    if (event.message.role === "assistant") {
      refreshReliableSnapshot(ctx);
      renderNow();
    }
  });

  pi.on("turn_end", async (_event, ctx) => {
    await ensureConfig();
    ensureState(ctx);
    refreshReliableSnapshot(ctx);
    renderNow();
  });

  pi.on("agent_end", async (_event, ctx) => {
    await ensureConfig();
    ensureState(ctx);
    refreshReliableSnapshot(ctx);
    renderNow();
  });
}
