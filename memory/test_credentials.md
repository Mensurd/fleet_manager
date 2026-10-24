# Test kredencijali — Fleet Manager

## Admin nalozi (uloga: admin/owner)
- Email: duljevic1366@gmail.com  ·  Lozinka: fleet2026
- Email: duljevic.pr@gmail.com   ·  Lozinka: fleet2026

## Vozač (uloga: driver) — kreira admin u Podešavanja → Nalozi vozača
- Korisničko ime: `mensur`  ·  Lozinka: `vozac123`  (ima ture sa unosima)
- Korisničko ime: `mensurd` (povezan sa praznim vozačem, bez tura)
- NAPOMENA: lozinka za `mensur` je resetovana na `vozac123` (29.09.2026) radi usklađivanja sa dokumentacijom. Vlasnik može promeniti u Podešavanja → Nalozi vozača.
- Login je neosetljiv na velika/mala slova
- Login: koristi polje "Email ili korisničko ime" na /login

## Napomene
- Uloge: `admin` (pun pristup) i `driver` (samo /moje-ture — svoje ture, akontacije, troškovi).
- Admin rute (/api/dashboard, /vehicles, /drivers, /maintenance, /settlements) vraćaju 403 za vozača.
- Vozač rute: GET /api/my/tours, POST /api/my/tours/{id}/advance, POST /api/my/tours/{id}/expense.
- Kurs RSD→EUR se podešava u Podešavanja i primenjuje se na CELU aplikaciju uključujući Portal vozača (globalni CurrencyContext). TRY/BGN/HUF se unose ručno po unosu; EUR 1:1.
