# junkpoetry.de

Website der Band Junk Poetry. Statische Seite auf GitHub Pages, Inhalte kommen aus Supabase.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `index.html` | Startseite: Titel, Konzerte, Musik, Footer |
| `admin/` | Admin-Bereich zum Bearbeiten (Login über Supabase) |
| `impressum.html`, `datenschutz.html` | Rechtliches (Platzhalter noch ausfüllen) |
| `assets/js/config.js` | Supabase-URL und Publishable Key |
| `assets/js/data.js` | Laden der Inhalte, Standardinhalte ohne Supabase |
| `supabase/schema.sql` | Tabellen, Rechte (RLS) und Storage-Bucket |
| `vendor/supabase.js` | supabase-js, lokal statt CDN (DSGVO) |
| `assets/fonts/` | Shrikhand + Bricolage Grotesque, lokal gehostet |

Ohne Supabase-Konfiguration zeigt die Seite Standardinhalte. Mit `?demo` am Ende der URL erscheinen Beispiel-Konzerte, nur zum Anschauen des Layouts.

## Supabase einrichten

1. `supabase/schema.sql` im SQL-Editor ausführen.
2. Unter Authentication → Users einen Account für die Band anlegen.
3. Diesen Account zum Admin machen:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'band@example.com';
   ```
4. Unter Authentication → Sign In / Providers neue Registrierungen abschalten.
5. URL und Publishable Key in `assets/js/config.js` eintragen.

Der Publishable Key ist öffentlich. Lesen darf jede:r, schreiben nur Accounts in `public.admins`.

## Lokal ansehen

```sh
python3 -m http.server 8000
```

Dann http://localhost:8000 öffnen.
