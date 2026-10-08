import { loadSite } from "./data.js";
import { ICONS } from "./icons.js";

const $ = (sel) => document.querySelector(sel);

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const safeUrl = (u) => {
  if (!u) return null;
  try {
    const url = new URL(u, location.href);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};

/* ---------- Konzerte ---------- */

const fmtDay = new Intl.DateTimeFormat("de-DE", { day: "numeric" });
const fmtMonth = new Intl.DateTimeFormat("de-DE", { month: "short" });
const fmtWeekday = new Intl.DateTimeFormat("de-DE", { weekday: "short" });
const fmtLong = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

let concerts = [];
let sortMode = "asc";

function gigAction(c) {
  const ticket = safeUrl(c.ticket_url);
  switch (c.status) {
    case "sold_out": return `<span class="stamp">Ausverkauft</span>`;
    case "free":     return `<span class="stamp stamp--free">Eintritt frei</span>`;
    case "tba":      return `<span class="stamp stamp--tba">Infos folgen</span>`;
    default:
      return ticket
        ? `<a class="btn" href="${esc(ticket)}" target="_blank" rel="noopener">Tickets<span class="visually-hidden"> für ${esc(c.city)}</span></a>`
        : "";
  }
}

function renderConcerts() {
  const list = $("#gigs");

  if (concerts === null) {
    list.innerHTML = `<li class="gigs__state">Die Termine konnten gerade nicht geladen werden. Lade die Seite in ein paar Minuten neu.</li>`;
    return;
  }
  if (concerts.length === 0) {
    list.innerHTML = `<li class="gigs__state"><strong>Gerade sind keine Konzerte angekündigt.</strong><br>Neue Termine stehen hier als Erstes.</li>`;
    return;
  }

  const sorted = [...concerts].sort((a, b) => {
    if (sortMode === "city") return a.city.localeCompare(b.city, "de") || a.date.localeCompare(b.date);
    const cmp = a.date.localeCompare(b.date) || String(a.start_time ?? "").localeCompare(String(b.start_time ?? ""));
    return sortMode === "desc" ? -cmp : cmp;
  });

  list.innerHTML = sorted
    .map((c) => {
      const d = new Date(`${c.date}T12:00:00`);
      const month = fmtMonth.format(d).replace(".", "");
      const wd = fmtWeekday.format(d).replace(".", "");
      const time = c.start_time ? `, ${c.start_time.slice(0, 5)} Uhr` : "";
      const venue = c.venue ? esc(c.venue) : "Ort folgt";
      return `
        <li class="gig">
          <div class="gig__date">
            <time datetime="${esc(c.date)}" aria-label="${esc(fmtLong.format(d))}">
              <span class="gig__day" aria-hidden="true">${fmtDay.format(d)}</span>
              <span class="gig__month" aria-hidden="true">${esc(wd)}, ${esc(month)}</span>
            </time>
          </div>
          <div class="gig__info">
            <p class="gig__city">${esc(c.city)}</p>
            <p class="gig__venue">${venue}${time}</p>
            ${c.note ? `<p class="gig__note">${esc(c.note)}</p>` : ""}
          </div>
          <div class="gig__action">${gigAction(c)}</div>
        </li>`;
    })
    .join("");
}

function initSort() {
  document.querySelectorAll(".sort button").forEach((btn) => {
    btn.addEventListener("click", () => {
      sortMode = btn.dataset.sort;
      document.querySelectorAll(".sort button").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      renderConcerts();
    });
  });
}

/* ---------- Hörprobe ---------- */

function initRelease(release) {
  const box = $("#release");
  if (!release) return;

  const cover = $("#release-cover");
  const coverUrl = safeUrl(release.cover_url);
  if (coverUrl) {
    cover.innerHTML = `<img src="${esc(coverUrl)}" alt="Cover von ${esc(release.title)}">`;
  } else {
    cover.classList.add("cover--empty");
    cover.innerHTML = `<span aria-hidden="true">${esc(release.title)}</span>`;
  }
  $("#release-title").textContent = release.title;

  const hint = $("#play-hint");
  const link = safeUrl(release.link_url);
  const snippet = safeUrl(release.snippet_url);
  const len = Number(release.snippet_length) || 12;
  const start = Number(release.snippet_start) || 0;

  hint.innerHTML =
    (snippet ? `Ein Ausschnitt von etwa ${Math.round(len)} Sekunden.` : "Die Hörprobe kommt bald.") +
    (link ? ` <a href="${esc(link)}" target="_blank" rel="noopener">Ganz anhören</a>` : "");

  const btn = $("#play");
  if (!snippet) btn.hidden = true;
  box.hidden = false;
  if (!snippet) return;

  const audio = $("#snippet");
  const label = $("#play-label");
  const ring = $("#play-progress");
  const RING = 132;
  const FADE_IN = 0.4;
  const FADE_OUT = Math.min(2.5, len / 3);

  let ctx = null;
  let gain = null;
  let useGraph = true;
  let playing = false;
  let t0 = 0;
  let raf = 0;
  let stopTimer = 0;

  function setVolume(v) {
    if (gain) return;
    audio.volume = Math.max(0, Math.min(1, v));
  }

  function graph() {
    if (ctx || !useGraph) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      gain = ctx.createGain();
      ctx.createMediaElementSource(audio).connect(gain).connect(ctx.destination);
    } catch {
      useGraph = false;
      ctx = null;
      gain = null;
    }
  }

  function tick() {
    const elapsed = (performance.now() - t0) / 1000;
    const p = Math.min(1, elapsed / len);
    ring.style.strokeDashoffset = String(RING * (1 - p));
    if (!gain) {
      // Fallback ohne Web Audio: Lautstärke von Hand faden
      const fade = Math.min(elapsed / FADE_IN, (len - elapsed) / FADE_OUT, 1);
      setVolume(fade);
    }
    if (playing) raf = requestAnimationFrame(tick);
  }

  function reset() {
    playing = false;
    cancelAnimationFrame(raf);
    clearTimeout(stopTimer);
    box.classList.remove("is-playing");
    label.textContent = "Hörprobe abspielen";
    ring.style.strokeDashoffset = String(RING);
  }

  function stop(quick) {
    if (!playing) return;
    if (gain && quick) {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.25);
      setTimeout(() => audio.pause(), 260);
    } else {
      audio.pause();
    }
    reset();
  }

  async function start_() {
    graph();
    if (ctx && ctx.state === "suspended") await ctx.resume();
    if (gain) gain.gain.setValueAtTime(0, ctx.currentTime);
    else setVolume(0);

    if (audio.src !== new URL(snippet, location.href).href) audio.src = snippet;
    playing = true;
    box.classList.add("is-playing");
    label.textContent = "Stopp";

    try {
      await audio.play();
    } catch (err) {
      console.error(err);
      reset();
      hint.textContent = "Die Hörprobe lässt sich gerade nicht abspielen.";
      return;
    }
    try { audio.currentTime = start; } catch {}

    t0 = performance.now();
    if (gain) {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(1, now + FADE_IN);
      gain.gain.setValueAtTime(1, now + len - FADE_OUT);
      gain.gain.linearRampToValueAtTime(0, now + len);
    }
    stopTimer = setTimeout(() => stop(false), len * 1000 + 50);
    raf = requestAnimationFrame(tick);
  }

  btn.addEventListener("click", () => (playing ? stop(true) : start_()));
  audio.addEventListener("ended", () => stop(false));
}

/* ---------- Plattform-Karussell ---------- */

function initPlatforms(platforms) {
  const track = $("#platforms");
  const items = platforms.filter((p) => p.visible !== false && safeUrl(p.url));

  if (!items.length) {
    track.closest(".carousel").hidden = true;
    $("#platforms-titel").hidden = true;
    return;
  }

  track.innerHTML = items
    .map((p) => {
      const path = ICONS[p.platform];
      const mark = path
        ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`
        : `<span class="platform__word" aria-hidden="true">${esc(p.label).replace(" ", "<br>")}</span>`;
      return `
        <li>
          <a class="platform" href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener">
            <span class="platform__disc">${mark}</span>
            <span class="platform__name">${esc(p.label)}</span>
          </a>
        </li>`;
    })
    .join("");

  const lis = [...track.children];

  let pending = false;
  function update() {
    pending = false;
    const box = track.getBoundingClientRect();
    const mid = box.left + box.width / 2;
    lis.forEach((li) => {
      const r = li.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - mid) / (r.width * 1.4);
      li.firstElementChild.style.setProperty("--k", Math.max(0, 1 - d).toFixed(3));
    });
  }
  const schedule = () => {
    if (!pending) {
      pending = true;
      requestAnimationFrame(update);
    }
  };
  track.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  update();

  const step = () => (lis[0]?.getBoundingClientRect().width || 150) + 8;
  document.querySelector(".carousel__nav--prev").addEventListener("click", () => track.scrollBy({ left: -step() }));
  document.querySelector(".carousel__nav--next").addEventListener("click", () => track.scrollBy({ left: step() }));

  // Tastatur: fokussierte Plattform in die Mitte holen
  track.addEventListener("focusin", (e) => {
    const li = e.target.closest("li");
    if (li) li.scrollIntoView({ inline: "center", block: "nearest" });
  });
}

/* ---------- Seite ---------- */

function applySettings(settings) {
  const hero = safeUrl(settings?.hero_image_url);
  if (hero) {
    const img = new Image();
    img.onload = () => ($("#hero-img").src = hero);
    img.src = hero;
  }

  const links = [];
  const ig = safeUrl(settings?.instagram_url);
  if (ig) links.push(`<li><a href="${esc(ig)}" target="_blank" rel="noopener">Instagram</a></li>`);
  if (settings?.contact_email) {
    links.push(`<li><a href="mailto:${esc(settings.contact_email)}">Kontakt</a></li>`);
  }
  if (links.length) $("#footer-links").insertAdjacentHTML("afterbegin", links.join(""));
}

async function main() {
  initSort();
  const data = await loadSite();
  concerts = data.concerts;
  renderConcerts();
  applySettings(data.settings);
  initRelease(data.releases.find((r) => r.is_featured) || data.releases[0]);
  initPlatforms(data.platforms);
}

main();
