import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";
import { Mail, Plus, Trash2, Save, Loader2, BellRing, Lock, KeyRound, Eye, EyeOff, Users, Coins, UserPlus, RefreshCw, Building2 } from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
  const { refreshRate, money } = useCurrency();
  const [recipients, setRecipients] = useState([]);
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [changingPw, setChangingPw] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [drivers, setDrivers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [rate, setRate] = useState(117);
  const [threshold, setThreshold] = useState(200);
  const [accDriver, setAccDriver] = useState("");
  const [accFirst, setAccFirst] = useState("");
  const [accLast, setAccLast] = useState("");
  const [accUser, setAccUser] = useState("");
  const [accPass, setAccPass] = useState("");
  const [overheads, setOverheads] = useState([]);
  const [ovName, setOvName] = useState("");
  const [ovAmount, setOvAmount] = useState("");
  const [ovPeriod, setOvPeriod] = useState("monthly");

  useEffect(() => {
    api
      .get("/settings/recipients")
      .then((r) => setRecipients(r.data.recipients || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    api.get("/drivers").then((r) => setDrivers(r.data)).catch(() => {});
    api.get("/driver-accounts").then((r) => setAccounts(r.data)).catch(() => {});
    api.get("/settings/rates").then((r) => { setRate(r.data.rsd_per_eur); setThreshold(r.data.big_expense_eur ?? 200); }).catch(() => {});
    api.get("/overhead-costs").then((r) => setOverheads(r.data)).catch(() => {});
  }, []);

  const addOverhead = async () => {
    if (!ovName.trim()) return toast.error("Naziv troška je obavezan");
    try {
      const { data } = await api.post("/overhead-costs", { name: ovName.trim(), amount: Number(ovAmount) || 0, period: ovPeriod });
      setOverheads((o) => [...o, data]);
      setOvName("");
      setOvAmount("");
      setOvPeriod("monthly");
      toast.success("Trošak dodat");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Greška pri dodavanju");
    }
  };

  const delOverhead = async (cid) => {
    try {
      await api.delete(`/overhead-costs/${cid}`);
      setOverheads((o) => o.filter((x) => x.id !== cid));
      toast.success("Trošak obrisan");
    } catch {
      toast.error("Greška pri brisanju");
    }
  };

  const saveRate = async () => {
    try {
      await api.put("/settings/rates", { rsd_per_eur: Number(rate) || 117, big_expense_eur: Number(threshold) || 200 });
      refreshRate();
      toast.success("Sačuvano — kurs primenjen na celu aplikaciju");
    } catch {
      toast.error("Greška pri čuvanju");
    }
  };

  const reloadAccounts = () => api.get("/driver-accounts").then((r) => setAccounts(r.data)).catch(() => {});

  const createAccount = async () => {
    if (!accUser.trim() || !accPass) return toast.error("Korisničko ime i lozinka su obavezni");
    const body =
      accDriver && accDriver !== "new"
        ? { driver_id: accDriver, username: accUser.trim(), password: accPass }
        : { first_name: accFirst.trim(), last_name: accLast.trim(), username: accUser.trim(), password: accPass };
    try {
      await api.post("/driver-accounts", body);
      toast.success("Nalog vozača kreiran");
      setAccUser("");
      setAccPass("");
      setAccFirst("");
      setAccLast("");
      setAccDriver("");
      reloadAccounts();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Greška pri kreiranju naloga");
    }
  };

  const delAccount = async (id) => {
    if (!window.confirm("Obrisati nalog vozača? Vozač više neće moći da se prijavi.")) return;
    try {
      await api.delete(`/driver-accounts/${id}`);
      setAccounts((a) => a.filter((x) => x.id !== id));
      toast.success("Nalog obrisan");
    } catch {
      toast.error("Greška pri brisanju");
    }
  };

  const resetPass = async (id) => {
    const p = window.prompt("Nova lozinka za vozača (min 6 karaktera):");
    if (!p) return;
    try {
      await api.put(`/driver-accounts/${id}/password`, { password: p });
      toast.success("Lozinka promenjena");
    } catch {
      toast.error("Greška pri promeni lozinke");
    }
  };

  const addEmail = () => {
    const e = newEmail.trim().toLowerCase();
    if (!e) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return toast.error("Neispravna email adresa");
    if (recipients.includes(e)) return toast.error("Adresa već postoji");
    setRecipients([...recipients, e]);
    setNewEmail("");
  };

  const removeEmail = (e) => setRecipients(recipients.filter((x) => x !== e));

  const save = async () => {
    // Uključi i adresu koja je ukucana ali još nije dodata dugmetom "Dodaj"
    const list = [...recipients];
    const pending = newEmail.trim().toLowerCase();
    if (pending) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pending)) return toast.error("Neispravna email adresa");
      if (!list.includes(pending)) list.push(pending);
    }
    if (list.length === 0) return toast.error("Dodajte bar jednu email adresu");
    setSaving(true);
    try {
      const { data } = await api.put("/settings/recipients", { recipients: list });
      setRecipients(data.recipients);
      setNewEmail("");
      toast.success("Primaoci sačuvani");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Greška pri čuvanju");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (!currentPw || !newPw) return toast.error("Popunite sva polja");
    if (newPw.length < 6) return toast.error("Nova lozinka mora imati najmanje 6 karaktera");
    if (newPw !== confirmPw) return toast.error("Nove lozinke se ne poklapaju");
    setChangingPw(true);
    try {
      await api.post("/auth/change-password", { current_password: currentPw, new_password: newPw });
      toast.success("Lozinka je uspešno promenjena");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Greška pri promeni lozinke");
    } finally {
      setChangingPw(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-fade-up max-w-2xl">
      <div>
        <h1 className="font-head text-3xl font-bold tracking-tight">Podešavanja</h1>
        <p className="text-sm text-slate-400 mt-1">Upravljanje primaocima email podsetnika</p>
      </div>

      <div className="bg-[#131C2E] border border-[#23314A] rounded-xl p-5 sm:p-6 shadow-lg shadow-black/20">
        <div className="flex items-start gap-3 mb-5">
          <div className="h-10 w-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
            <BellRing className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-head text-lg font-semibold">Primaoci podsetnika</h2>
            <p className="text-sm text-slate-400">
              Ove adrese dobijaju automatske podsetnike (30, 15 i 7 dana pre isteka dokumentacije).
            </p>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              data-testid="new-recipient-input"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEmail())}
              placeholder="dodaj@email.com"
              className="w-full bg-[#1A2438] border border-[#23314A] rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <button
            data-testid="add-recipient-button"
            onClick={addEmail}
            className="inline-flex items-center gap-2 bg-[#1A2438] border border-[#23314A] hover:border-blue-500/40 rounded-lg px-4 py-2.5 text-sm transition-colors"
          >
            <Plus className="h-4 w-4" /> Dodaj
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500 py-4">Učitavanje...</p>
        ) : recipients.length === 0 ? (
          <p className="text-sm text-slate-500 py-4">Nema podešenih primalaca. Dodajte bar jednu adresu.</p>
        ) : (
          <div className="space-y-2 mb-5">
            {recipients.map((e) => (
              <div
                key={e}
                data-testid={`recipient-${e}`}
                className="flex items-center justify-between bg-[#0B0F17] border border-[#23314A] rounded-lg px-4 py-2.5"
              >
                <span className="text-sm font-mono">{e}</span>
                <button
                  onClick={() => removeEmail(e)}
                  className="text-slate-500 hover:text-red-400"
                  data-testid={`remove-recipient-${e}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          data-testid="save-recipients-button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Sačuvaj primaoce
        </button>
      </div>

      <div className="bg-[#131C2E] border border-[#23314A] rounded-xl p-5 sm:p-6 shadow-lg shadow-black/20" data-testid="rates-card">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
            <Coins className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-head text-lg font-semibold">Kurs RSD → EUR</h2>
            <p className="text-sm text-slate-400">Koliko dinara ide na 1 €. Vozačevi troškovi u RSD se automatski preračunavaju. (EUR = 1:1, TRY se unosi ručno po unosu.)</p>
          </div>
        </div>
        <div className="space-y-3 max-w-md">
          <div className="flex gap-2 items-center">
            <input type="number" min="1" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} data-testid="rsd-rate-input" className="w-32 bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
            <span className="text-sm text-slate-400">RSD = 1 €</span>
          </div>
          <div className="flex gap-2 items-center">
            <input type="number" min="1" step="1" value={threshold} onChange={(e) => setThreshold(e.target.value)} data-testid="big-expense-input" className="w-32 bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
            <span className="text-sm text-slate-400">€ — prag za upozorenje o velikom trošku</span>
          </div>
          <button onClick={saveRate} data-testid="save-rate-button" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-4 py-2.5 text-sm">
            <Save className="h-4 w-4" /> Sačuvaj
          </button>
        </div>
      </div>

      <div className="bg-[#131C2E] border border-[#23314A] rounded-xl p-5 sm:p-6 shadow-lg shadow-black/20" data-testid="overhead-costs-card">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-10 w-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-head text-lg font-semibold">Opšti troškovi firme (unos u RSD)</h2>
            <p className="text-sm text-slate-400">Fiksni troškovi firme (npr. knjigovodstvo, zakup, softver). Godišnji se automatski dele na mesečni nivo. Umanjuju ukupan profit firme.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2 mb-4">
          <div className="flex-1 min-w-[160px]">
            <label className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Naziv troška</label>
            <input value={ovName} onChange={(e) => setOvName(e.target.value)} data-testid="overhead-name" placeholder="npr. Knjigovodstvo" className="mt-1 w-full bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Iznos (RSD)</label>
            <input type="number" min="0" step="0.01" value={ovAmount} onChange={(e) => setOvAmount(e.target.value)} data-testid="overhead-amount" placeholder="0" className="mt-1 w-32 bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Nivo</label>
            <select value={ovPeriod} onChange={(e) => setOvPeriod(e.target.value)} data-testid="overhead-period" className="mt-1 bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2 text-sm text-slate-100">
              <option value="monthly">Mesečno</option>
              <option value="yearly">Godišnje</option>
            </select>
          </div>
          <button onClick={addOverhead} data-testid="overhead-add" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-3 py-2 text-sm">
            <Plus className="h-4 w-4" /> Dodaj
          </button>
        </div>
        {overheads.length === 0 ? (
          <p className="text-sm text-slate-500">Nema unetih opštih troškova.</p>
        ) : (
          <div className="space-y-2">
            {overheads.map((c) => (
              <div key={c.id} data-testid={`overhead-${c.id}`} className="flex items-center justify-between bg-[#0B0F17] border border-[#23314A] rounded-lg px-4 py-2.5">
                <div className="text-sm">
                  <span className="font-semibold text-slate-100">{c.name}</span>
                  <span className="text-slate-500"> · {money(Number(c.amount) / (Number(rate) || 117))} {c.period === "yearly" ? "/ god" : "/ mes"}</span>
                  <span className="text-slate-500"> · ≈ {money((c.period === "yearly" ? Number(c.amount) / 12 : Number(c.amount)) / (Number(rate) || 117))} / mes</span>
                </div>
                <button onClick={() => delOverhead(c.id)} data-testid={`overhead-delete-${c.id}`} className="text-slate-500 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-[#131C2E] border border-[#23314A] rounded-xl p-5 sm:p-6 shadow-lg shadow-black/20" data-testid="driver-accounts-card">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-10 w-10 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-head text-lg font-semibold">Nalozi vozača</h2>
            <p className="text-sm text-slate-400">Kreirate nalog da bi se vozač prijavio i unosio akontacije i troškove u hodu.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          <select value={accDriver} onChange={(e) => setAccDriver(e.target.value)} data-testid="account-driver-select" className="bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2.5 text-sm text-slate-100">
            <option value="">— Poveži sa postojećim vozačem —</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>{d.first_name} {d.last_name}</option>
            ))}
            <option value="new">+ Novi vozač (unesi ime/prezime)</option>
          </select>
          {accDriver === "new" && (
            <div className="grid grid-cols-2 gap-2">
              <input value={accFirst} onChange={(e) => setAccFirst(e.target.value)} placeholder="Ime" data-testid="account-first-input" className="bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2.5 text-sm" />
              <input value={accLast} onChange={(e) => setAccLast(e.target.value)} placeholder="Prezime" data-testid="account-last-input" className="bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2.5 text-sm" />
            </div>
          )}
          <input value={accUser} onChange={(e) => setAccUser(e.target.value)} placeholder="Korisničko ime" data-testid="account-username-input" className="bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2.5 text-sm" />
          <input value={accPass} onChange={(e) => setAccPass(e.target.value)} placeholder="Lozinka" data-testid="account-password-input" className="bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2.5 text-sm" />
        </div>
        <button onClick={createAccount} data-testid="create-account-button" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-4 py-2.5 text-sm mb-4">
          <UserPlus className="h-4 w-4" /> Kreiraj nalog
        </button>

        {accounts.length === 0 ? (
          <p className="text-sm text-slate-500">Nema kreiranih naloga vozača.</p>
        ) : (
          <div className="space-y-2">
            {accounts.map((a) => (
              <div key={a.id} data-testid={`account-${a.id}`} className="flex items-center justify-between bg-[#0B0F17] border border-[#23314A] rounded-lg px-4 py-2.5">
                <div className="text-sm">
                  <span className="font-semibold">{a.username}</span>
                  <span className="text-slate-500"> · {a.driver_name || a.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => resetPass(a.id)} title="Nova lozinka" className="text-slate-500 hover:text-blue-300"><RefreshCw className="h-4 w-4" /></button>
                  <button onClick={() => delAccount(a.id)} title="Obriši nalog" className="text-slate-500 hover:text-red-400" data-testid={`delete-account-${a.id}`}><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-[#131C2E] border border-[#23314A] rounded-xl p-5 sm:p-6 shadow-lg shadow-black/20">
        <div className="flex items-start gap-3 mb-5">
          <div className="h-10 w-10 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-head text-lg font-semibold">Promena lozinke</h2>
            <p className="text-sm text-slate-400">Promenite lozinku za pristup nalogu.</p>
          </div>
        </div>

        <button
          type="button"
          data-testid="toggle-password-visibility"
          onClick={() => setShowPw(!showPw)}
          className="mb-3 inline-flex items-center gap-2 text-xs text-slate-400 hover:text-blue-300 transition-colors"
        >
          {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {showPw ? "Sakrij lozinke" : "Prikaži lozinke"}
        </button>

        <div className="space-y-3 max-w-sm">
          <div>
            <label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Trenutna lozinka</label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                data-testid="current-password-input"
                type={showPw ? "text" : "password"}
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                className="w-full bg-[#1A2438] border border-[#23314A] rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="••••••••"
              />
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Nova lozinka</label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                data-testid="new-password-input"
                type={showPw ? "text" : "password"}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className="w-full bg-[#1A2438] border border-[#23314A] rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="najmanje 6 karaktera"
              />
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Potvrdi novu lozinku</label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                data-testid="confirm-password-input"
                type={showPw ? "text" : "password"}
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && changePassword()}
                className="w-full bg-[#1A2438] border border-[#23314A] rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="••••••••"
              />
            </div>
          </div>
          <button
            data-testid="change-password-button"
            onClick={changePassword}
            disabled={changingPw}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
          >
            {changingPw ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Promeni lozinku
          </button>
        </div>
      </div>
    </div>
  );
}
