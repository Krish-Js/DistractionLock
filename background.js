const DEFAULTS = {
  sites: ["youtube.com", "reddit.com", "instagram.com", "tiktok.com"],
  enabled: false,
  focusUntil: 0
};

async function getState() {
  return await chrome.storage.local.get(DEFAULTS);
}

function cleanDomain(value) {
  return value.trim().toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0]
    .replace(/\.$/, "");
}

async function applyRules() {
  const state = await getState();
  const active = state.enabled || state.focusUntil > Date.now();
  const rules = active ? state.sites.map((site, index) => ({
    id: index + 1,
    priority: 1,
    action: { type: "block" },
    condition: {
      urlFilter: `||${cleanDomain(site)}^`,
      resourceTypes: ["main_frame"]
    }
  })) : [];

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map(rule => rule.id),
    addRules: rules
  });
}

async function updateFocusAlarm() {
  const state = await getState();
  await chrome.alarms.clear("focus-end");
  if (state.focusUntil > Date.now()) {
    chrome.alarms.create("focus-end", { when: state.focusUntil });
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(null);
  await chrome.storage.local.set({ ...DEFAULTS, ...current });
  await applyRules();
  await updateFocusAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  await applyRules();
  await updateFocusAlarm();
});

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === "focus-end") {
    await chrome.storage.local.set({ focusUntil: 0 });
    await applyRules();
  }
});

chrome.storage.onChanged.addListener(() => {
  applyRules();
  updateFocusAlarm();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === "add-site") {
      const state = await getState();
      const site = cleanDomain(message.site || "");
      if (!site || !site.includes(".") || /[^a-z0-9.-]/.test(site)) {
        sendResponse({ ok: false, error: "Enter a valid domain, like example.com." });
        return;
      }
      if (!state.sites.includes(site)) {
        await chrome.storage.local.set({ sites: [...state.sites, site] });
      }
      sendResponse({ ok: true });
    } else if (message.type === "remove-site") {
      const state = await getState();
      await chrome.storage.local.set({ sites: state.sites.filter(s => s !== message.site) });
      sendResponse({ ok: true });
    } else if (message.type === "start-focus") {
      const minutes = Math.max(1, Math.min(240, Number(message.minutes) || 25));
      await chrome.storage.local.set({ enabled: false, focusUntil: Date.now() + minutes * 60000 });
      sendResponse({ ok: true });
    } else if (message.type === "stop-focus") {
      await chrome.storage.local.set({ enabled: false, focusUntil: 0 });
      sendResponse({ ok: true });
    } else if (message.type === "toggle-blocking") {
      const state = await getState();
      await chrome.storage.local.set({ enabled: !state.enabled, focusUntil: 0 });
      sendResponse({ ok: true });
    } else if (message.type === "state") {
      sendResponse(await getState());
    }
  })();
  return true;
});