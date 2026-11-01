/**
 * The outer nono sandbox exports NONO_CAP_FILE pointing at its capability
 * manifest for every process it starts. Its presence is the reliable signal
 * that this Pi session is sandboxed, so the footer can render a badge without
 * reading the manifest on every render.
 */
export interface SandboxStatus {
  /** True when this process was started by a nono sandbox session. */
  active: boolean;
  /** Path to the nono capability manifest, or null when unsandboxed. */
  capFile: string | null;
}

export function readSandboxStatus(): SandboxStatus {
  const capFile = process.env.NONO_CAP_FILE?.trim() || null;
  return { active: capFile !== null, capFile };
}
