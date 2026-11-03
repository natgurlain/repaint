// Service worker: keeps each tab's toolbar icon (color = Repaint active there, gray = off) and badge
// (number of styles painting that tab) in sync with storage.
import { getSettings, getStyles, hostOf, isActiveOn, stylesFor } from "./shared.js";

async function updateTab(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id === undefined) return;
  const host = hostOf(tab.url);
  const [settings, styles] = await Promise.all([getSettings(), getStyles()]);
  const active = !!host && isActiveOn(settings, host);
  const count = host && active ? stylesFor(styles, host).filter((s) => s.enabled).length : 0;
  const state = active || !host ? "on" : "off";
  try {
    await chrome.action.setIcon({
      tabId: tab.id,
      path: Object.fromEntries([16, 32, 48].map((size) => [size, `icons/${state}-${size}.png`])),
    });
    await chrome.action.setBadgeText({ tabId: tab.id, text: count ? String(count) : "" });
  } catch {
    // The tab closed while we were updating it.
  }
}

async function updateAllTabs(): Promise<void> {
  for (const tab of await chrome.tabs.query({})) await updateTab(tab);
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.action.setBadgeBackgroundColor({ color: "#d55181" });
  void updateAllTabs();
});
chrome.runtime.onStartup.addListener(() => void updateAllTabs());
chrome.tabs.onUpdated.addListener((_id, change, tab) => (change.url || change.status === "complete") && void updateTab(tab));
chrome.tabs.onActivated.addListener(({ tabId }) => void chrome.tabs.get(tabId).then(updateTab, () => undefined));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.styles || changes.settings)) void updateAllTabs();
});
