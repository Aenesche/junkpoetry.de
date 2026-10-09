import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const ARTIST = "Katura Kollektiv";
const q = encodeURIComponent(ARTIST);

// Reihenfolge und Namen der Plattformen. Die Links kommen aus Supabase,
// bis dahin gelten diese Standardlinks (Suche nach dem Künstlernamen).
export const PLATFORMS = [
  { platform: "spotify",      label: "Spotify",       url: "https://open.spotify.com/artist/5HGAjazeqE2p2roBVeAtCM" },
  { platform: "applemusic",   label: "Apple Music",   url: `https://music.apple.com/de/search?term=${q}` },
  { platform: "amazonmusic",  label: "Amazon Music",  url: `https://music.amazon.de/search/${q}` },
  { platform: "tidal",        label: "Tidal",         url: `https://tidal.com/search?q=${q}` },
  { platform: "deezer",       label: "Deezer",        url: `https://www.deezer.com/de/search/${q}` },
  { platform: "youtubemusic", label: "YouTube Music", url: `https://music.youtube.com/search?q=${q}` },
  { platform: "bandcamp",     label: "Bandcamp",      url: "" },
  { platform: "soundcloud",   label: "SoundCloud",    url: "" },
];

const FALLBACK = {
  settings: { hero_image_url: null, instagram_url: null, contact_email: null },
  releases: [
    {
      title: "Too Much Detail (Live)",
      cover_url: null,
      snippet_url: "assets/audio/too-much-detail-live.mp3",
      snippet_start: 0,
      snippet_length: 15,
      link_url: "https://open.spotify.com/track/74nkMUp8OcqwJfn5S4rJxb",
      is_featured: true,
      sort_order: 0,
    },
  ],
  platforms: PLATFORMS.map((p, i) => ({ ...p, visible: !!p.url, sort_order: i })),
  concerts: [],
};

// Nur zum Ansehen des Layouts: junkpoetry.de/?demo
function demoConcerts() {
  const d = (days) => {
    const t = new Date();
    t.setDate(t.getDate() + days);
    return t.toISOString().slice(0, 10);
  };
  return [
    { date: d(9),  start_time: "20:00", city: "Berlin",  venue: "Musik & Frieden", ticket_url: "#", status: "normal", note: null },
    { date: d(23), start_time: "21:00", city: "Leipzig", venue: "Naumanns",        ticket_url: null, status: "sold_out", note: null },
    { date: d(41), start_time: null,    city: "Hamburg", venue: "Molotow",         ticket_url: null, status: "free", note: "Mit Support" },
    { date: d(66), start_time: null,    city: "Dresden", venue: "Ort folgt",       ticket_url: null, status: "tba", note: null },
  ];
}

let client = null;
export function getClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY || !window.supabase) return null;
  if (!client) client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  return client;
}

export function todayISO() {
  const t = new Date();
  const off = t.getTimezoneOffset() * 60000;
  return new Date(t - off).toISOString().slice(0, 10);
}

export async function loadSite() {
  const demo = new URLSearchParams(location.search).has("demo");
  const sb = getClient();

  if (!sb) {
    return { ...FALLBACK, concerts: demo ? demoConcerts() : [], source: "fallback" };
  }

  const [settings, concerts, releases, platforms] = await Promise.all([
    sb.from("site_settings").select("*").eq("id", 1).maybeSingle(),
    sb.from("concerts").select("*").gte("date", todayISO()).order("date").order("start_time", { nullsFirst: true }),
    sb.from("releases").select("*").order("is_featured", { ascending: false }).order("sort_order"),
    sb.from("platform_links").select("*").order("sort_order"),
  ]);

  const failed = [settings, concerts, releases, platforms].find((r) => r.error);
  if (failed) {
    console.error("Supabase:", failed.error);
    return { ...FALLBACK, concerts: null, source: "error" };
  }

  return {
    settings: settings.data || FALLBACK.settings,
    concerts: demo && concerts.data.length === 0 ? demoConcerts() : concerts.data,
    releases: releases.data.length ? releases.data : FALLBACK.releases,
    platforms: platforms.data.length ? platforms.data : FALLBACK.platforms,
    source: "supabase",
  };
}
