import { strict as assert } from "node:assert";
import { resolveModelName, shortenModel } from "../format.ts";

// The catalog `name` from models.json is preferred over the raw id.
assert.equal(
  resolveModelName({ id: "workbuddy-ai/step-5-preview", name: "Step-5-Preview" }),
  "Step-5-Preview",
  "catalog name wins over model id",
);

// Custom name overrides still take precedence over the catalog name.
assert.equal(
  resolveModelName({ id: "workbuddy-ai/step-5-preview", name: "Step-5-Preview" }, {
    "step-5": "Custom",
  }),
  "Custom",
  "custom name wins over catalog name",
);

// Without a catalog name the shortened id is used.
assert.equal(
  resolveModelName({ id: "claude-sonnet-4-20250514" }),
  shortenModel("claude-sonnet-4-20250514"),
  "falls back to shortened id",
);

// Blank catalog names are ignored.
assert.equal(
  resolveModelName({ id: "claude-sonnet-4-20250514", name: "   " }),
  "Sonnet 4",
  "blank catalog name falls back to shortened id",
);

assert.equal(resolveModelName(undefined), "no-model", "missing model renders no-model");

console.log("✓ format model name checks passed");
