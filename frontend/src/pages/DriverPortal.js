import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { fmtDate } from "@/lib/api";
import { ManagedSelect } from "@/components/ManagedSelect";
import { useCurrency } from "@/context/CurrencyContext";
import { Coins, Wallet, Plus, Loader2, MapPin, Pencil, Trash2 } from "lucide-react";

const fmtDT = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("sr-RS") + " " + d.toLocaleTimeString("sr-RS", { hour: "2-digit", minute: "2-digit" });
};

const COUNTRIES = [
  { c: "Srbija", cur: "RSD", manual: false },
  { c: "Bugarska", cur: "BGN", manual: true },
  { c: "Turska", cur: "TRY", manual: true },
  { c: "Mađarska", cur: "HUF", manual: true },
  { c: "Hrvatska", cur: "EUR", manual: false },
];

const CURRENCIES = ["RSD", "EUR", "TRY", "BGN", "HUF"];

const inp =
  "w-full bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 transition-colors";

function TourCard({ tour, onChanged, readOnly }) {
  const { money: eur, rate } = useCurrency();
  const c = tour.calc || {};
  const [advAmt, setAdvAmt] = useState("");
  const [desc, setDesc] = useState("");
  const [amt, setAmt] = useState("");
  const [ci, setCi] = useState(0);
  const [kurs, setKurs] = useState("");
  const [paidFrom, setPaidFrom] = useState("advance");
  const [busy, setBusy] = useState(false);
  const [curCode, setCurCode] = useState("RSD");
  const [editIdx, setEditIdx] = useState(null);
  const cur = curCode;
  const manual = !["RSD", "EUR"].includes(cur);

  const addAdvance = async () => {
    if (!Number(advAmt)) return toast.error("Unesite iznos akontacije");
    setBusy(true);
    try {
      await api.post(`/my/tours/${tour.id}/advance`, { amount: Number(advAmt), note: "" });
      setAdvAmt("");
      toast.success("Akontacija dodata");
      onChanged();
    } catch {
      toast.error("Greška");
    } finally {
      setBusy(false);
    }
  };

  const resetExpenseForm = () => {
    setEditIdx(null);
    setDesc("");
    setAmt("");
    setKurs("");
    setCurCode("RSD");
    setCi(0);
    setPaidFrom("advance");
  };

  const startEditExpense = (e, idx) => {
    setEditIdx(idx);
    setDesc(e.category || "");
    setAmt(String(e.orig_amount ?? e.amount ?? ""));
    setCurCode((e.currency || "RSD").toUpperCase());
    const cIdx = COUNTRIES.findIndex((co) => co.c === e.country);
    setCi(cIdx >= 0 ? cIdx : 0);
    setKurs(e.rate ? String(e.rate) : "");
    setPaidFrom(e.paid_from === "own" ? "own" : "advance");
  };

  const delExpense = async (idx) => {
    if (!window.confirm("Obrisati ovaj trošak?")) return;
    try {
      await api.delete(`/my/tours/${tour.id}/expense/${idx}`);
      toast.success("Trošak obrisan");
      onChanged();
    } catch {
      toast.error("Greška pri brisanju");
    }
  };

  const submitExpense = async () => {
    if (!desc.trim() || !Number(amt)) return toast.error("Unesite opis i iznos");
    if (manual && !Number(kurs)) return toast.error(`Unesite kurs za ${cur}`);
    setBusy(true);
    const body = {
      description: desc.trim(),
      amount: Number(amt),
      country: COUNTRIES[ci].c,
      currency: cur,
      rate: manual ? Number(kurs) : null,
      paid_from: paidFrom,
    };
    try {
      if (editIdx != null) {
        await api.put(`/my/tours/${tour.id}/expense/${editIdx}`, body);
        toast.success("Trošak izmenjen");
      } else {
        await api.post(`/my/tours/${tour.id}/expense`, body);
        toast.success("Trošak dodat (preračunat u €)");
      }
      resetExpenseForm();
      onChanged();
    } catch {
      toast.error("Greška");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-[#131C2E] border border-[#23314A] rounded-xl p-4 sm:p-5" data-testid={`tour-${tour.id}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-blue-400" />
          <span className="font-head font-semibold">{tour.trip_label || tour.vehicle_plate || "Tura"}</span>
          {(tour.status || "razduzeno") === "otvorena" ? (
            <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-blue-500/15 text-blue-300">Otvorena</span>
          ) : (
            <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-slate-500/15 text-slate-400">Završeno</span>
          )}
        </div>
        <span className="text-xs text-slate-500 font-mono">{fmtDate(tour.date)}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm mb-4">
        <Stat label="Cena kruga" value={eur(tour.driver_pay)} />
        <Stat label="Dnevnice" value={eur(c.waiting)} />
        <Stat label="Ukupna zarada" value={eur(c.total_earnings)} accent />
        <Stat label="Akontacija" value={eur(tour.cash_advance)} />
        <Stat label="Troškovi" value={eur(c.total_expenses)} />
        {(c.final_due ?? 0) >= 0 ? (
          <Stat label="Za isplatu" value={eur(c.payout)} good />
        ) : (
          <Stat label="Vraćaš firmi" value={eur(c.driver_returns)} bad />
        )}
      </div>

      {!readOnly && (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-[#0B0F17] border border-[#23314A] rounded-lg p-3">
          <div className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
            <Wallet className="h-3.5 w-3.5 text-blue-400" /> Nova akontacija (€)
          </div>
          <div className="flex gap-2">
            <input type="number" className={inp} value={advAmt} onChange={(e) => setAdvAmt(e.target.value)} placeholder="npr. 100" data-testid={`adv-amt-${tour.id}`} />
            <button onClick={addAdvance} disabled={busy} className="shrink-0 inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg px-3 text-sm" data-testid={`adv-add-${tour.id}`}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="bg-[#0B0F17] border border-[#23314A] rounded-lg p-3">
          <div className="text-xs font-semibold text-slate-300 mb-2 flex items-center justify-between gap-1.5">
            <span className="flex items-center gap-1.5"><Coins className="h-3.5 w-3.5 text-amber-400" /> {editIdx != null ? "Izmena troška" : "Novi trošak"}</span>
            {editIdx != null && (
              <button type="button" onClick={resetExpenseForm} className="text-[11px] text-slate-400 hover:text-slate-200" data-testid={`exp-cancel-${tour.id}`}>Otkaži</button>
            )}
          </div>
          <div className="space-y-2">
            <ManagedSelect
              category="expense_category"
              value={desc}
              onChange={setDesc}
              placeholder="Vrsta troška (npr. Gorivo)"
              testId={`exp-desc-${tour.id}`}
            />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" className={inp} value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="Iznos" data-testid={`exp-amt-${tour.id}`} />
              <select className={inp} value={curCode} onChange={(e) => setCurCode(e.target.value)} data-testid={`exp-currency-${tour.id}`}>
                {CURRENCIES.map((cc) => (
                  <option key={cc} value={cc}>{cc}</option>
                ))}
              </select>
            </div>
            <select className={inp} value={ci} onChange={(e) => setCi(Number(e.target.value))} data-testid={`exp-country-${tour.id}`}>
              {COUNTRIES.map((co, idx) => (
                <option key={co.c} value={idx}>Država: {co.c}</option>
              ))}
            </select>
            {manual && (
              <input type="number" className={inp} value={kurs} onChange={(e) => setKurs(e.target.value)} placeholder={`Kurs: koliko ${cur} za 1 €`} data-testid={`exp-rate-${tour.id}`} />
            )}
            {cur === "RSD" && (
              <div className="text-[11px] text-slate-500">Preračun po kursu {rate} RSD = 1 €</div>
            )}
            {cur === "EUR" && (
              <div className="text-[11px] text-slate-500">Iznos je već u evrima (1:1).</div>
            )}
            <div className="flex rounded-lg overflow-hidden border border-[#23314A]">
              <button type="button" onClick={() => setPaidFrom("advance")} className={`flex-1 text-xs py-1.5 ${paidFrom === "advance" ? "bg-blue-600 text-white" : "bg-[#1A2438] text-slate-400"}`}>Iz akontacije</button>
              <button type="button" onClick={() => setPaidFrom("own")} className={`flex-1 text-xs py-1.5 ${paidFrom === "own" ? "bg-amber-600 text-white" : "bg-[#1A2438] text-slate-400"}`}>Svoj novac</button>
            </div>
            <button onClick={submitExpense} disabled={busy} className="w-full inline-flex items-center justify-center gap-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white rounded-lg py-2 text-sm" data-testid={`exp-add-${tour.id}`}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {editIdx != null ? "Sačuvaj izmenu" : "Dodaj trošak"}
            </button>
          </div>
        </div>
      </div>
      )}
      {((tour.advance_entries && tour.advance_entries.length) ||
        (tour.expenses || []).some((e) => e.by === "driver")) && (
        <div className="mt-4 border-t border-[#23314A] pt-3" data-testid={`history-${tour.id}`}>
          <div className="text-xs font-semibold text-slate-400 mb-2">Moji unosi na ovoj turi</div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {(tour.advance_entries || []).map((a, i) => (
              <div key={"a" + i} className="flex items-center justify-between text-xs gap-2" data-testid={`hist-adv-${tour.id}-${i}`}>
                <span className="text-blue-300 truncate">Akontacija{a.note ? ` · ${a.note}` : ""}</span>
                <span className="text-slate-500 shrink-0">{fmtDT(a.at)} · <span className="font-mono text-slate-200">{eur(a.amount)}</span></span>
              </div>
            ))}
            {(tour.expenses || [])
              .map((e, idx) => ({ e, idx }))
              .filter((x) => x.e.by === "driver")
              .map(({ e, idx }) => (
                <div key={"e" + idx} className="flex items-center justify-between text-xs gap-2" data-testid={`hist-exp-${tour.id}-${idx}`}>
                  <span className="text-amber-300 truncate">
                    {e.category} <span className="text-slate-500">({e.note || e.currency})</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-slate-500">{fmtDT(e.at)} · <span className="font-mono text-slate-200">{eur(e.amount)}</span></span>
                    {!readOnly && (
                      <>
                        <button type="button" onClick={() => startEditExpense(e, idx)} className="text-slate-500 hover:text-amber-300" title="Izmeni" data-testid={`hist-exp-edit-${tour.id}-${idx}`}><Pencil className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => delExpense(idx)} className="text-slate-500 hover:text-red-400" title="Obriši" data-testid={`hist-exp-del-${tour.id}-${idx}`}><Trash2 className="h-3.5 w-3.5" /></button>
                      </>
                    )}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

const Stat = ({ label, value, accent, good, bad }) => (
  <div>
    <div className="text-[11px] text-slate-500">{label}</div>
    <div className={`font-mono font-semibold ${good ? "text-emerald-300" : bad ? "text-red-300" : accent ? "text-blue-300" : "text-slate-100"}`}>{value}</div>
  </div>
);

export default function DriverPortal({ mode = "active" }) {
  const [tours, setTours] = useState([]);
  const [loading, setLoading] = useState(true);
  const done = mode === "done";

  const load = () => {
    api.get("/my/tours").then((r) => setTours(r.data)).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const filtered = tours.filter((t) => (done ? (t.status || "razduzeno") !== "otvorena" : (t.status || "razduzeno") === "otvorena"));

  return (
    <div className="space-y-5" data-testid="driver-portal">
      <div>
        <h1 className="font-head text-2xl font-bold">{done ? "Završene ture" : "Aktivne ture"}</h1>
        <p className="text-sm text-slate-400 mt-1">
          {done
            ? "Pregled razduženih tura — samo za uvid, izmene više nisu moguće."
            : "Unesite akontacije i troškove — sve se odmah preračunava u evre i vidi admin."}
        </p>
      </div>
      {loading ? (
        <p className="text-sm text-slate-500">Učitavanje...</p>
      ) : filtered.length === 0 ? (
        <div className="bg-[#131C2E] border border-[#23314A] rounded-xl p-8 text-center text-slate-500 text-sm">
          {done ? "Još nema razduženih tura." : "Nemate aktivnih tura. Admin će vam otvoriti turu."}
        </div>
      ) : (
        filtered.map((t) => <TourCard key={t.id} tour={t} onChanged={load} readOnly={done} />)
      )}
    </div>
  );
}
