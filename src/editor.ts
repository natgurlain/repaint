// Full-page editor: style list grouped by site, a highlighted CSS editor that autosaves (so open tabs repaint live),
// and import/export. URL params: ?id=<style> selects one, ?new=<site> creates one, ?site=<site> focuses that site.
import { highlight } from "./highlight.js";
import {
  ALL_SITES,
  ICONS,
  STARTERS,
  type Style,
  byId,
  favicon,
  fromStarter,
  getSettings,
  getStyles,
  h,
  hostOf,
  icon,
  isActiveOn,
  newId,
  normalizeSite,
  saveSettings,
  saveStyles,
  siteLabel,
  siteMatches,
  toast,
  toggle,
} from "./shared.js";

const SAVE_DELAY = 300;
const INDENT = "  ";
const BLANK_CSS = "/* Styles for this site. They apply as you type. */\n\n";

let styles: Style[] = [];
let selectedId: string | null = null;
let search = "";
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let pendingSave = false;

const textarea = byId<HTMLTextAreaElement>("css");
const nameInput = byId<HTMLInputElement>("name");
const siteInput = byId<HTMLInputElement>("site");
const createSite = byId<HTMLInputElement>("create-site");

const selected = (): Style | undefined => styles.find((s) => s.id === selectedId);

// ---- Loading and navigation ----

async function init(): Promise<void> {
  styles = await getStyles();
  const params = new URLSearchParams(location.search);
  const newSite = params.get("new");
  const id = params.get("id");
  const site = params.get("site");
  if (newSite && normalizeSite(newSite)) {
    await createStyle(blankStyle(normalizeSite(newSite)!));
  } else if (id && styles.some((s) => s.id === id)) {
    select(id);
  } else if (site && styles.some((s) => siteMatches(s.site, site))) {
    select(styles.find((s) => siteMatches(s.site, site))!.id);
  } else {
    showCreate(site ?? "");
  }
  renderMaster();
  renderList();
}

function setUrl(params: string): void {
  history.replaceState(null, "", `${location.pathname}${params}`);
}

function select(id: string): void {
  flushSave();
  selectedId = id;
  const style = selected();
  if (!style) return showCreate("");
  setUrl(`?id=${encodeURIComponent(id)}`);
  byId("create").hidden = true;
  byId("edit").hidden = false;
  nameInput.value = style.name;
  siteInput.value = style.site;
  siteInput.classList.remove("invalid");
  byId("site-error").textContent = "";
  textarea.value = style.css;
  renderSiteFavicon(style.site);
  renderEnabled(style);
  renderCode();
  setSaveState("saved");
  void renderTabCount();
  renderList();
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

function showCreate(site: string): void {
  flushSave();
  selectedId = null;
  setUrl(site ? `?site=${encodeURIComponent(site)}` : "");
  byId("edit").hidden = true;
  byId("create").hidden = false;
  byId("create-title").textContent = styles.length ? "New style" : "Paint the web your way";
  byId("create-lede").textContent = styles.length
    ? "Which site is it for? Start from a quick style or a blank page."
    : "Pick a site, then start from a quick style or a blank page. Changes show up live in your open tabs.";
  createSite.value = site;
  renderCreate();
  renderList();
  createSite.focus();
}

// ---- Sidebar ----

function renderMaster(): void {
  void getSettings().then((settings) =>
    byId("master").replaceChildren(
      toggle(settings.enabled, settings.enabled ? "Repaint is on (all sites)" : "Repaint is off (all sites)", (on) => {
        void saveSettings({ ...settings, enabled: on }).then(() => {
          toast(on ? "Repaint is on" : "Repaint is off everywhere");
          renderMaster();
          void renderTabCount();
        });
      }),
    ),
  );
}

function renderList(): void {
  const q = search.trim().toLowerCase();
  const visible = styles.filter((s) => !q || s.name.toLowerCase().includes(q) || s.site.includes(q) || s.css.toLowerCase().includes(q));
  const groups = new Map<string, Style[]>();
  for (const style of visible) groups.set(style.site, [...(groups.get(style.site) ?? []), style]);
  const sites = [...groups.keys()].sort((a, b) => (a === ALL_SITES ? -1 : b === ALL_SITES ? 1 : a.localeCompare(b)));

  const list = byId("list");
  if (!styles.length) {
    list.replaceChildren(h("li", { className: "no-results", textContent: "No styles yet." }));
    return;
  }
  if (!visible.length) {
    list.replaceChildren(h("li", { className: "no-results", textContent: `Nothing matches “${search}”.` }));
    return;
  }
  list.replaceChildren(
    ...sites.flatMap((site) => [
      h("li", { className: "group-head" }, favicon(site), siteLabel(site), h("span", { className: "count", textContent: String(groups.get(site)!.length) })),
      ...groups.get(site)!.map((style) => {
        const pick = h("button", { className: "pick", type: "button", textContent: style.name || "Untitled", title: style.name });
        pick.addEventListener("click", () => select(style.id));
        const sw = toggle(style.enabled, `${style.name} enabled`, (on) => void setEnabled(style.id, on));
        return h("li", { className: `item${style.id === selectedId ? " selected" : ""}${style.enabled ? "" : " disabled"}` }, pick, sw);
      }),
    ]),
  );
}

// ---- Editor fields ----

function renderSiteFavicon(site: string | null): void {
  byId("site-favicon").replaceChildren(site ? favicon(site) : favicon(ALL_SITES));
}

function renderEnabled(style: Style): void {
  byId("enabled").replaceChildren(toggle(style.enabled, "Style enabled", (on) => void setEnabled(style.id, on)), style.enabled ? "On" : "Off");
}

/** Repaints the highlight layer and the line numbers, and refreshes the rule count. */
function renderCode(): void {
  const css = textarea.value;
  byId("highlight").innerHTML = highlight(css);
  const lines = css.split("\n").length;
  const current = css.slice(0, textarea.selectionStart).split("\n").length;
  const gutter = byId("gutter");
  if (gutter.childElementCount !== lines) {
    gutter.replaceChildren(...Array.from({ length: lines }, (_, i) => h("div", { textContent: String(i + 1) })));
  }
  gutter.querySelector(".current")?.classList.remove("current");
  gutter.children[current - 1]?.classList.add("current");
  syncScroll();
  renderRuleCount(css);
}

function renderRuleCount(css: string): void {
  const rules = byId("rules");
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    const n = sheet.cssRules.length;
    rules.className = "";
    rules.textContent = `${n} ${n === 1 ? "rule" : "rules"}`;
  } catch {
    rules.className = "warn";
    rules.textContent = "@import isn't supported here";
  }
}

async function renderTabCount(): Promise<void> {
  const style = selected();
  const out = byId("tabs");
  if (!style) return;
  const settings = await getSettings();
  if (!style.enabled) return void (out.textContent = "Style is off");
  const tabs = await chrome.tabs.query({});
  const n = tabs.filter((t) => {
    const host = hostOf(t.url);
    return host && siteMatches(style.site, host) && isActiveOn(settings, host);
  }).length;
  out.textContent = `Live in ${n} open ${n === 1 ? "tab" : "tabs"}`;
}

function syncScroll(): void {
  byId("highlight").style.transform = `translate(${-textarea.scrollLeft}px, ${-textarea.scrollTop}px)`;
  byId("gutter").scrollTop = textarea.scrollTop;
}

// ---- Saving ----

function setSaveState(state: "saved" | "saving" | "flash"): void {
  const el = byId("save-state");
  el.className = `dot${state === "saving" ? " saving" : state === "flash" ? " flash" : ""}`;
  el.textContent = state === "saving" ? "Saving…" : "Saved";
}

function scheduleSave(): void {
  pendingSave = true;
  setSaveState("saving");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void save(), SAVE_DELAY);
}

function flushSave(): void {
  if (pendingSave) {
    clearTimeout(saveTimer);
    void save();
  }
}

/** Writes the editor's fields into the selected style. Re-reads storage first so popup changes aren't lost. */
async function save(): Promise<void> {
  const id = selectedId;
  if (!id) return;
  const css = textarea.value;
  const name = nameInput.value.trim() || "Untitled";
  const site = normalizeSite(siteInput.value);
  pendingSave = false;
  const latest = await getStyles();
  const style = latest.find((s) => s.id === id);
  if (!style) return;
  Object.assign(style, { css, name, updatedAt: Date.now() }, site ? { site } : {});
  styles = latest;
  await saveStyles(latest);
  if (!pendingSave) setSaveState("saved");
  renderList();
  void renderTabCount();
}

async function setEnabled(id: string, enabled: boolean): Promise<void> {
  flushSave();
  const latest = await getStyles();
  const style = latest.find((s) => s.id === id);
  if (!style) return;
  style.enabled = enabled;
  style.updatedAt = Date.now();
  styles = latest;
  await saveStyles(latest);
  if (id === selectedId) renderEnabled(style);
  renderList();
  void renderTabCount();
}

// ---- Creating, duplicating, deleting ----

function blankStyle(site: string): Style {
  const name = site === ALL_SITES ? "Every site" : site;
  return { id: newId(), name, site, css: BLANK_CSS, enabled: true, updatedAt: Date.now() };
}

async function createStyle(style: Style): Promise<void> {
  styles = [...(await getStyles()), style];
  await saveStyles(styles);
  select(style.id);
}

function renderCreate(): void {
  const site = normalizeSite(createSite.value);
  byId("create-favicon").replaceChildren(favicon(site ?? ALL_SITES, 16));
  byId("create-error").textContent = createSite.value.trim() && !site ? "That doesn't look like a website. Try example.com, or * for every site." : "";
  createSite.classList.toggle("invalid", !!createSite.value.trim() && !site);

  const blank = h("button", { className: "tile blank", type: "button", disabled: !site });
  const blankGlyph = h("span", { className: "glyph" });
  blankGlyph.append(icon(ICONS.plus));
  blank.append(blankGlyph, h("b", { textContent: "Blank style" }), h("span", { textContent: "Write your own CSS from scratch" }));
  blank.addEventListener("click", () => site && void createStyle(blankStyle(site)));

  byId("tiles").replaceChildren(
    blank,
    ...STARTERS.map((starter) => {
      const tile = h("button", { className: "tile", type: "button", disabled: !site });
      const glyph = h("span", { className: "glyph" });
      glyph.append(icon(starter.icon));
      tile.append(glyph, h("b", { textContent: starter.name }), h("span", { textContent: starter.hint }));
      tile.addEventListener("click", () => site && void createStyle(fromStarter(starter, site)));
      return tile;
    }),
  );
}

async function duplicate(): Promise<void> {
  flushSave();
  const style = selected();
  if (!style) return;
  const { starter: _starter, ...rest } = style;
  await createStyle({ ...rest, id: newId(), name: `${style.name} copy`, updatedAt: Date.now() });
  toast("Duplicated");
}

const deleteButton = byId<HTMLButtonElement>("delete");
let disarm: ReturnType<typeof setTimeout> | undefined;
async function remove(): Promise<void> {
  const style = selected();
  if (!style) return;
  if (!deleteButton.classList.contains("armed")) {
    deleteButton.classList.add("armed");
    deleteButton.textContent = "Click again to delete";
    disarm = setTimeout(resetDelete, 4000);
    return;
  }
  resetDelete();
  clearTimeout(saveTimer);
  pendingSave = false;
  styles = (await getStyles()).filter((s) => s.id !== style.id);
  await saveStyles(styles);
  toast(`Deleted “${style.name}”`);
  const next = styles.find((s) => s.site === style.site) ?? styles[0];
  if (next) select(next.id);
  else showCreate(style.site === ALL_SITES ? "" : style.site);
}

function resetDelete(): void {
  clearTimeout(disarm);
  deleteButton.classList.remove("armed");
  deleteButton.textContent = "Delete";
}

// ---- Import / export ----

function exportStyles(): void {
  flushSave();
  const blob = new Blob([JSON.stringify({ app: "repaint", version: 1, styles }, null, 2)], { type: "application/json" });
  const link = h("a", { href: URL.createObjectURL(blob), download: `repaint-styles-${new Date().toISOString().slice(0, 10)}.json` });
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function importStyles(file: File): Promise<void> {
  let incoming: unknown;
  try {
    incoming = JSON.parse(await file.text());
  } catch {
    return toast("That file isn't valid JSON");
  }
  const list = Array.isArray(incoming) ? incoming : (incoming as { styles?: unknown })?.styles;
  if (!Array.isArray(list)) return toast("No styles found in that file");
  const latest = await getStyles();
  const seen = new Set(latest.map((s) => `${s.site}\n${s.name}\n${s.css}`));
  let added = 0;
  for (const raw of list as Partial<Style>[]) {
    const site = typeof raw.site === "string" ? normalizeSite(raw.site) : null;
    if (!site || typeof raw.css !== "string") continue;
    const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : site;
    const key = `${site}\n${name}\n${raw.css}`;
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push({ id: newId(), name, site, css: raw.css, enabled: raw.enabled !== false, updatedAt: Date.now() });
    added++;
  }
  styles = latest;
  await saveStyles(latest);
  toast(added ? `Imported ${added} ${added === 1 ? "style" : "styles"}` : "Nothing new to import");
  renderList();
  if (!selectedId && styles[0]) select(styles[0].id);
}

// ---- Code editing keys ----

/** Replaces the selection through the browser's editing command so Cmd/Ctrl-Z still works. */
function insert(text: string, selectStart?: number, selectEnd?: number): void {
  textarea.focus();
  document.execCommand("insertText", false, text);
  if (selectStart !== undefined) textarea.setSelectionRange(selectStart, selectEnd ?? selectStart);
  onCodeInput();
}

function lineStart(value: string, index: number): number {
  return value.lastIndexOf("\n", index - 1) + 1;
}

function onKeyDown(e: KeyboardEvent): void {
  const { value, selectionStart: start, selectionEnd: end } = textarea;

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    clearTimeout(saveTimer);
    void save().then(() => {
      setSaveState("flash");
      setTimeout(() => setSaveState("saved"), 900);
    });
    return;
  }

  if (e.key === "Tab") {
    e.preventDefault();
    const multiline = value.slice(start, end).includes("\n");
    if (!multiline && !e.shiftKey) return insert(INDENT);
    // Indent or dedent every line touched by the selection.
    const from = lineStart(value, start);
    const block = value.slice(from, end);
    const lines = block.split("\n");
    const changed = lines.map((line) => (e.shiftKey ? line.replace(new RegExp(`^ {1,${INDENT.length}}`), "") : INDENT + line));
    const next = changed.join("\n");
    textarea.setSelectionRange(from, end);
    const firstDelta = changed[0]!.length - lines[0]!.length;
    insert(next, Math.max(from, start + firstDelta), from + next.length);
    return;
  }

  if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    const indent = /^[ \t]*/.exec(value.slice(lineStart(value, start), start))![0];
    const before = value[start - 1];
    const after = value[end];
    if (before === "{" && after === "}") {
      // Open the block: cursor on an indented line, closing brace on its own line.
      return insert(`\n${indent}${INDENT}\n${indent}`, start + 1 + indent.length + INDENT.length);
    }
    return insert(`\n${indent}${before === "{" ? INDENT : ""}`);
  }

  if (e.key === "{" && start === end) {
    e.preventDefault();
    return insert("{}", start + 1);
  }

  if (e.key === "}" && start === end && value[start] === "}") {
    e.preventDefault();
    textarea.setSelectionRange(start + 1, start + 1);
    return;
  }

  if (e.key === "Backspace" && start === end && value[start - 1] === "{" && value[start] === "}") {
    e.preventDefault();
    textarea.setSelectionRange(start - 1, start + 1);
    insert("");
  }
}

function onCodeInput(): void {
  renderCode();
  scheduleSave();
}

// ---- Wiring ----

textarea.addEventListener("keydown", onKeyDown);
textarea.addEventListener("input", onCodeInput);
textarea.addEventListener("scroll", syncScroll);
for (const event of ["click", "keyup", "select"]) textarea.addEventListener(event, () => renderCode());

nameInput.addEventListener("input", scheduleSave);
nameInput.addEventListener("keydown", (e) => e.key === "Enter" && textarea.focus());
siteInput.addEventListener("input", () => {
  const site = normalizeSite(siteInput.value);
  siteInput.classList.toggle("invalid", !site);
  byId("site-error").textContent = site ? "" : "Use a domain like example.com, or * for every site";
  if (site) {
    renderSiteFavicon(site);
    scheduleSave();
  }
});
siteInput.addEventListener("blur", () => {
  const style = selected();
  const site = normalizeSite(siteInput.value);
  if (style && !site) {
    siteInput.value = style.site;
    siteInput.classList.remove("invalid");
    byId("site-error").textContent = "";
  } else if (site) siteInput.value = site;
});

createSite.addEventListener("input", renderCreate);
createSite.addEventListener("keydown", (e) => {
  const site = normalizeSite(createSite.value);
  if (e.key === "Enter" && site) void createStyle(blankStyle(site));
});

byId("search").addEventListener("input", (e) => {
  search = (e.target as HTMLInputElement).value;
  renderList();
});
byId("new").addEventListener("click", () => showCreate(selected()?.site === ALL_SITES ? "" : (selected()?.site ?? "")));
byId("duplicate").addEventListener("click", () => void duplicate());
deleteButton.addEventListener("click", () => void remove());
byId("export").addEventListener("click", exportStyles);
byId("import").addEventListener("click", () => byId<HTMLInputElement>("import-file").click());
byId<HTMLInputElement>("import-file").addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) void importStyles(file);
  input.value = "";
});

// Keep in sync with changes made elsewhere (popup switches, another editor tab). Never overwrite text being typed.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.settings) renderMaster();
  if (!changes.styles || pendingSave) return;
  styles = (changes.styles.newValue as Style[] | undefined) ?? [];
  const style = selected();
  if (style) {
    renderEnabled(style);
    if (document.activeElement !== textarea && textarea.value !== style.css) {
      textarea.value = style.css;
      renderCode();
    }
  } else if (selectedId) {
    showCreate("");
  }
  renderList();
});
window.addEventListener("beforeunload", flushSave);
if (!/Mac|iPhone|iPad/.test(navigator.platform)) byId("save-key").textContent = "Ctrl S";

void init();
