let selectedMinutes = 25;
const $ = id => document.getElementById(id);
const send = message => new Promise(resolve => chrome.runtime.sendMessage(message, resolve));
let sessionStart = 0;
let sessionLength = 0;

function formatTime(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2,"0")}:${String(seconds % 60).padStart(2,"0")}`;
}

function siteGlyph(site) {
  const cleaned = site.replace(/^www\./, "");
  return cleaned.slice(0, 1).toUpperCase();
}

async function render() {
  const state = await send({ type: "state" });
  if (!state) return;
  const now = Date.now();
  const timed = state.focusUntil > now;
  const active = state.enabled || timed;
  const remaining = timed ? state.focusUntil - now : 0;
  $("status").classList.toggle("on", active);
  $("status").querySelector("span").textContent = active ? "IN SESSION" : "STANDBY";
  $("timer").textContent = timed ? formatTime(remaining) : (state.enabled ? "ON" : `${String(selectedMinutes).padStart(2,"0")}:00`);
  $("start").classList.toggle("hidden", active);
  $("stop").classList.toggle("hidden", !active);
  $("session-note").textContent = active ? (timed ? "Stay with it. You’re doing great." : "Website blocking is switched on.") : "A little focus goes a long way.";
  if (timed) {
    if (!sessionStart || sessionLength !== state.focusUntil) {
      sessionStart = now;
      sessionLength = state.focusUntil - now;
    }
    const elapsedRatio = Math.min(1, Math.max(0, 1 - remaining / Math.max(sessionLength, 1)));
    $("progress").style.width = `${elapsedRatio * 100}%`;
  } else {
    sessionStart = 0;
    sessionLength = 0;
    $("progress").style.width = state.enabled ? "100%" : "0%";
  }
  $("count").textContent = state.sites.length;
  const list = $("site-list");
  list.replaceChildren();
  if (!state.sites.length) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "Your list is clear. Add a site to begin.";
    list.append(empty);
  }
  state.sites.forEach(site => {
    const li = document.createElement("li");
    const glyph = document.createElement("span");
    glyph.className = "site-glyph";
    glyph.textContent = siteGlyph(site);
    const name = document.createElement("span");
    name.className = "site-name";
    name.textContent = site;
    const remove = document.createElement("button");
    remove.className = "remove";
    remove.textContent = "×";
    remove.title = `Remove ${site}`;
    remove.setAttribute("aria-label", `Remove ${site}`);
    remove.addEventListener("click", async () => {
      await send({ type: "remove-site", site });
      render();
    });
    li.append(glyph, name, remove);
    list.append(li);
  });
  document.querySelectorAll("[data-minutes]").forEach(button => {
    button.disabled = active;
    button.classList.toggle("selected", Number(button.dataset.minutes) === selectedMinutes);
  });
}

document.querySelectorAll("[data-minutes]").forEach(button => {
  button.addEventListener("click", () => {
    selectedMinutes = Number(button.dataset.minutes);
    document.querySelectorAll("[data-minutes]").forEach(b => b.classList.toggle("selected", b === button));
    $("timer").textContent = `${String(selectedMinutes).padStart(2,"0")}:00`;
  });
});

$("start").addEventListener("click", async () => {
  await send({ type: "start-focus", minutes: selectedMinutes });
  render();
});
$("stop").addEventListener("click", async () => {
  await send({ type: "stop-focus" });
  render();
});
$("add-form").addEventListener("submit", async event => {
  event.preventDefault();
  $("error").textContent = "";
  const result = await send({ type: "add-site", site: $("site-input").value });
  if (!result?.ok) $("error").textContent = result?.error || "Could not add that domain.";
  else $("site-input").value = "";
  render();
});

render();
setInterval(render, 1000);
