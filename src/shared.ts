// Data model, site matching, starters and small DOM helpers shared by the popup, editor and background.

export interface Style {
  id: string;
  name: string;
  /** "example.com" applies to the domain and its subdomains; "*" applies to every site. */
  site: string;
  css: string;
  enabled: boolean;
  /** Epoch ms of the last edit. */
  updatedAt: number;
  /** Set when the style was created from a starter, so the popup can show the starter as on. */
  starter?: string;
}

export interface Settings {
  /** Master switch for every site. */
  enabled: boolean;
  /** Sites where Repaint is turned off entirely (same matching as Style.site). */
  disabledSites: string[];
}

export const DEFAULT_SETTINGS: Settings = { enabled: true, disabledSites: [] };
export const ALL_SITES = "*";

export async function getStyles(): Promise<Style[]> {
  const { styles } = await chrome.storage.local.get("styles");
  return Array.isArray(styles) ? (styles as Style[]) : [];
}

export async function saveStyles(styles: Style[]): Promise<void> {
  await chrome.storage.local.set({ styles });
}

export async function getSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(settings as Partial<Settings> | undefined) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ settings });
}

export function newId(): string {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// ---- Sites ----

/** Hostname of an http(s) URL without a leading "www.", or null for other URLs. */
export function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Turns "https://www.Example.com/page" into "example.com", keeps "*"; null if it isn't a site. */
export function normalizeSite(input: string): string | null {
  const s = input.trim().toLowerCase();
  if (s === ALL_SITES) return ALL_SITES;
  if (!s) return null;
  const host = hostOf(s.includes("://") ? s : `https://${s}`);
  return host && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

/** Whether a site pattern ("example.com" or "*") covers this host. Must stay in sync with content.ts. */
export function siteMatches(site: string, host: string): boolean {
  return site === ALL_SITES || host === site || host.endsWith(`.${site}`);
}

export function isActiveOn(settings: Settings, host: string): boolean {
  return settings.enabled && !settings.disabledSites.some((site) => siteMatches(site, host));
}

/** Enabled styles that apply to a host, in list order. */
export function stylesFor(styles: Style[], host: string): Style[] {
  return styles.filter((s) => siteMatches(s.site, host));
}

export function siteLabel(site: string): string {
  return site === ALL_SITES ? "All sites" : site;
}

// ---- Starters ----

export interface Starter {
  id: string;
  name: string;
  hint: string;
  /** Inline SVG path data for the tile icon (24×24 viewBox, stroked). */
  icon: string;
  css: string;
}

export const STARTERS: Starter[] = [
  {
    id: "dark",
    name: "Dark mode",
    hint: "Invert colors, keep photos",
    icon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    css: `/* Dark mode: invert the page, then flip media back so photos look normal. */
html {
  filter: invert(1) hue-rotate(180deg) !important;
  background: #fff !important;
}

img, video, picture, canvas, iframe, svg image, [style*="background-image"] {
  filter: invert(1) hue-rotate(180deg) !important;
}
`,
  },
  {
    id: "reading",
    name: "Reading width",
    hint: "Shorter, easier lines",
    icon: '<path d="M4 6h16M7 10h10M7 14h10M4 18h16"/>',
    css: `/* Reading width: keep text columns to a comfortable length. */
main, article, [role="main"] {
  max-width: 72ch !important;
  margin-inline: auto !important;
  line-height: 1.65 !important;
}
`,
  },
  {
    id: "calm",
    name: "Calm",
    hint: "No animations",
    icon: '<path d="M3 12c3-4 6-4 9 0s6 4 9 0"/>',
    css: `/* Calm: switch off animations, transitions and smooth scrolling. */
*, *::before, *::after {
  animation: none !important;
  transition: none !important;
  scroll-behavior: auto !important;
}
`,
  },
  {
    id: "bigger",
    name: "Bigger text",
    hint: "Everything 15% larger",
    icon: '<path d="M4 18 9 6l5 12M5.8 14h6.4M15 18l3-7 3 7M15.9 16h4.2"/>',
    css: `/* Bigger text: scale the page up a little. */
html {
  zoom: 1.15;
}
`,
  },
  {
    id: "sticky",
    name: "No sticky bars",
    hint: "Headers scroll away (best effort)",
    icon: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 9h16M9 14l6 0"/>',
    css: `/* No sticky headers: let bars scroll away with the page (best effort, varies by site). */
header, nav, [class*="sticky" i], [class*="fixed" i][class*="header" i] {
  position: static !important;
}
`,
  },
];

export function fromStarter(starter: Starter, site: string): Style {
  return { id: newId(), name: starter.name, site, css: starter.css, enabled: true, updatedAt: Date.now(), starter: starter.id };
}

// ---- DOM helpers ----

/** Small element factory: h("div", { className: "x" }, "text", child). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { dataset?: Record<string, string> } = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const { dataset, ...rest } = props;
  const node = Object.assign(document.createElement(tag), rest);
  if (dataset) Object.assign(node.dataset, dataset);
  for (const child of children) if (child) node.append(child);
  return node;
}

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

/** Inline SVG icon from path data (24×24, stroked with currentColor). */
export function icon(paths: string, className = "icon"): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = paths;
  return svg;
}

export const ICONS = {
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
};

/** Browser-cached favicon for a site (needs the "favicon" permission). */
export function favicon(host: string, size = 16): HTMLElement {
  if (host === ALL_SITES) {
    const wrap = h("span", { className: "favicon globe" });
    wrap.append(icon(ICONS.globe));
    return wrap;
  }
  const img = h("img", { className: "favicon", alt: "", loading: "lazy" });
  img.src = chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(`https://${host}`)}&size=${size * 2}`);
  img.width = img.height = size;
  return img;
}

/** iOS-style switch: a checkbox with role="switch". */
export function toggle(checked: boolean, label: string, onChange: (on: boolean) => void): HTMLLabelElement {
  const input = h("input", { type: "checkbox", checked });
  input.setAttribute("role", "switch");
  input.setAttribute("aria-label", label);
  input.addEventListener("change", () => onChange(input.checked));
  return h("label", { className: "switch", title: label }, input, h("span", { className: "track" }));
}

/** Brief confirmation message at the bottom of the page. */
export function toast(message: string): void {
  const node = (document.querySelector(".toast") as HTMLElement | null) ?? document.body.appendChild(h("div", { className: "toast", role: "status" }));
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(Number(node.dataset.timer));
  node.dataset.timer = String(setTimeout(() => node.classList.remove("show"), 2200));
}
