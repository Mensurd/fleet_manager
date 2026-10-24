# Fleet Manager — APR MENSUR DULJEVIĆ

Kompletna aplikacija za upravljanje voznim parkom i transportnim poslovanjem: evidencija vozila i prikolica, vozači, servisi i alarmi za isteke dokumenata, obračun tura (settlements), mobilni portal za vozače, kao i izveštaji (PDF, Word, Excel).

---

## 🛠 Tehnologije

- **Frontend**: React 19, React Router 7, Tailwind CSS 3, Radix UI (shadcn), Lucide icons, Axios, Craco
- **Backend**: Python 3.11+, FastAPI, Uvicorn, Motor (MongoDB asinhroni drajver), PyJWT, Bcrypt, ReportLab (PDF), python-docx (Word), OpenPyXL (Excel)
- **Baza**: MongoDB (lokalno ili besplatan MongoDB Atlas klaster)

---

## 🚀 1. Pokretanje LOKALNO

### Korak 1: Baza podataka (MongoDB)
Najjednostavniji način (jer ne zahteva instalaciju MongoDB-a na računar) je besplatan nalog na **[MongoDB Atlas](https://www.mongodb.com/products/platform/atlas-database)**:
1. Registruj se i napravi besplatan **M0 Cluster**.
2. U *Security -> Database Access* kreiraj korisnika i lozinku.
3. U *Security -> Network Access* klikni **Add IP Address** -> izaberi **Allow Access from Anywhere** (`0.0.0.0/0`).
4. Klikni **Connect** -> **Drivers** (Python) i kopiraj connection string:
   `mongodb+srv://<korisnik>:<lozinka>@cluster0.xxx.mongodb.net/?retryWrites=true&w=majority`

### Korak 2: Pokretanje Backenda (FastAPI)
1. Otvori terminal u folderu `backend`:
   ```bash
   cd backend
   ```
2. Napravi virtuelno okruženje i aktiviraj ga:
   ```bash
   python -m venv venv
   # Na Windowsu:
   venv\Scripts\activate
   # Na Linux/Macu:
   source venv/bin/activate
   ```
3. Instaliraj potrebne pakete:
   ```bash
   pip install -r requirements.txt
   ```
4. Kreiraj fajl `.env` (možeš kopirati `.env.example`):
   ```env
   MONGO_URL="mongodb+srv://<korisnik>:<lozinka>@cluster0.xxx.mongodb.net/?retryWrites=true&w=majority"
   DB_NAME="fleet_manager"
   JWT_SECRET="nasumican-dugacak-tajni-string-12345"
   FRONTEND_URL="http://localhost:3000"
   CORS_ORIGINS="http://localhost:3000,http://127.0.0.1:3000"
   ADMIN_EMAIL="admin@firma.com"
   ADMIN_PASSWORD="fleet2026"
   ```
5. Pokreni backend server:
   ```bash
   uvicorn server:app --reload --port 8001
   ```
   Backend je dostupan na `http://localhost:8001` (Swagger dokumentacija je na `http://localhost:8001/docs`).

### Korak 3: Pokretanje Frontenda (React)
1. Otvori drugi terminal u folderu `frontend`:
   ```bash
   cd frontend
   ```
2. Instaliraj zavisnosti:
   ```bash
   npm install --legacy-peer-deps
   # ili ako koristiš yarn:
   npx yarn install
   ```
3. Kreiraj fajl `.env` (ili uredi postojeći):
   ```env
   REACT_APP_BACKEND_URL=http://localhost:8001
   ```
4. Pokreni frontend server:
   ```bash
   npm start
   ```
   Aplikacija se otvara u browseru na `http://localhost:3000`.

---

## 🐳 Pokretanje preko Docker-a (Jedna komanda)

Ako imaš instaliran Docker i Docker Compose, sve tri komponente (MongoDB + Backend + Frontend) pokreću se komandom iz korena projekta:
```bash
docker compose up -d
```
Aplikacija je odmah spremna na `http://localhost:3000`.

---

## 🌐 2. Podizanje na HOSTING (Preporučeno i besplatno)

Preporučena arhitektura za nula troškova:

| Servis | Platforma | Zašto |
|---|---|---|
| **Baza** | [MongoDB Atlas](https://www.mongodb.com/) | 512 MB trajno besplatno (M0), u oblaku |
| **Backend** | [Render.com](https://render.com/) (ili Railway) | Besplatan Web Service sa podrškom za Python/FastAPI |
| **Frontend** | [Vercel](https://vercel.com/) (ili Netlify) | Besplatan globalni CDN, automatski HTTPS sertifikat |

### Detaljni koraci:

#### A. MongoDB Atlas
1. Kreiraj besplatan klaster i uzmi Connection string.

#### B. Backend na Render.com
1. Poveži svoj GitHub repozitorijum sa Render.com.
2. Klikni **New** -> **Web Service**.
3. Podešavanja:
   - **Root Directory:** `backend`
   - **Runtime:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn server:app --host 0.0.0.0 --port $PORT`
4. U delu **Environment Variables** unesi:
   - `MONGO_URL` = link ka MongoDB Atlas bazi
   - `DB_NAME` = `fleet_manager`
   - `JWT_SECRET` = nasumičan dugi string
   - `FRONTEND_URL` = link tvog frontenda na Vercel-u (npr. `https://moj-fleet.vercel.app`)
   - `ADMIN_EMAIL` = `admin@firma.com`
   - `ADMIN_PASSWORD` = tvoja administratorska šifra
5. Klikni **Deploy Web Service**. Dobićeš link npr. `https://fleet-api.onrender.com`.

#### C. Frontend na Vercel-u
1. Poveži GitHub na Vercel.
2. Klikni **Add New** -> **Project** i izaberi repozitorijum.
3. Podešavanja:
   - **Root Directory:** klikni *Edit* i izaberi `frontend`.
   - **Framework Preset:** `Create React App`
   - **Build Command:** `npm run build`
   - **Output Directory:** `build`
4. U delu **Environment Variables** unesi:
   - `REACT_APP_BACKEND_URL` = link sa Render-a (npr. `https://fleet-api.onrender.com` — **BEZ** `/api` na kraju).
5. Klikni **Deploy**.
6. Kopiraj dodeljeni domen (npr. `https://moj-fleet.vercel.app`) i vrati se na Render.com u backend varijablu `FRONTEND_URL` da je postaviš na taj domen!

---

## 👥 Uloge i pristup

1. **Administrator (`admin`)**:
   - Pun pristup svim vozilima, prikolicama, vozačima, finansijama, troškovima firme, opštim troškovima i izvozima u Word/PDF/Excel.
   - Početni nalog se pravi automatski pri prvom startu sa podacima iz `ADMIN_EMAIL` i `ADMIN_PASSWORD`.
2. **Vozač (`driver`)**:
   - Pristupa putem `/login` i automatski se preusmerava na namenski mobilni portal (`/moje-ture`).
   - Vidi samo svoje ture, unosi keš troškove i prilaže račune.
   - Nema pristup ceni ture, profitu, niti bankovnim troškovima firme.
