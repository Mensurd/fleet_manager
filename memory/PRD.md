# Fleet Manager — APR MENSUR DULJEVIĆ

## Problem Statement
Fleet management app to track vehicles, drivers, document expirations, maintenance, and driver trip settlements (Obračun vozača). Generates Word/Excel/PDF reports, email/visual reminders. Includes a Driver Portal (remote expense entry with currency conversion) and dynamic settings (dropdown CRUD, custom exchange rates).

**User language: Serbian (sr-RS). Always respond in Serbian.**

## Stack
React + FastAPI + MongoDB (Motor). Role-based JWT auth (admin/driver). python-docx (Word), reportlab (PDF with LiberationSans for Serbian chars).

## Roles
- admin: full fleet management
- driver: restricted portal (assigned tours + expense/advance entry). Sensitive fields (tour_price, profit, maintenance) stripped from driver responses.

## Key DB Schema
- users: {email, username, password_hash, role, driver_id}
- settlements: {driver_id, vehicle_id, tour_price, profit, driver_pay, advance_given, expenses[], waiting_allowance, alerts}
- lookups: {type, value}
- settings: {rsd_per_eur, big_expense_eur}

## Credentials (see test_credentials.md)
- Admin: duljevic1366@gmail.com / fleet2026
- Driver: username `mdasd dada` / vozac123

## Implemented (latest first)
- **29.09.2026 (10)**: Bugfix — globalni klizač valute nije radio na strani Održavanje (i delovima Dashboard/Reports/VehicleDetail koji su koristili lokalni rsd()). Sve površine sa troškovima održavanja sada koriste `useCurrency().money(toEur(zapis))` (konverzija RSD→EUR→izabrana valuta po kursu iz /settings/rates). Popravljeni i zbirovi (totalCost su sada u EUR bazi). Testing agent iter23: 100% frontend PASS (Maintenance primarni bug + Dashboard + Reports + VehicleDetail + persistencija localStorage). Rezidual (minor, ne-bug): backend alert tekstovi imaju hardkodovan „€" sufiks (to su ionako EUR iznosi vozača).
- **29.09.2026 (9)**: Globalni klizač valute EUR/RSD. Novi `CurrencyContext` (context/CurrencyContext.js) — `currency` (localStorage `app_currency`), `rate` iz /settings/rates, `money(nEur)` konverter; `<CurrencySlider>` klizač u admin Layout (sidebar footer + mobilni top bar). Sve admin money strane koriste `money` kao `eur` (Dashboard, Reports, ObracunVozaca, ActiveTours) → promena valute je UŽIVO na celoj aplikaciji i u štampi (frontend print obračuna i izveštaja poštuje izbor). Uklonjen lokalni toggle sa Reports (zamenjen globalnim). Backend PDF/Word izvoz i dalje EUR. Verifikovano screenshot-om (dashboard prebačen u RSD uživo). Napomena: portal vozača i dalje prikazuje EUR.
- **29.09.2026 (8)**: (a) Vozač bira valutu troška NEZAVISNO od države — dodat currency select (RSD/EUR/TRY/BGN/HUF) uz country select (država=samo lokacija); to_eur generalizovan (RSD auto, EUR 1:1, ostalo manual kurs). Verifikovano: TRY u Srbiji 350/35=10€. (b) Održavanje sa valutom: MaintenanceCreate.cost_currency (RSD|EUR, default RSD); maint_eur() konvertuje po tekućem kursu; build_truck_earnings i dashboard total_cost sada konvertuju održavanje u EUR (dinamički — menja se sa kursom u Podešavanjima). Maintenance.js forma ima izbor valute, lista prikazuje originalnu valutu, ukupno ≈ EUR. (c) Izveštaji RSD/EUR toggle: Reports.js valuta prekidač (EUR/RSD) konvertuje sve prikazane iznose (Zarada kamiona + Zbirni izveštaj + frontend print) po kursu iz /settings/rates. Backend PDF/Word izvoz ostaje u EUR. Verifikovano curl + screenshot.
- **29.09.2026 (7)**: (a) Admin meni „Aktivne ture" (nova strana ActiveTours.js, ruta /aktivne-ture, nav MapPinned) — lista otvorenih tura sa proširivim detaljima unosa, „Uredi" (navigacija na /obracun sa location.state.editId → auto startEdit) i „Razduži turu" (PUT status=razduzeno). (b) DriverPortal: izbor države Srbija(RSD)/Bugarska(BGN)/Turska(TRY)/Mađarska(HUF)/Hrvatska(EUR); to_eur generalizovan za sve manual valute (amount/rate); RSD auto, EUR 1:1. (c) Vozač NE može da menja razduženu turu — backend 403 na /my/tours/{id}/expense i /advance ako status==razduzeno; DriverPortal podeljen na tabove „Aktivne ture" (editabilne) i „Završene ture" (read-only). Verifikovano: BGN 19.5/1.95=10€, 403 na zatvorenoj turi, UI oba naloga.
- **29.09.2026 (6)**: (a) Fix ManagedSelect — ručno ukucan tekst se sada primenjuje i kad se popover zatvori bez klika na „Dodaj" (onOpenChange prihvata query kao vrednost; ako se poklapa sa postojećom opcijom koristi kanonsku). Rešava gubitak teksta na „Troškovi preko računa firme". (b) DriverPortal polje za trošak („Opis") pretvoreno u ManagedSelect (kategorija expense_category) — vozač sada ima padajući meni sa dodavanjem/uklanjanjem/uređivanjem. Lookups rute su get_current_user pa vozač ima pristup (GET/POST/PUT/DELETE → 200). Verifikovano curl-om + screenshot (mobilni).
- **29.09.2026 (5)**: Regresija (testing agent iter22: 17/17 backend + frontend flows pass) + RBAC hardening. Osigurano require_admin na: POST/DELETE /api/settlements i /api/drivers (POST/GET/PUT/DELETE) — vozač sada dobija 403 na admin write operacije. Potvrđeno da vozač i dalje radi /my/tours (200) i da su tour_price/company_expenses/profit skriveni od vozača (invarijanta drži na 3 mesta).
- **29.09.2026 (4)**: Dodela/uređivanje tura + troškovi preko računa firme. Settlement `status` "otvorena"|"razduzeno"; dugmad "Dodeli turu vozaču"/"Razduži odmah"; PUT /api/settlements/{id} za uređivanje (čuva vozačeve unose, menja header+status, recompute); kolona Status + filter + edit po redu; auto-refresh 15s. `company_expenses` (gorivo karticom, putarine fakturom) admin unosi u zasebnoj Lock sekciji; STROGO skriveni od vozača uz `tour_price`/`profit`/`company_expenses_total` (strip u /my/tours i _recompute); ulaze u profit i trip_expenses izveštaja. Verifikovano curl-om + screenshot.
- **29.09.2026 (3)**: Admin "vidi šta je vozač uneo" — u Obračun vozača red kruga je proširiv (klik) i prikazuje detalje: sve troškove (kategorija, €, originalni iznos+valuta, država, plaćeno iz, oznaka Vozač/Admin, vreme) i pojedinačne unose akontacije. Badge sa brojem vozačevih unosa. RCA: bekend/permisije ispravni (reprodukovano curl-om); nedostajao samo admin prikaz pojedinačnih unosa. Dashboard baner /alerts već radi.
- **29.09.2026 (2)**: Opšti troškovi firme (collection `overhead_costs`, CRUD u Podešavanjima, mesečni/godišnji nivo — godišnji /12) i Godišnji troškovi po vozilu (`annual_costs` niz na vehicle dokumentu, CRUD na Detaljima vozila, srazmerno /12×meseci). build_truck_earnings sada: kolona "Godišnji fiksni" po vozilu, red "Opšti troškovi firme" (ne dele se po kamionu) i red "NETO PROFIT" (=totals.profit − overhead); polja overhead, overhead_items, net_profit, months. Dashboard "Profit firme" koristi net_profit i prikazuje i Opšte troškove. PDF/Word/print izveštaja ažurirani. Testirano curl-om (overhead 2400=100×12+1200; net=profit−overhead) + screenshot Podešavanja.
- **29.09.2026**: Dashboard "Profit firme (tekući mesec)" card.
- Hidden tour_price for profit calc; Truck Earnings Report (revenue, driver cost, trip expenses, maintenance, profit) with month/range/year filters + PDF/Word.
- Driver Portal (role JWT, admin-created driver accounts, restricted layout, multi-currency expense entry RSD/EUR auto + TRY manual).
- Real-time admin alerts (high expense / exceeded advance).
- ManagedSelect dynamic dropdown CRUD (lookups collection).
- Waiting allowances (Dnevnice za čekanje); PDF Serbian encoding (LiberationSans); Word settlement export; monthly/yearly driver summary reports; date auto-dot formatting.

## Backlog
- **P0**: Refactor server.py (~2600 lines) into modular routers (routes/auth.py, vehicles.py, settlements.py, reports.py). Isolated, thoroughly tested task.
- **P2**: Add DialogDescription/aria-describedby to all Shadcn dialogs (accessibility warnings).
- **P2**: Partial/Update Pydantic models for PUT requests (avoid serialize_vehicle mutating inputs).

## Key API endpoints
- GET /api/dashboard (now includes month_profit)
- GET /api/reports/truck-earnings?start&end (now includes top_vehicle, rows sorted by profit desc) + /pdf + /word
- POST /api/driver-accounts, GET/POST/PUT/DELETE /api/lookups, GET /api/alerts

## 29.09.2026 — Kurs iz Settings za celu aplikaciju
- DriverPortal.js sada koristi globalni useCurrency() (kurs iz /settings/rates) umesto lokalnog formatera i lokalnog rate state.
- Kurs koji admin unese u Podešavanja primenjuje se na sve stranice uključujući Portal vozača.
- Strane valute (BGN, TRY, HUF) vozač i dalje unosi ručno po trošku; samo RSD⇄EUR prikaz koristi globalni kurs.
- Verifikacija: driver login 200, /settings/rates=180, /my/tours=2. Frontend se kompajlira bez grešaka.

## 29.09.2026 — Izmena troška + PDF fix + živa promena kursa + RSD troškovi
- Vozač i admin mogu da IZMENE i OBRIŠU uneti trošak; obračun se automatski preračunava.
  - Vozač: samo SVOJE troškove (by=='driver') i samo na otvorenim turama. Admin: sve.
  - Novi endpoints: PUT/DELETE /api/my/tours/{sid}/expense/{idx} (vozač), PUT/DELETE /api/settlements/{sid}/expense/{idx} (admin). Helper build_expense_dict (čuva rate/orig_amount/currency).
- PDF/Word obračuna sada UVEK preračunavaju calc (compute_settlement) — rešen bug 650€ prikazivan kao 692.52€ (stari zamrznuti calc).
- Živa promena kursa: CurrencyContext.refreshRate() se poziva iz Settings.saveRate() → nova vrednost se odmah primenjuje bez reload-a.
- Opšti troškovi firme (Settings) i Godišnji troškovi vozila (VehicleDetail) se sada unose u RSD; backend build_truck_earnings ih konvertuje RSD→EUR (to_eur) pre ulaska u EUR obračun profita.
- Testirano: testing_agent iteration_24 (frontend 100% PASS), backend verifikovan curl-om + PDF render.

## 29.09.2026 — Istorija izmena, filter po vozilu, podaci o vozilu u izveštaju, klizač na godišnje troškove
- Istorija izmena/brisanja troškova: kolekcija expense_audit, GET /api/expense-audit (admin), log_expense_audit se poziva pri svakoj izmeni/brisanju (vozač i admin). Prikaz u posebnom skupljivom panelu na Obračun strani (samo admin), odvojeno od tabele obračuna.
- Zarada kamiona: filter po vozilu (dropdown „Sva vozila / vozilo") — GET /api/reports/truck-earnings?vehicle_id=..., build_truck_earnings filtrira i vraća selected_vehicle + vehicle_id po redu.
- Podaci o izabranom vozilu se prikazuju u izveštaju na ekranu, i u PDF/Word/Print zaglavlju (plate, marka, model, tip, godina, VIN, km).
- Klizač EUR/RSD sada važi i za „Godišnji troškovi vozila" u VehicleDetail (money(iznosRSD/kurs) → tačan prikaz u obe valute). Unos ostaje u RSD.
- Testirano: testing_agent iteration_24 & iteration_25 (100% PASS), backend curl, PDF/Word render. Godišnji-troškovi klizač: verifikovan kroz kompajlaciju + istu money() logiku (screenshot alat ima ograničenje sa auth flow-om).

## Preostalo (backlog)
- P0: Podela server.py u module (auth/vozila/obračun/izveštaji) — sledeći izolovan zadatak uz testiranje.
- P2: DialogDescription/aria na modalima; Partial Pydantic modeli za PUT.

## 29.09.2026 — Opšti troškovi firme se isključuju kada je izabrano jedno vozilo
- build_truck_earnings: show_overhead = (vehicle_id is None). Kada je izabrano jedno vozilo: overhead=0, overhead_items=[], NETO=profit vozila; kod „Sva vozila" ostaje opšti trošak firme.
- Red „Opšti troškovi firme" se uklanja iz ekrana, PDF-a, Word-a i štampe kada je izabrano vozilo (gate: truck.show_overhead). PDF stil dinamički prilagođen (urow).
- Verifikovano: JSON (show_overhead True/False), PDF render (jedno vozilo bez reda, sva vozila sa redom), Word 200.

## 29.09.2026 — Batch: email kočnice, klizač vozač/opšti, valuta po trošku, računi servisa, sync ture
- Email podsetnik: uklonjene KOČNICE iz email-a (run_reminders + send-now). Vizuelno podsećanje ostaje (preview endpoint i dalje vraća brake_count).
- RSD/EUR klizač dodat u Portal vozača (DriverLayout). Opšti troškovi firme u Podešavanjima prikazuju se preko money(iznosRSD/kurs) → prati klizač (76,92 € ↔ 9.000 RSD pri kursu 117).
- Izbor RSD/EUR po svakom unosu troška: glavna forma obračuna (keš troškovi), troškovi preko računa firme, i forma novog servisa (VehicleDetail cost_currency). Backend _normalize_amounts konvertuje u EUR na create/update obračuna; SettlementUpdate sada prima expenses.
- Uređivanje ture sada UČITAVA postojeće keš troškove (uklonjen {!editingId} gate) — admin vidi/uređuje/dodaje troškove vozača; by atribucija se čuva. Aktivne ture: „Prikaži turu" vodi na Obračun u režim uređivanja.
- Servis: prilaganje računa (slika/PDF) preko object storage (POST/GET /api/maintenance/{id}/receipt, as_pdf konvertuje sliku u PDF). U listi servisa link „Račun" otvara PDF za štampu/izvoz.
- Testirano: testing_agent iteration_26 (frontend 100% PASS) + backend curl (receipt upload/download, settlement PUT konverzija/persist).
- OTVORENO: „Stariji troškovi održavanja se ne sinhronizuju na kontrolnoj tabli" — nije reprodukovano (sva 4 zapisa se pojavljuju u grafikonima i kartici „Troškovi održavanja"). Treba screenshot da se precizira.

## 29.09.2026 — Računi i na stranici Održavanje + „Priloženi računi" (više računa)
- Stranica Održavanje (Maintenance.js) „Novi servis": dodato prilaganje računa (slika/PDF) uz servis.
- Podrška za VIŠE računa po servisu: backend čuva niz `receipts`, upload dodaje u niz; download po `?rid=<id>&as_pdf=1` (slika se konvertuje u PDF).
- Dugme „Priloženi računi (N)" u listi servisa (i na Održavanje i na VehicleDetail) otvara dijalog sa listom računa i linkom „Otvori / štampaj".
- Popravljeno: try/catch oko čuvanja servisa + izbegnut dupli toast pri neuspešnom otpremanju računa.
- Testirano: testing_agent iteration_27 (frontend 100%, 3/3) + backend curl (2 računa, download po rid → PDF).

## 30.09.2026 — Brisanje pojedinačnog računa + uvek vidljivo dugme „Priloženi računi"
- Backend: DELETE /api/maintenance/{item_id}/receipt/{rid} (require_admin) — briše iz Object Storage (delete_object helper) i iz niza receipts; ažurira legacy receipt_path ako je obrisan primarni. Testirano curl-om: upload→delete→count 0; 401 bez auth, 404 za nepostojeći.
- Frontend (Maintenance.js, VehicleDetail.js): u dijalogu „Priloženi računi" svaki red ima ikonicu korpe (Trash2) za brisanje uz potvrdu window.confirm; lista i red u tabeli se osvežavaju bez reload-a. Samo admin (obe stranice su admin-only).
- Dugme „Priloženi računi (N)" sada UVEK vidljivo u listi servisa (i kad je N=0, prikaz u sivoj boji) da bi bilo lako pronaći.

## 30.09.2026 — Sinhronizacija unosa vozača u Obračun (Uređivanje ture)
- Problem: kad admin ima otvorenu turu u „Uređivanje ture", a vozač u međuvremenu doda keš trošak preko Portala, čuvanje admin forme je moglo da PREBRIŠE/izgubi vozačev novi unos (PUT /settlements zamenjuje ceo niz expenses).
- Rešenje (stabilni ID-jevi + merge):
  - Backend: svaki trošak dobija stabilan `id` (uuid) u build_expense_dict i _normalize_amounts; my_edit_expense i admin_edit_expense čuvaju postojeći id (bez regenerisanja). ExpenseItem model dobio polje `id`.
  - Frontend (ObracunVozaca.js): mergeExpenses() + toFormRow() (vrh fajla); openedExpenseIdsRef/openedCashAdvanceRef se pamte u startEdit; live-sync useEffect [list, editingId] osvežava vozačeve unose u otvorenu formu na svakih 15s; save() pre PUT-a ponovo učita /settlements i spoji vozačeve nove unose (i akontaciju preko delte) — ako to učitavanje padne, save se PREKIDA uz poruku (ne prebrisuje). buildPayload(expsOverride) šalje `id` po trošku.
- Testirano: iteration_28.json (frontend 5/5 PASS) — vozačev unos se pojavljuje u admin formi i OSTAJE nakon čuvanja; id-jevi stabilni; payout se ispravno preračunava. + backend curl (id round-trip, HGS očuvan kroz admin PUT).

## 30.09.2026 — „Prikaži turu": sinhronizacija valute i kursa vozačevih unosa
- Kada admin otvori turu preko „Prikaži turu" (Aktivne ture) ili olovke u Obračunu, forma za uređivanje sada prikazuje SVAKI vozačev keš trošak sa punom valutom i kursom.
- Padajući meni valute u formi proširen: RSD, EUR, TRY, BGN, HUF (pre samo EUR/RSD). Za valute sa ručnim kursom (TRY/BGN/HUF) pojavljuje se drugi red sa poljem „Kurs" i „Država" + živi EUR pregled (≈ x €).
- Frontend (ObracunVozaca.js): toFormRow nosi rate+country; toEurAmt računa EUR preko kursa za ručne valute; buildPayload šalje rate+country+id; addExpense podrazumeva prazan rate/country.
- Backend (server.py): ExpenseItem dobio polje `country`; _normalize_amounts dodeljuje id, računa EUR preko to_eur(orig, currency, rate, rsd_rate) i rekonstruiše `note` (Država · iznos VALUTA · kurs X) da se očuva prikaz i posle admin snimanja.
- Testirano: iteration_29.json (frontend 100%, oba puta ulaza) + backend curl: TRY 350 @ kurs 35 → 10 €; posle admin PUT očuvani orig_amount/currency/rate/country/amount/id/note.
