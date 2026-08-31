// Marketplace search — the browser-safe half of market.ts (plain fetch, no fs),
// shared by the CLI and the website's theme browser.
const GALLERY = "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery";

export interface MarketTheme {
  publisher: string;
  extension: string;
  id: string; // publisher.extension
  version: string;
  displayName: string;
  description: string;
  installs: number;
  /** small icon URL from the gallery response (may be absent). */
  icon?: string;
}

/** Search the Marketplace for theme extensions matching a query, most-installed first. */
// Marketplace sortBy codes → the vscodethemes.com-style options.
export const SORT: Record<string, number> = { relevance: 0, installs: 4, trending: 10, recent: 1 };

export async function searchThemes(query: string, opts: { pageSize?: number; pageNumber?: number; sortBy?: number } = {}): Promise<MarketTheme[]> {
  const { pageSize = 20, pageNumber = 1, sortBy = 4 } = opts;
  // Empty query → browse the whole "Themes" category (top themes), like the site.
  const criteria: any[] = [
    { filterType: 8, value: "Microsoft.VisualStudio.Code" },
    { filterType: 5, value: "Themes" },
  ];
  if (query.trim()) criteria.push({ filterType: 10, value: query });
  const body = {
    filters: [{ criteria, pageNumber, pageSize, sortBy, sortOrder: 0 }],
    flags: 918, // 914 + IncludeCategoryAndTags(4), so we can drop icon-theme extensions
  };
  const res = await fetch(GALLERY, {
    method: "POST",
    headers: { Accept: "application/json;api-version=3.0-preview.1", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`marketplace query failed (${res.status})`);
  const data = (await res.json()) as any;
  const exts = data.results?.[0]?.extensions ?? [];
  // The "Themes" category also holds (a) icon / product-icon themes and (b) language/
  // tool extensions that ship a theme as a side feature (PowerShell, C/C++, …) — both
  // pollute a theme browser and often render oddly. Keep only theme-focused extensions,
  // like vscodethemes.com does.
  const TOOL_CATS = new Set(["Programming Languages", "Debuggers", "Linters", "Formatters", "Language Packs", "Extension Packs", "Testing", "Notebooks", "Data Science", "Machine Learning", "Azure", "Snippets"]);
  const isIconTheme = (e: any) => (e.tags ?? []).some((t: string) => /(^|-)icon-theme$/i.test(t) || t.toLowerCase() === "icon-theme" || t.toLowerCase() === "product-icon-theme");
  const isToolExtension = (e: any) => (e.categories ?? []).some((c: string) => TOOL_CATS.has(c));
  return exts.filter((e: any) => !isIconTheme(e) && !isToolExtension(e)).map((e: any): MarketTheme => ({
    publisher: e.publisher.publisherName,
    extension: e.extensionName,
    id: `${e.publisher.publisherName}.${e.extensionName}`,
    version: e.versions?.[0]?.version ?? "",
    displayName: e.displayName,
    description: e.shortDescription ?? "",
    installs: Number(e.statistics?.find((s: any) => s.statisticName === "install")?.value ?? 0),
    icon: (e.versions?.[0]?.files ?? []).find((f: any) => /Icons\.(Small|Default)$/.test(f.assetType))?.source,
  }));
}

