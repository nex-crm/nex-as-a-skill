/**
 * Nex context provider for Continue.dev
 *
 * Add this to your ~/.continue/config.ts to enable @nex context:
 *
 * import { nexProvider } from "./.plugins/nex-provider";
 * export default { contextProviders: [nexProvider] };
 *
 * This file is copied to ~/.continue/.plugins/nex-provider.ts by `nex setup`.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function loadApiKey(): string | null {
  try {
    const raw = readFileSync(join(homedir(), ".nex-mcp.json"), "utf-8");
    return JSON.parse(raw).api_key ?? null;
  } catch {
    return null;
  }
}

export const nexProvider = {
  title: "nex",
  displayTitle: "Nex Context",
  description: "Query organizational context, CRM, and memory from Nex",
  type: "query" as const,

  async getContextItems(query: string) {
    const apiKey = loadApiKey();
    if (!apiKey || !query.trim()) return [];

    try {
      const baseUrl = process.env.NEX_API_BASE_URL ?? "https://app.nex.ai";
      const res = await fetch(`${baseUrl}/api/developers/v1/context/ask`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) return [];
      const data = (await res.json()) as { answer?: string };
      if (!data.answer) return [];

      return [
        {
          name: "Nex Context",
          description: `Results for: ${query}`,
          content: data.answer,
        },
      ];
    } catch {
      return [];
    }
  },
};
