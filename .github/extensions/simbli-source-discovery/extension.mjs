// Simbli source discovery workflow.
// Use this extension to trace hidden data sources behind Simbli/eBoardSolutions
// meeting pages when the public HTML is only a shell.
//
// Usage:
// - Call `simbli_source_discovery` with a meeting URL or MID.
// - Optionally pass raw HTML when you already captured the page.
// - The tool returns the discovery summary, clues, blockers, and next step.

import { joinSession } from "@github/copilot-sdk/extension";
import { discoverSimbliSource } from "./discovery.mjs";

await joinSession({
  tools: [
    {
      name: "simbli_source_discovery",
      description:
        "Inspect Simbli/eBoardSolutions meeting pages for hidden data sources, bootstrap clues, and request paths.",
      skipPermission: true,
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "Full Simbli meeting detail URL to inspect.",
          },
          simbliId: {
            type: "string",
            description: "MID value when you only have the meeting id.",
          },
          siteId: {
            type: "string",
            description: "Optional Simbli site id. Defaults to BCBE's 200015.",
            default: "200015",
          },
          html: {
            type: "string",
            description: "Optional raw HTML captured from the page.",
          },
          repoContext: {
            type: "string",
            description: "Optional repo context or notes to include in the discovery run.",
          },
        },
      },
      handler: async (args) => discoverSimbliSource(args),
    },
  ],
});
