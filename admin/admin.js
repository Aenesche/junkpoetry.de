import { getClient, todayISO, PLATFORMS } from "../assets/js/data.js";

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const orNull = (v) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim());

const sb = getClient();
const BUCKET = "media";

/* ---------- Rückmeldungen ---------- */

let toastTimer = 0;
function toast(msg, isError = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.toggle("is-error", isError);
  el.classList.add("is-on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-on"), isError ? 6000 : 2500);
}

function fail(action, error) {
  console.error(error);
  toast(`${action} hat nicht geklappt: ${error.message || error}`, true);
}

async function busy(button, fn) {
  button.disabled = true;
  try {
    await fn();
  } finally {
    button.disabled = false;
  }
}

/* ---------- Uploads ---------- */

// Fotos vor dem Upload verkleinern (spart Ladezeit auf der Seite)
async function shrinkImage(file, maxSide) {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 900_000) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.85));
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}

async function upload(folder, file) {
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const base = file.name.replace(/\.\w+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "datei";
  const path = `${folder}/${Date.now()}-${base}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: "31536000" });
  if (error) throw error;
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// relative Pfade (Platzhalter) gelten von der Hauptseite aus
const siteUrl = (u) => (u ? new URL(u, new URL("../", location.href)).href : "");

/* ---------- Tabs ---------- */

function initTabs() {
  const tabs = document.querySelectorAll("[role=tab]");
  tabs.forEach((tab) =>
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
      document.querySelectorAll("[role=tabpanel]").forEach((p) => (p.hidden = p.dataset.panel !== tab.dataset.tab));
      history.replaceState(null, "", `#${tab.dataset.tab}`);
    })
  );
  const start = location.hash.slice(1);
  const initial = [...tabs].find((t) => t.dataset.tab === start);
  if (initial) initial.click();
}

/* ---------- Konzerte ---------- */

const fmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
const STATUS = { normal: "", sold_out: "Ausverkauft", free: "Eintritt frei", tba: "Infos folgen" };
let concerts = [];

async function loadConcerts() {
  const { data, error } = await sb.from("concerts").select("*").order("date").order("start_time", { nullsFirst: true });
  if (error) return fail("Laden der Konzerte", error);
  concerts = data;
  renderConcerts();
}

function renderConcerts() {
  const showPast = $("#show-past").checked;
  const today = todayISO();
  const rows = concerts.filter((c) => showPast || c.date >= today);
  const editing = $("#concert-form").elements.id.value;
  const list = $("#concert-list");

  if (!rows.length) {
    list.innerHTML = `<li class="empty">Noch keine kommenden Konzerte. Leg oben das erste an.</li>`;
    return;
  }
  list.innerHTML = rows
    .map((c) => {
      const d = new Date(`${c.date}T12:00:00`);
      const bits = [c.venue, c.start_time ? `${c.start_time.slice(0, 5)} Uhr` : "", STATUS[c.status], c.ticket_url ? "Ticket-Link" : ""].filter(Boolean);
      return `
        <li class="row ${c.date < today ? "row--past" : ""} ${c.id === editing ? "row--editing" : ""}">
          <span class="row__date">${esc(fmt.format(d))}</span>
          <span class="row__main"><strong>${esc(c.city)}</strong><span>${esc(bits.join(", "))}</span></span>
          <span class="row__actions">
            <button class="btn btn--ghost btn--small" type="button" data-edit="${c.id}">Bearbeiten</button>
            <button class="btn btn--danger btn--small" type="button" data-del="${c.id}">Löschen</button>
          </span>
        </li>`;
    })
    .join("");
}

function resetConcertForm() {
  const f = $("#concert-form");
  f.reset();
  f.elements.id.value = "";
  $("#concert-form-title").textContent = "Konzert hinzufügen";
  $("#concert-cancel").hidden = true;
  renderConcerts();
}

function initConcerts() {
  const f = $("#concert-form");

  f.addEventListener("submit", (e) => {
    e.preventDefault();
    busy($("#concert-submit"), async () => {
      const v = Object.fromEntries(new FormData(f));
      const row = {
        date: v.date,
        start_time: orNull(v.start_time),
        city: v.city.trim(),
        venue: (v.venue || "").trim(),
        ticket_url: orNull(v.ticket_url),
        status: v.status,
        note: orNull(v.note),
      };
      const q = v.id ? sb.from("concerts").update(row).eq("id", v.id) : sb.from("concerts").insert(row);
      const { error } = await q;
      if (error) return fail("Speichern", error);
      toast(v.id ? "Konzert gespeichert." : "Konzert hinzugefügt.");
      resetConcertForm();
      await loadConcerts();
    });
  });

  $("#concert-cancel").addEventListener("click", resetConcertForm);
  $("#show-past").addEventListener("change", renderConcerts);

  $("#concert-list").addEventListener("click", async (e) => {
    const editId = e.target.dataset.edit;
    const delId = e.target.dataset.del;
    if (editId) {
      const c = concerts.find((x) => x.id === editId);
      for (const k of ["id", "date", "city", "venue", "ticket_url", "status", "note"]) f.elements[k].value = c[k] ?? "";
      f.elements.start_time.value = c.start_time ? c.start_time.slice(0, 5) : "";
      $("#concert-form-title").textContent = "Konzert bearbeiten";
      $("#concert-cancel").hidden = false;
      renderConcerts();
      f.scrollIntoView({ behavior: "smooth", block: "start" });
      f.elements.date.focus({ preventScroll: true });
    }
    if (delId) {
      const c = concerts.find((x) => x.id === delId);
      if (!confirm(`Konzert in ${c.city} am ${fmt.format(new Date(`${c.date}T12:00:00`))} löschen?`)) return;
      const { error } = await sb.from("concerts").delete().eq("id", delId);
      if (error) return fail("Löschen", error);
      toast("Konzert gelöscht.");
      if (f.elements.id.value === delId) resetConcertForm();
      await loadConcerts();
    }
  });
}

/* ---------- Releases ---------- */

let releases = [];

async function loadReleases() {
  const { data, error } = await sb.from("releases").select("*").order("sort_order").order("created_at");
  if (error) return fail("Laden der Releases", error);
  releases = data;
  renderReleases();
}

function renderReleases() {
  const box = $("#release-list");
  box.innerHTML = "";
  if (!releases.length) {
    box.innerHTML = `<p class="empty">Noch kein Release. Füg eins hinzu, damit die Hörprobe erscheint.</p>`;
    return;
  }
  releases.forEach((r) => box.append(releaseCard(r)));
}

function releaseCard(r) {
  const card = $("#release-tpl").content.firstElementChild.cloneNode(true);
  const el = card.elements;
  el.title.value = r.title ?? "";
  el.link_url.value = r.link_url ?? "";
  el.snippet_start.value = r.snippet_start ?? 0;
  el.snippet_length.value = r.snippet_length ?? 12;
  el.sort_order.value = r.sort_order ?? 0;
  el.is_featured.checked = !!r.is_featured;

  const cover = $("[data-cover]", card);
  if (r.cover_url) cover.src = siteUrl(r.cover_url);
  const audio = $("[data-audio]", card);
  if (r.snippet_url) audio.src = siteUrl(r.snippet_url);

  el.cover.addEventListener("change", () => {
    const f = el.cover.files[0];
    if (f) cover.src = URL.createObjectURL(f);
  });
  el.snippet.addEventListener("change", () => {
    const f = el.snippet.files[0];
    if (f) audio.src = URL.createObjectURL(f);
  });

  card.addEventListener("submit", (e) => {
    e.preventDefault();
    busy(card.querySelector("[type=submit]"), async () => {
      try {
        const row = {
          title: el.title.value.trim(),
          link_url: orNull(el.link_url.value),
          snippet_start: Number(el.snippet_start.value) || 0,
          snippet_length: Number(el.snippet_length.value) || 12,
          sort_order: Number(el.sort_order.value) || 0,
          is_featured: el.is_featured.checked,
        };
        if (el.cover.files[0]) row.cover_url = await upload("covers", await shrinkImage(el.cover.files[0], 1400));
        if (el.snippet.files[0]) row.snippet_url = await upload("audio", el.snippet.files[0]);

        const { data, error } = r.id
          ? await sb.from("releases").update(row).eq("id", r.id).select().single()
          : await sb.from("releases").insert(row).select().single();
        if (error) throw error;

        if (row.is_featured) {
          const { error: e2 } = await sb.from("releases").update({ is_featured: false }).neq("id", data.id).eq("is_featured", true);
          if (e2) throw e2;
        }
        toast("Release gespeichert.");
        await loadReleases();
      } catch (err) {
        fail("Speichern", err);
      }
    });
  });

  $("[data-delete]", card).addEventListener("click", async () => {
    if (!r.id) {
      releases = releases.filter((x) => x !== r);
      return renderReleases();
    }
    if (!confirm(`„${r.title}“ löschen?`)) return;
    const { error } = await sb.from("releases").delete().eq("id", r.id);
    if (error) return fail("Löschen", error);
    toast("Release gelöscht.");
    await loadReleases();
  });

  return card;
}

function initReleases() {
  $("#release-add").addEventListener("click", () => {
    releases.push({ title: "", snippet_start: 0, snippet_length: 12, sort_order: releases.length, is_featured: releases.length === 0 });
    renderReleases();
    const last = $("#release-list").lastElementChild;
    last.scrollIntoView({ behavior: "smooth", block: "center" });
    last.elements.title.focus({ preventScroll: true });
  });
}

/* ---------- Plattformen ---------- */

let platforms = [];

async function loadPlatforms() {
  const { data, error } = await sb.from("platform_links").select("*").order("sort_order");
  if (error) return fail("Laden der Plattformen", error);
  // fehlende Standard-Plattformen ergänzen
  const known = new Set(data.map((p) => p.platform));
  platforms = [...data, ...PLATFORMS.filter((p) => !known.has(p.platform)).map((p) => ({ ...p, url: null, visible: false }))];
  renderPlatforms();
}

function renderPlatforms() {
  $("#platform-list").innerHTML = platforms
    .map(
      (p, i) => `
      <li class="row" data-platform="${esc(p.platform)}">
        <span class="row__label">${esc(p.label)}</span>
        <input type="url" name="url" value="${esc(p.url ?? "")}" placeholder="https://" aria-label="Link zu ${esc(p.label)}">
        <label class="check"><input type="checkbox" name="visible" ${p.visible ? "checked" : ""}> Zeigen</label>
        <span class="order">
          <button type="button" data-move="-1" data-i="${i}" aria-label="${esc(p.label)} nach oben" ${i === 0 ? "disabled" : ""}>↑</button>
          <button type="button" data-move="1" data-i="${i}" aria-label="${esc(p.label)} nach unten" ${i === platforms.length - 1 ? "disabled" : ""}>↓</button>
        </span>
      </li>`
    )
    .join("");
}

function readPlatformInputs() {
  document.querySelectorAll("#platform-list .row").forEach((row, i) => {
    platforms[i].url = orNull($("[name=url]", row).value);
    platforms[i].visible = $("[name=visible]", row).checked;
  });
}

function initPlatforms() {
  $("#platform-list").addEventListener("click", (e) => {
    const move = Number(e.target.dataset.move);
    if (!move) return;
    readPlatformInputs();
    const i = Number(e.target.dataset.i);
    const j = i + move;
    [platforms[i], platforms[j]] = [platforms[j], platforms[i]];
    renderPlatforms();
    $(`[data-i="${j}"][data-move="${move}"]`)?.focus();
  });

  $("#platform-form").addEventListener("submit", (e) => {
    e.preventDefault();
    busy(e.submitter, async () => {
      readPlatformInputs();
      const rows = platforms.map((p, i) => ({ platform: p.platform, label: p.label, url: p.url, visible: p.visible, sort_order: i }));
      const { error } = await sb.from("platform_links").upsert(rows, { onConflict: "platform" });
      if (error) return fail("Speichern", error);
      toast("Plattformen gespeichert.");
      await loadPlatforms();
    });
  });
}

/* ---------- Seite ---------- */

let settings = {};

async function loadSettings() {
  const { data, error } = await sb.from("site_settings").select("*").eq("id", 1).maybeSingle();
  if (error) return fail("Laden der Einstellungen", error);
  settings = data || { id: 1 };
  const f = $("#site-form");
  f.elements.instagram_url.value = settings.instagram_url ?? "";
  f.elements.contact_email.value = settings.contact_email ?? "";
  $("#hero-preview").src = settings.hero_image_url || "../assets/img/hero.jpg";
  $("#hero-reset").hidden = !settings.hero_image_url;
}

function initSettings() {
  const f = $("#site-form");
  f.elements.hero.addEventListener("change", () => {
    const file = f.elements.hero.files[0];
    if (file) $("#hero-preview").src = URL.createObjectURL(file);
  });

  $("#hero-reset").addEventListener("click", async () => {
    if (!confirm("Wieder das Standardfoto verwenden?")) return;
    const { error } = await sb.from("site_settings").upsert({ id: 1, hero_image_url: null });
    if (error) return fail("Zurücksetzen", error);
    toast("Standardfoto ist wieder aktiv.");
    await loadSettings();
  });

  f.addEventListener("submit", (e) => {
    e.preventDefault();
    busy(e.submitter, async () => {
      try {
        const row = {
          id: 1,
          instagram_url: orNull(f.elements.instagram_url.value),
          contact_email: orNull(f.elements.contact_email.value),
        };
        const file = f.elements.hero.files[0];
        if (file) row.hero_image_url = await upload("hero", await shrinkImage(file, 2400));
        const { error } = await sb.from("site_settings").upsert(row);
        if (error) throw error;
        f.elements.hero.value = "";
        toast("Seite gespeichert.");
        await loadSettings();
      } catch (err) {
        fail("Speichern", err);
      }
    });
  });
}

/* ---------- Login ---------- */

let started = false;

async function showFor(session) {
  const loggedIn = !!session;
  $("#login").hidden = loggedIn;
  $("#logout").hidden = !loggedIn;
  $("#who").textContent = loggedIn ? session.user.email : "";
  $("#app").hidden = true;
  $("#not-admin").hidden = true;
  if (!loggedIn) return;

  const { data: isAdmin, error } = await sb.rpc("is_admin");
  if (error) return fail("Rechte prüfen", error);
  if (!isAdmin) {
    $("#not-admin").hidden = false;
    return;
  }
  $("#app").hidden = false;
  if (!started) {
    started = true;
    initTabs();
    initConcerts();
    initReleases();
    initPlatforms();
    initSettings();
  }
  await Promise.all([loadConcerts(), loadReleases(), loadPlatforms(), loadSettings()]);
}

async function main() {
  if (!sb) {
    $("#no-config").hidden = false;
    return;
  }

  $("#login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    busy(f.querySelector("button"), async () => {
      $("#login-msg").textContent = "";
      const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
      if (error) {
        $("#login-msg").textContent =
          error.message === "Invalid login credentials" ? "E-Mail oder Passwort stimmt nicht." : error.message;
      }
    });
  });
  $("#logout").addEventListener("click", () => sb.auth.signOut());

  let lastUser;
  sb.auth.onAuthStateChange((_event, session) => {
    const uid = session?.user?.id ?? null;
    if (uid === lastUser) return; // Token-Refresh ignorieren
    lastUser = uid;
    // außerhalb des Callbacks laufen lassen (Supabase-Empfehlung)
    setTimeout(() => showFor(session), 0);
  });
}

main();
