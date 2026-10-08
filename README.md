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
2. Die E-Mail des Admin-Accounts freischalten:
   ```sql
   insert into public.admin_invites (email) values ('band@example.com');
   ```
3. Unter Authentication → Users → Add user den Account mit dieser E-Mail anlegen („Auto Confirm User“ an). Er wird automatisch Admin.
4. Unter Authentication → Sign In / Providers neue Registrierungen abschalten.
5. URL und Publishable Key in `assets/js/config.js` eintragen.

Der Publishable Key ist öffentlich. Lesen darf jede:r, schreiben nur Accounts in `public.admins`.

## Lokal ansehen

```sh
python3 -m http.server 8000
```

Dann http://localhost:8000 öffnen.
