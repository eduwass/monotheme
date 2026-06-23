// A faithful port of vscode-textmate's Theme matching (the engine shiki/VSCode
// use), so resolving a scope against a theme's tokenColors yields byte-identical
// colors. Ported from @shikijs/vscode-textmate (MIT). Kept tiny and dependency
// free; proven against real shiki output by test/shiki-parity.test.ts.
import type { TokenColor } from "./load.ts";
import { stripAlpha } from "./load.ts";

const NotSet = -1, Italic = 1, Bold = 2, Underline = 4, Strikethrough = 8;

interface ParsedRule {
  scope: string;
  parentScopes: string[] | null;
  index: number;
  fontStyle: number;
  foreground: string | null;
}

function parseFontStyle(s: unknown): number {
  if (typeof s !== "string") return NotSet;
  let fs = 0;
  for (const seg of s.split(" ")) {
    if (seg === "italic") fs |= Italic;
    else if (seg === "bold") fs |= Bold;
    else if (seg === "underline") fs |= Underline;
    else if (seg === "strikethrough") fs |= Strikethrough;
  }
  return fs;
}

function parseTheme(tokens: TokenColor[]): ParsedRule[] {
  const out: ParsedRule[] = [];
  tokens.forEach((entry, i) => {
    if (!entry.settings) return;
    let scopes: string[];
    if (typeof entry.scope === "string") {
      scopes = entry.scope.replace(/^,+/, "").replace(/,+$/, "").split(",");
    } else if (Array.isArray(entry.scope)) {
      scopes = entry.scope; // array elements are NOT comma-split
    } else {
      scopes = [""];
    }
    const fontStyle = parseFontStyle(entry.settings.fontStyle);
    const fg = typeof entry.settings.foreground === "string" ? stripAlpha(entry.settings.foreground) : null;
    for (const raw of scopes) {
      const segs = raw.trim().split(" ");
      const scope = segs[segs.length - 1]!;
      const parentScopes = segs.length > 1 ? segs.slice(0, -1).reverse() : null;
      out.push({ scope, parentScopes, index: i, fontStyle, foreground: fg });
    }
  });
  return out;
}

function strcmp(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
function strArrCmp(a: string[] | null, b: string[] | null): number {
  if (a === null && b === null) return 0;
  if (!a) return -1;
  if (!b) return 1;
  const d = a.length - b.length;
  if (d !== 0) return d;
  for (let i = 0; i < a.length; i++) { const c = strcmp(a[i]!, b[i]!); if (c) return c; }
  return 0;
}
function matchesScope(scopeName: string, pattern: string): boolean {
  return pattern === scopeName || (scopeName.startsWith(pattern) && scopeName[pattern.length] === ".");
}
// scopePath: ancestor scopes deepest→shallowest.
function pathMatchesParents(scopePath: string[], parentScopes: string[]): boolean {
  if (parentScopes.length === 0) return true;
  let pi = 0;
  for (let index = 0; index < parentScopes.length; index++) {
    let pattern = parentScopes[index]!;
    let mustMatch = false;
    if (pattern === ">") {
      if (index === parentScopes.length - 1) return false;
      pattern = parentScopes[++index]!;
      mustMatch = true;
    }
    let broke = false;
    while (pi < scopePath.length) {
      if (matchesScope(scopePath[pi]!, pattern)) { broke = true; break; }
      if (mustMatch) return false;
      pi++;
    }
    if (!broke) return false;
    pi++;
  }
  return true;
}

class TrieRule {
  constructor(
    public scopeDepth: number,
    public parentScopes: string[],
    public fontStyle: number,
    public foreground: string | null,
  ) {}
  clone(): TrieRule { return new TrieRule(this.scopeDepth, this.parentScopes, this.fontStyle, this.foreground); }
  static cloneArr(a: TrieRule[]): TrieRule[] { return a.map((r) => r.clone()); }
  acceptOverwrite(scopeDepth: number, fontStyle: number, foreground: string | null): void {
    if (this.scopeDepth <= scopeDepth) this.scopeDepth = scopeDepth;
    if (fontStyle !== NotSet) this.fontStyle = fontStyle;
    if (foreground !== null) this.foreground = foreground;
  }
}

class TrieElement {
  constructor(
    private mainRule: TrieRule,
    private rulesWithParentScopes: TrieRule[] = [],
    private children: Record<string, TrieElement> = {},
  ) {}

  private static cmp(a: TrieRule, b: TrieRule): number {
    if (a.scopeDepth !== b.scopeDepth) return b.scopeDepth - a.scopeDepth;
    let ai = 0, bi = 0;
    while (true) {
      if (a.parentScopes[ai] === ">") ai++;
      if (b.parentScopes[bi] === ">") bi++;
      if (ai >= a.parentScopes.length || bi >= b.parentScopes.length) break;
      const diff = b.parentScopes[bi]!.length - a.parentScopes[ai]!.length;
      if (diff !== 0) return diff;
      ai++; bi++;
    }
    return b.parentScopes.length - a.parentScopes.length;
  }

  match(scope: string): TrieRule[] {
    if (scope !== "") {
      const dot = scope.indexOf(".");
      const head = dot === -1 ? scope : scope.slice(0, dot);
      const tail = dot === -1 ? "" : scope.slice(dot + 1);
      if (Object.prototype.hasOwnProperty.call(this.children, head)) {
        return this.children[head]!.match(tail);
      }
    }
    return [...this.rulesWithParentScopes, this.mainRule].sort(TrieElement.cmp);
  }

  insert(scopeDepth: number, scope: string, parentScopes: string[] | null, fontStyle: number, foreground: string | null): void {
    if (scope === "") { this.doInsertHere(scopeDepth, parentScopes, fontStyle, foreground); return; }
    const dot = scope.indexOf(".");
    const head = dot === -1 ? scope : scope.slice(0, dot);
    const tail = dot === -1 ? "" : scope.slice(dot + 1);
    let child = this.children[head];
    if (!child) {
      child = new TrieElement(this.mainRule.clone(), TrieRule.cloneArr(this.rulesWithParentScopes));
      this.children[head] = child;
    }
    child.insert(scopeDepth + 1, tail, parentScopes, fontStyle, foreground);
  }

  private doInsertHere(scopeDepth: number, parentScopes: string[] | null, fontStyle: number, foreground: string | null): void {
    if (parentScopes === null) { this.mainRule.acceptOverwrite(scopeDepth, fontStyle, foreground); return; }
    for (const rule of this.rulesWithParentScopes) {
      if (strArrCmp(rule.parentScopes, parentScopes) === 0) {
        rule.acceptOverwrite(scopeDepth, fontStyle, foreground);
        return;
      }
    }
    if (fontStyle === NotSet) fontStyle = this.mainRule.fontStyle;
    if (foreground === null) foreground = this.mainRule.foreground;
    this.rulesWithParentScopes.push(new TrieRule(scopeDepth, parentScopes, fontStyle, foreground));
  }
}

export interface ThemeMatcher {
  /** Resolve an outer→inner scope stack to its foreground + font style. */
  match(stack: string[]): { fg: string | null; fontStyle: number };
  defaultFg: string | null;
}

const cache = new WeakMap<TokenColor[], ThemeMatcher>();

export function buildMatcher(tokens: TokenColor[]): ThemeMatcher {
  const cached = cache.get(tokens);
  if (cached) return cached;

  const rules = parseTheme(tokens);
  rules.sort((a, b) => {
    let r = strcmp(a.scope, b.scope);
    if (r !== 0) return r;
    r = strArrCmp(a.parentScopes, b.parentScopes);
    if (r !== 0) return r;
    return a.index - b.index;
  });

  let defaultFontStyle = 0, defaultFg: string | null = null;
  while (rules.length && rules[0]!.scope === "") {
    const d = rules.shift()!;
    if (d.fontStyle !== NotSet) defaultFontStyle = d.fontStyle;
    if (d.foreground !== null) defaultFg = d.foreground;
  }

  const root = new TrieElement(new TrieRule(0, [], NotSet, null), []);
  for (const r of rules) root.insert(0, r.scope, r.parentScopes, r.fontStyle, r.foreground);

  const matcher: ThemeMatcher = {
    defaultFg,
    match(stack: string[]) {
      let fg = defaultFg, fontStyle = defaultFontStyle;
      // walk outer→inner; each scope's effective rule overrides set fields,
      // mirroring the tokenizer's incremental metadata merge (deeper wins).
      for (let k = 0; k < stack.length; k++) {
        const candidates = root.match(stack[k]!);
        const parentPath = stack.slice(0, k).reverse(); // ancestors deepest→shallowest
        const eff = candidates.find((r) => pathMatchesParents(parentPath, r.parentScopes));
        if (eff) {
          if (eff.foreground !== null) fg = eff.foreground;
          if (eff.fontStyle !== NotSet) fontStyle = eff.fontStyle;
        }
      }
      return { fg, fontStyle };
    },
  };
  cache.set(tokens, matcher);
  return matcher;
}

export const FontStyleFlags = { Italic, Bold, Underline, Strikethrough };
