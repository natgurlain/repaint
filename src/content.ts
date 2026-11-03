// Runs in every page at document_start: injects one <style> per enabled style that matches this site and keeps
// them in sync with storage, so edits in the editor show up live. Content scripts can't import modules, so the
// matching rule is repeated here; keep it in sync with siteMatches() in shared.ts.

(() => {
  interface StoredStyle {
    id: string;
    site: string;
    css: string;
    enabled: boolean;
  }
  interface StoredSettings {
    enabled?: boolean;
    disabledSites?: string[];
  }

  const host = location.hostname.replace(/^www\./, "");
  const matches = (site: string) => site === "*" || host === site || host.endsWith(`.${site}`);
  const ATTR = "data-repaint";

  async function apply(): Promise<void> {
    const { styles, settings } = (await chrome.storage.local.get(["styles", "settings"])) as {
      styles?: StoredStyle[];
      settings?: StoredSettings;
    };
    const active = settings?.enabled !== false && !(settings?.disabledSites ?? []).some(matches);
    const wanted = active ? (styles ?? []).filter((s) => s.enabled && matches(s.site)) : [];

    const existing = new Map<string, HTMLStyleElement>();
    document.querySelectorAll<HTMLStyleElement>(`style[${ATTR}]`).forEach((el) => existing.set(el.getAttribute(ATTR)!, el));
    for (const style of wanted) {
      let el = existing.get(style.id);
      if (!el) {
        el = document.createElement("style");
        el.setAttribute(ATTR, style.id);
        document.documentElement.append(el);
      }
      if (el.textContent !== style.css) el.textContent = style.css;
      existing.delete(style.id);
    }
    existing.forEach((el) => el.remove());
  }

  // At document_start the <head> doesn't exist yet, so the site's own stylesheets would end up after ours and win
  // ties. Once the page has parsed, move our styles to the very end so they come last in the cascade.
  function moveToEnd(): void {
    document.querySelectorAll(`style[${ATTR}]`).forEach((el) => document.documentElement.append(el));
  }

  void apply();
  document.addEventListener("DOMContentLoaded", moveToEnd, { once: true });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.styles || changes.settings)) void apply();
  });
})();
