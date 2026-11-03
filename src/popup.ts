// Toolbar popup: what paints the current site, one-click starters, and the global / per-site switches.
import {
  ICONS,
  STARTERS,
  type Settings,
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
  saveSettings,
  saveStyles,
  siteLabel,
  siteMatches,
  stylesFor,
  toast,
  toggle,
} from "./shared.js";

let host: string | null = null;

/** Opens the editor, reusing an open editor tab instead of stacking new ones. */
async function openEditor(query = ""): Promise<void> {
  const base = chrome.runtime.getURL("editor.html");
  const url = `${base}${query}`;
  const [existing] = await chrome.tabs.query({ url: `${base}*` });
  if (existing?.id !== undefined) {
    await chrome.tabs.update(existing.id, { url, active: true });
    if (existing.windowId !== undefined) await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
  window.close();
}

async function render(): Promise<void> {
  const [settings, styles] = await Promise.all([getSettings(), getStyles()]);

  byId("master").replaceChildren(
    settings.enabled ? "On" : "Off",
    toggle(settings.enabled, "Repaint on all sites", (on) => void update({ ...settings, enabled: on })),
  );

  byId("site").hidden = !host;
  byId("here").hidden = !host;
  byId("quick").hidden = !host;
  byId<HTMLButtonElement>("new-style").disabled = !host;
  const notice = byId("notice");
  if (!host) {
    notice.hidden = false;
    notice.textContent = "Repaint works on regular websites. Open a site and click the drop again.";
    return;
  }

  const active = isActiveOn(settings, host);
  const here = stylesFor(styles, host);
  const painting = here.filter((s) => s.enabled).length;
  byId("site-icon").replaceChildren(favicon(host, 18));
  byId("site-host").textContent = host;
  byId("site-sub").textContent = !active
    ? "Not painted"
    : painting
      ? `${painting} ${painting === 1 ? "style" : "styles"} painting this page`
      : "No styles yet";
  const siteOff = settings.disabledSites.some((site) => siteMatches(site, host!));
  byId("site-switch").replaceChildren(
    toggle(!siteOff, `Paint ${host}`, (on) => {
      const disabledSites = on ? settings.disabledSites.filter((site) => !siteMatches(site, host!)) : [...settings.disabledSites, host!];
      void update({ ...settings, disabledSites });
    }),
  );

  notice.hidden = active;
  notice.textContent = !settings.enabled ? "Repaint is off everywhere. Switch it on at the top." : `Repaint is off on ${host}. Your styles are kept.`;

  const list = byId("styles");
  list.classList.toggle("off", !active);
  list.replaceChildren(
    ...(here.length
      ? here.map((style) => {
          const edit = h("button", { className: "btn ghost icon-btn sm", title: `Edit ${style.name}` });
          edit.setAttribute("aria-label", `Edit ${style.name}`);
          edit.append(icon(ICONS.edit));
          edit.addEventListener("click", () => void openEditor(`?id=${encodeURIComponent(style.id)}`));
          return h(
            "li",
            { className: "style-row" },
            h("div", { className: "style-text" }, h("div", { className: "style-name", textContent: style.name }), h("div", { className: "style-site", textContent: siteLabel(style.site) })),
            edit,
            toggle(style.enabled, `${style.name} on ${siteLabel(style.site)}`, (on) => void setEnabled(style.id, on)),
          );
        })
      : [h("li", { className: "empty", textContent: "Nothing paints this site yet. Try a quick style below, or write your own." })]),
  );

  byId("starters").replaceChildren(
    ...STARTERS.map((starter) => {
      const existing = styles.find((s) => s.starter === starter.id && s.site === host);
      const tile = h("button", { className: "starter", type: "button", title: starter.hint, disabled: !active });
      tile.setAttribute("aria-pressed", String(!!existing?.enabled));
      const glyph = h("span", { className: "glyph" });
      glyph.append(icon(starter.icon));
      tile.append(glyph, h("b", { textContent: starter.name }), h("span", { textContent: starter.hint }));
      tile.addEventListener("click", async () => {
        const all = await getStyles();
        const match = all.find((s) => s.starter === starter.id && s.site === host);
        if (match) {
          match.enabled = !match.enabled;
          match.updatedAt = Date.now();
          await saveStyles(all);
          toast(`${starter.name} ${match.enabled ? "on" : "off"}`);
        } else {
          await saveStyles([...all, fromStarter(starter, host!)]);
          toast(`${starter.name} added for ${host}`);
        }
        void render();
      });
      return tile;
    }),
  );
}

async function update(settings: Settings): Promise<void> {
  await saveSettings(settings);
  void render();
}

async function setEnabled(id: string, enabled: boolean): Promise<void> {
  const styles = await getStyles();
  const style = styles.find((s: Style) => s.id === id);
  if (!style) return;
  style.enabled = enabled;
  style.updatedAt = Date.now();
  await saveStyles(styles);
  void render();
}

byId("new-style").addEventListener("click", () => host && void openEditor(`?new=${encodeURIComponent(host)}`));
byId("open-editor").addEventListener("click", () => void openEditor(host ? `?site=${encodeURIComponent(host)}` : ""));

void (async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  host = hostOf(tab?.url);
  await render();
})();
