import { useState, useEffect, useRef, Fragment } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { DateField } from "@/components/DateField";
import { ManagedSelect } from "@/components/ManagedSelect";
import { Calculator, Plus, Trash2, Wallet, Coins, ArrowRightLeft, Save, Loader2, Printer, Download, FileText, Clock, AlertTriangle, ChevronDown, ChevronRight, User, Pencil, MapPinned, X, Lock, History } from "lucide-react";
import { API, fmtDate } from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";

const fmtDT = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("sr-RS") + " " + d.toLocaleTimeString("sr-RS", { hour: "2-digit", minute: "2-digit" });
};
const byLbl = (b) => (b === "driver" ? "Vozač" : "Admin");
const CURRENCIES = ["RSD", "EUR", "TRY", "BGN", "HUF"];

const inputCls =
  "w-full mt-1 bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors";
const labelCls = "text-xs font-medium text-slate-400";

const todayIso = () => new Date().toISOString().slice(0, 10);

const computeSettlement = (driverPay, cashAdvance, expenses, waiting, tourPrice, companyTotal = 0) => {
  const fromAdv = expenses
    .filter((e) => e.paid_from === "advance")
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const own = expenses
    .filter((e) => e.paid_from === "own")
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const pay = Number(driverPay) || 0;
  const adv = Number(cashAdvance) || 0;
  const w = Number(waiting) || 0;
  const comp = Number(companyTotal) || 0;
  const totalEarnings = pay + w;
  const remainingAdvance = adv - fromAdv;
  const finalDue = totalEarnings - remainingAdvance + own;
  const price = Number(tourPrice) || 0;
  return {
    waiting: w,
    totalEarnings,
    tourPrice: price,
    companyTotal: comp,
    profit: price - totalEarnings - (fromAdv + own) - comp,
    fromAdv,
    own,
    total: fromAdv + own,
    remainingAdvance,
    finalDue,
    driverReturns: finalDue < 0 ? -finalDue : 0,
    payout: finalDue >= 0 ? finalDue : 0,
  };
};

const toFormRow = (e) => ({
  id: e.id,
  category: e.category || "",
  amount: (e.orig_amount ?? e.amount) ?? "",
  paid_from: e.paid_from || "advance",
  currency: (e.currency || "EUR").toUpperCase(),
  rate: e.rate ? String(e.rate) : "",
  country: e.country || "",
  by: e.by || null,
});

const isManualCur = (c) => !["EUR", "RSD"].includes((c || "EUR").toUpperCase());

// Merge driver's live entries into the admin form without clobbering admin edits:
// - drop rows that were present at open but got deleted on the server (by the driver)
// - add server entries that appeared after the form was opened
const mergeExpenses = (formExps, serverExps, openedIds) => {
  const srvIds = new Set((serverExps || []).map((e) => e.id).filter(Boolean));
  const kept = formExps.filter((e) => !(e.id && openedIds.has(e.id) && !srvIds.has(e.id)));
  const formIds = new Set(kept.map((e) => e.id).filter(Boolean));
  const added = (serverExps || [])
    .filter((e) => e.id && !openedIds.has(e.id) && !formIds.has(e.id))
    .map(toFormRow);
  return [...kept, ...added];
};

export default function ObracunVozaca() {
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const { money: eur, rate } = useCurrency();
  const [list, setList] = useState([]);
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingStatus, setEditingStatus] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [expEdit, setExpEdit] = useState(null);
  const [eCat, setECat] = useState("");
  const [eAmt, setEAmt] = useState("");
  const [eCur, setECur] = useState("EUR");
  const [eRate, setERate] = useState("");
  const [ePaid, setEPaid] = useState("advance");
  const [eCountry, setECountry] = useState("");
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditList, setAuditList] = useState([]);

  const [driverId, setDriverId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [tripLabel, setTripLabel] = useState("");
  const [date, setDate] = useState(todayIso());
  const [driverPay, setDriverPay] = useState("");
  const [tourPrice, setTourPrice] = useState("");
  const [cashAdvance, setCashAdvance] = useState("");
  const [expenses, setExpenses] = useState([]);
  const [companyExpenses, setCompanyExpenses] = useState([]);
  const [waitingMode, setWaitingMode] = useState("amount"); // amount | dayrate
  const [waitingAmount, setWaitingAmount] = useState("");
  const [waitingDays, setWaitingDays] = useState("");
  const [waitingRate, setWaitingRate] = useState("");
  const openedExpenseIdsRef = useRef(new Set());
  const openedCashAdvanceRef = useRef(0);

  const waitingTotal =
    waitingMode === "amount"
      ? Number(waitingAmount) || 0
      : (Number(waitingDays) || 0) * (Number(waitingRate) || 0);

  const load = () => {
    api.get("/drivers").then((r) => setDrivers(r.data)).catch(() => {});
    api.get("/vehicles").then((r) => setVehicles(r.data)).catch(() => {});
    api.get("/settlements").then((r) => setList(r.data)).catch(() => {});
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  // Live-sync the driver's entries into the open edit form
  useEffect(() => {
    if (!editingId) return;
    const srv = list.find((x) => x.id === editingId);
    if (!srv) return;
    setExpenses((prev) => mergeExpenses(prev, srv.expenses || [], openedExpenseIdsRef.current));
    const serverAdv = Number(srv.cash_advance) || 0;
    const openedAdv = openedCashAdvanceRef.current || 0;
    const curAdv = Number(cashAdvance) || 0;
    if (curAdv === openedAdv && serverAdv !== openedAdv) {
      setCashAdvance(String(serverAdv));
      openedCashAdvanceRef.current = serverAdv;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, editingId]);

  const addExpense = () =>
    setExpenses((e) => [...e, { category: "", amount: "", paid_from: "advance", currency: "EUR", rate: "", country: "" }]);
  const setExp = (i, k, v) =>
    setExpenses((e) => e.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)));
  const delExp = (i) => setExpenses((e) => e.filter((_, idx) => idx !== i));

  const addCompanyExpense = () => setCompanyExpenses((e) => [...e, { category: "", amount: "", currency: "EUR" }]);
  const setCompExp = (i, k, v) => setCompanyExpenses((e) => e.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)));
  const delCompExp = (i) => setCompanyExpenses((e) => e.filter((_, idx) => idx !== i));

  const toEurAmt = (e) => {
    const c = (e.currency || "EUR").toUpperCase();
    const a = Number(e.amount) || 0;
    if (c === "EUR") return a;
    if (c === "RSD") return a / (rate || 117);
    const r = Number(e.rate) || 0;
    return r > 0 ? a / r : 0;
  };
  const companyTotal = companyExpenses.reduce((s, e) => s + toEurAmt(e), 0);
  const eurExpenses = expenses.map((e) => ({ ...e, amount: toEurAmt(e) }));
  const calc = computeSettlement(driverPay, cashAdvance, eurExpenses, waitingTotal, tourPrice, companyTotal);

  const resetForm = () => {
    setEditingId(null);
    setEditingStatus(null);
    setDriverId("");
    setVehicleId("");
    setTripLabel("");
    setDate(todayIso());
    setDriverPay("");
    setTourPrice("");
    setCashAdvance("");
    setExpenses([]);
    setCompanyExpenses([]);
    openedExpenseIdsRef.current = new Set();
    openedCashAdvanceRef.current = 0;
    setWaitingMode("amount");
    setWaitingAmount("");
    setWaitingDays("");
    setWaitingRate("");
  };

  const buildPayload = (expsOverride) => ({
    driver_id: driverId,
    vehicle_id: vehicleId || null,
    trip_label: tripLabel,
    date,
    driver_pay: Number(driverPay) || 0,
    tour_price: Number(tourPrice) || 0,
    cash_advance: Number(cashAdvance) || 0,
    waiting_days: waitingMode === "dayrate" ? Number(waitingDays) || 0 : 0,
    waiting_rate: waitingMode === "dayrate" ? Number(waitingRate) || 0 : 0,
    waiting_amount: waitingTotal,
    expenses: (expsOverride || expenses)
      .filter((e) => e.category || e.amount)
      .map((e) => ({ id: e.id || undefined, category: e.category, amount: Number(e.amount) || 0, paid_from: e.paid_from || "advance", currency: (e.currency || "EUR").toUpperCase(), rate: e.rate ? Number(e.rate) : null, country: e.country || null, by: e.by || null })),
    company_expenses: companyExpenses
      .filter((e) => e.category || e.amount)
      .map((e) => ({ category: e.category, amount: Number(e.amount) || 0, currency: (e.currency || "EUR").toUpperCase() })),
  });

  const save = async (status) => {
    if (!driverId) return toast.error("Izaberite vozača");
    setSaving(true);
    try {
      if (editingId) {
        // Pull the freshest driver entries right before saving so we never overwrite them
        let srv;
        try {
          const { data } = await api.get("/settlements");
          srv = (data || []).find((x) => x.id === editingId);
        } catch (e) {
          toast.error("Nije moguće sinhronizovati unose vozača. Pokušajte ponovo.");
          setSaving(false);
          return;
        }
        let mergedExpenses = expenses;
        let mergedAdv = Number(cashAdvance) || 0;
        if (srv) {
          mergedExpenses = mergeExpenses(expenses, srv.expenses || [], openedExpenseIdsRef.current);
          const serverAdv = Number(srv.cash_advance) || 0;
          const openedAdv = openedCashAdvanceRef.current || 0;
          mergedAdv = serverAdv + ((Number(cashAdvance) || 0) - openedAdv);
        }
        const payload = { ...buildPayload(mergedExpenses), cash_advance: mergedAdv, status };
        await api.put(`/settlements/${editingId}`, payload);
        toast.success(status === "razduzeno" ? "Krug razdužen" : "Izmene sačuvane");
      } else {
        await api.post("/settlements", { ...buildPayload(), status });
        toast.success(status === "otvorena" ? "Tura dodeljena vozaču" : "Krug razdužen i sačuvan");
      }
      resetForm();
      load();
    } catch (e) {
      toast.error("Greška pri čuvanju");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (s) => {
    setEditingId(s.id);
    setEditingStatus(s.status || "razduzeno");
    setDriverId(s.driver_id || "");
    setVehicleId(s.vehicle_id || "");
    setTripLabel(s.trip_label || "");
    setDate(s.date || todayIso());
    setDriverPay(s.driver_pay || "");
    setTourPrice(s.tour_price || "");
    setCashAdvance(s.cash_advance || "");
    setCompanyExpenses((s.company_expenses || []).map((e) => ({ category: e.category || "", amount: (e.orig_amount ?? e.amount) ?? "", currency: (e.currency || "EUR").toUpperCase() })));
    const mappedExp = (s.expenses || []).map(toFormRow);
    setExpenses(mappedExp);
    openedExpenseIdsRef.current = new Set(mappedExp.map((e) => e.id).filter(Boolean));
    openedCashAdvanceRef.current = Number(s.cash_advance) || 0;
    if (s.waiting_days) {
      setWaitingMode("dayrate");
      setWaitingDays(s.waiting_days);
      setWaitingRate(s.waiting_rate || "");
      setWaitingAmount("");
    } else {
      setWaitingMode("amount");
      setWaitingAmount(s.waiting_amount || "");
      setWaitingDays("");
      setWaitingRate("");
    }
    setOpenId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startExpEdit = (sid, idx, e) => {
    setExpEdit({ sid, idx });
    setECat(e.category || "");
    setEAmt(String(e.orig_amount ?? e.amount ?? ""));
    setECur((e.currency || "EUR").toUpperCase());
    setERate(e.rate ? String(e.rate) : "");
    setEPaid(e.paid_from === "own" ? "own" : "advance");
    setECountry(e.country || "");
  };
  const cancelExpEdit = () => setExpEdit(null);
  const saveExpEdit = async () => {
    const eManual = !["RSD", "EUR"].includes((eCur || "EUR").toUpperCase());
    if (!Number(eAmt)) return toast.error("Unesite iznos");
    if (eManual && !Number(eRate)) return toast.error("Unesite kurs");
    try {
      await api.put(`/settlements/${expEdit.sid}/expense/${expEdit.idx}`, {
        description: eCat,
        amount: Number(eAmt),
        country: eCountry,
        currency: eCur,
        rate: eManual ? Number(eRate) : null,
        paid_from: ePaid,
      });
      toast.success("Trošak izmenjen");
      setExpEdit(null);
      load();
      if (auditOpen) loadAudit();
    } catch {
      toast.error("Greška pri izmeni");
    }
  };
  const delExpenseAdmin = async (sid, idx) => {
    if (!window.confirm("Obrisati ovaj trošak?")) return;
    try {
      await api.delete(`/settlements/${sid}/expense/${idx}`);
      toast.success("Trošak obrisan");
      load();
      if (auditOpen) loadAudit();
    } catch {
      toast.error("Greška pri brisanju");
    }
  };

  const loadAudit = () => api.get("/expense-audit").then((r) => setAuditList(r.data)).catch(() => {});
  const toggleAudit = () => {
    const nx = !auditOpen;
    setAuditOpen(nx);
    if (nx) loadAudit();
  };
  const fmtAmt = (b) => (b ? `${eur(b.amount)}${b.orig_amount ? ` (${b.orig_amount} ${b.currency || ""})` : ""}` : "—");

  const location = useLocation();
  const navigate = useNavigate();
  const navHandledRef = useRef(null);
  useEffect(() => {
    const eid = location.state?.editId;
    if (!eid) {
      navHandledRef.current = null;
      return;
    }
    if (navHandledRef.current === eid) return;
    if (!list.length) return;
    const s = list.find((x) => x.id === eid);
    if (s) {
      navHandledRef.current = eid;
      startEdit(s);
      // Clear the router state so the 15s list refresh does not re-trigger startEdit and wipe edits
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, list, navigate]);

  const remove = async (id) => {
    if (!window.confirm("Obrisati ovaj obračun?")) return;
    await api.delete(`/settlements/${id}`);
    toast.success("Obračun obrisan");
    load();
  };

  const paidLbl = { advance: "Akontacija", own: "Svoj novac" };

  const filtered = list.filter((s) => statusFilter === "all" || (s.status || "razduzeno") === statusFilter);

  const printSettlement = (s) => {
    const c = s.calc || {};
    const exp =
      (s.expenses || [])
        .map(
          (e) =>
            `<tr><td>${e.category || "-"}</td><td style="text-align:right">${eur(e.amount)}</td><td>${paidLbl[e.paid_from] || e.paid_from || ""}</td></tr>`
        )
        .join("") || '<tr><td colspan="3">Nema troškova</td></tr>';
    const resHtml =
      (c.final_due ?? 0) >= 0
        ? `<tr class="res ok"><td>ZA ISPLATU VOZAČU</td><td style="text-align:right">${eur(c.payout)}</td></tr>`
        : `<tr class="res bad"><td>VOZAČ VRAĆA FIRMI</td><td style="text-align:right">${eur(c.driver_returns)}</td></tr>`;
    const w = window.open("", "_blank");
    w.document.write(`<!doctype html><html lang="sr"><head><meta charset="utf-8"><title>Obračun ${s.driver_name || ""}</title>
      <style>body{font-family:Arial,sans-serif;color:#111;padding:28px}h1{font-size:19px;margin:0}.sub{font-weight:bold}.pib{font-size:12px;color:#555}.meta{font-size:13px;margin:8px 0}table{width:100%;border-collapse:collapse;font-size:13px;margin:6px 0 14px}th,td{border:1px solid #999;padding:6px 8px;text-align:left}th{background:#eee}.sum td{border:1px solid #bbb}.res td{font-weight:bold;font-size:15px}.ok td{background:#dcfce7}.bad td{background:#fee2e2}.sign{margin-top:40px;font-size:13px}</style></head><body>
      <h1>Obračun i razduženje vozača po krugu</h1><div class="sub">APR MENSUR DULJEVIĆ</div><div class="pib">PIB: 114365454 · MB: 67518896</div>
      <div class="meta"><b>Vozač:</b> ${s.driver_name || "-"}<br/><b>Vozilo:</b> ${s.vehicle_plate || "-"} · <b>Krug:</b> ${s.trip_label || "-"} · <b>Datum:</b> ${fmtDate(s.date)}</div>
      <b>Troškovi kamiona</b>
      <table><tr><th>Vrsta troška</th><th style="text-align:right">Iznos</th><th>Plaćeno iz</th></tr>${exp}</table>
      <b>Obračun</b>
      <table class="sum"><tr><td>Cena kruga (vozaču)</td><td style="text-align:right">${eur(s.driver_pay)}</td></tr>
      <tr><td>Dnevnice za čekanje</td><td style="text-align:right">${eur(c.waiting)}</td></tr>
      <tr style="font-weight:bold;background:#eff6ff"><td>Ukupna zarada vozača</td><td style="text-align:right">${eur(c.total_earnings)}</td></tr>
      <tr><td>Akontacija (zaduženje)</td><td style="text-align:right">${eur(s.cash_advance)}</td></tr>
      <tr><td>Troškovi iz akontacije</td><td style="text-align:right">${eur(c.expenses_from_advance)}</td></tr>
      <tr><td>Troškovi iz svog novca</td><td style="text-align:right">${eur(c.expenses_own)}</td></tr>
      <tr><td>Ukupno troškovi</td><td style="text-align:right">${eur(c.total_expenses)}</td></tr>
      <tr><td>Preostala akontacija kod vozača</td><td style="text-align:right">${eur(c.remaining_advance)}</td></tr>
      ${resHtml}</table>
      <div class="sign">Potpis vozača: ______________________&nbsp;&nbsp;&nbsp;&nbsp;Potpis odgovornog lica: ______________________</div>
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };

  const downloadSettlementPdf = async (s) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/settlements/${s.id}/pdf`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("fail");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `obracun_${(s.driver_name || "vozac").replace(/\s/g, "_")}_${s.date || ""}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("PDF preuzet");
    } catch (e) {
      toast.error("Greška pri PDF izvozu");
    }
  };

  const downloadSettlementWord = async (s) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/settlements/${s.id}/word`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("fail");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `obracun_${(s.driver_name || "vozac").replace(/\s/g, "_")}_${s.date || ""}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Word dokument preuzet");
    } catch (e) {
      toast.error("Greška pri Word izvozu");
    }
  };

  return (
    <div className="space-y-6" data-testid="obracun-page">
      <div>
        <h1 className="font-head text-2xl font-bold flex items-center gap-2">
          <Calculator className="h-6 w-6 text-blue-400" /> Obračun i razduženje vozača po krugu
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          „Dodeli turu vozaču" otvara turu (vozač je odmah vidi i unosi keš troškove). „Razduži" pravi konačan obračun. Troškove preko računa firme i profit vozač ne vidi.
        </p>
      </div>

      <div className="bg-[#131C2E] border border-[#23314A] rounded-xl" data-testid="audit-card">
        <button onClick={toggleAudit} data-testid="audit-toggle" className="w-full flex items-center justify-between px-5 py-3 text-left">
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <History className="h-4 w-4 text-amber-400" /> Istorija izmena i brisanja troškova
          </span>
          {auditOpen ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
        </button>
        {auditOpen && (
          <div className="border-t border-[#23314A] px-5 py-4" data-testid="audit-panel">
            {auditList.length === 0 ? (
              <p className="text-sm text-slate-500">Još nema zabeleženih izmena.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {auditList.map((a) => (
                  <div key={a.id} className="flex items-start justify-between gap-3 text-sm bg-[#0B0F17] border border-[#23314A] rounded-lg px-3 py-2" data-testid={`audit-row-${a.id}`}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${a.action === "delete" ? "bg-red-500/15 text-red-300" : "bg-amber-500/15 text-amber-300"}`}>{a.action === "delete" ? "Obrisano" : "Izmenjeno"}</span>
                        <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${a.by_role === "driver" ? "bg-blue-500/15 text-blue-300" : "bg-slate-500/15 text-slate-400"}`}>{a.by_role === "driver" ? "Vozač" : "Admin"}{a.by_name ? ` · ${a.by_name}` : ""}</span>
                        <span className="text-slate-200 truncate">{(a.before && a.before.category) || (a.after && a.after.category) || "Trošak"}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {a.driver_name || "—"}{a.trip_label ? ` · ${a.trip_label}` : ""}
                        {a.before ? ` · pre: ${fmtAmt(a.before)}` : ""}
                        {a.action !== "delete" && a.after ? ` → posle: ${fmtAmt(a.after)}` : ""}
                      </div>
                    </div>
                    <span className="text-xs text-slate-500 shrink-0">{fmtDT(a.at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* FORM */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-[#131C2E] border border-[#23314A] rounded-xl p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Vozač *</label>
                <select
                  data-testid="settlement-driver-select"
                  className={inputCls}
                  value={driverId}
                  onChange={(e) => setDriverId(e.target.value)}
                >
                  <option value="">— Izaberite vozača —</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.first_name} {d.last_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Vozilo (opciono)</label>
                <select
                  data-testid="settlement-vehicle-select"
                  className={inputCls}
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                >
                  <option value="">— Bez vozila —</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate} {v.make} {v.model}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Oznaka kruga (npr. Beč–Beograd)</label>
                <input
                  data-testid="settlement-trip-input"
                  className={inputCls}
                  value={tripLabel}
                  onChange={(e) => setTripLabel(e.target.value)}
                  placeholder="Ruta / opis kruga"
                />
              </div>
              <div>
                <label className={labelCls}>Datum</label>
                <DateField value={date} onChange={setDate} testId="settlement-date" />
              </div>
              <div>
                <label className={labelCls}>Cena koju plaćam vozaču za ovaj krug (€) *</label>
                <input
                  data-testid="settlement-driver-pay-input"
                  type="number"
                  min="0"
                  step="1"
                  className={inputCls}
                  value={driverPay}
                  onChange={(e) => setDriverPay(e.target.value)}
                  placeholder="npr. 300"
                />
              </div>
              <div>
                <label className={labelCls}>Ugovorena cena ture — prihod firme (€)</label>
                <input
                  data-testid="settlement-tour-price-input"
                  type="number"
                  min="0"
                  step="1"
                  className={inputCls}
                  value={tourPrice}
                  onChange={(e) => setTourPrice(e.target.value)}
                  placeholder="npr. 1200 (skriveno vozaču)"
                />
              </div>
              <div>
                <label className={labelCls}>Akontacija / Zaduženje (keš vozaču) (€)</label>
                <input
                  data-testid="settlement-advance-input"
                  type="number"
                  min="0"
                  step="1"
                  className={inputCls}
                  value={cashAdvance}
                  onChange={(e) => setCashAdvance(e.target.value)}
                  placeholder="npr. 500"
                />
              </div>
            </div>
          </div>

          {/* WAITING ALLOWANCES */}
          <div className="bg-[#131C2E] border border-[#23314A] rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-head text-lg font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-400" /> Dnevnice za čekanje
              </h2>
              <div className="flex rounded-lg overflow-hidden border border-[#23314A]">
                <button
                  type="button"
                  onClick={() => setWaitingMode("amount")}
                  className={`text-xs px-3 py-1.5 transition-colors ${waitingMode === "amount" ? "bg-blue-600 text-white" : "bg-[#1A2438] text-slate-400"}`}
                  data-testid="waiting-mode-amount"
                >
                  Ukupan iznos
                </button>
                <button
                  type="button"
                  onClick={() => setWaitingMode("dayrate")}
                  className={`text-xs px-3 py-1.5 transition-colors ${waitingMode === "dayrate" ? "bg-blue-600 text-white" : "bg-[#1A2438] text-slate-400"}`}
                  data-testid="waiting-mode-dayrate"
                >
                  Dani × cena
                </button>
              </div>
            </div>
            {waitingMode === "amount" ? (
              <div>
                <label className={labelCls}>Ukupan iznos za čekanje (€)</label>
                <input
                  data-testid="waiting-amount-input"
                  type="number"
                  min="0"
                  step="1"
                  className={inputCls}
                  value={waitingAmount}
                  onChange={(e) => setWaitingAmount(e.target.value)}
                  placeholder="npr. 120"
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Broj dana / sati čekanja</label>
                  <input
                    data-testid="waiting-days-input"
                    type="number"
                    min="0"
                    step="1"
                    className={inputCls}
                    value={waitingDays}
                    onChange={(e) => setWaitingDays(e.target.value)}
                    placeholder="npr. 2"
                  />
                </div>
                <div>
                  <label className={labelCls}>Cena po danu / satu (€)</label>
                  <input
                    data-testid="waiting-rate-input"
                    type="number"
                    min="0"
                    step="1"
                    className={inputCls}
                    value={waitingRate}
                    onChange={(e) => setWaitingRate(e.target.value)}
                    placeholder="npr. 60"
                  />
                </div>
              </div>
            )}
            <div className="mt-3 text-sm text-slate-300" data-testid="waiting-total">
              Ukupno dnevnice: <span className="font-mono font-semibold text-blue-300">{eur(waitingTotal)}</span>
            </div>
          </div>

          {/* CASH EXPENSES */}
          <div className="bg-[#131C2E] border border-[#23314A] rounded-xl p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-head text-lg font-semibold">Keš troškovi kamiona</h2>
              <button
                data-testid="add-expense-button"
                onClick={addExpense}
                className="inline-flex items-center gap-1.5 bg-[#1A2438] hover:bg-[#23314A] border border-[#23314A] text-slate-200 rounded-lg px-3 py-1.5 text-sm transition-colors"
              >
                <Plus className="h-4 w-4" /> Dodaj trošak
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-3">Keš sa terena (pranje, keš putarina, parking, hitne popravke) — plaća vozač iz akontacije ili svog novca. Vozač i sam unosi ove troškove sa svog naloga.</p>
            {expenses.length === 0 && (
              <p className="text-sm text-slate-500 py-4 text-center">Nema unetih troškova.</p>
            )}
            <div className="space-y-2">
              {expenses.map((e, i) => {
                const manual = isManualCur(e.currency);
                return (
                <div key={i} className="space-y-2 border-b border-[#23314A]/40 pb-2 last:border-0 last:pb-0">
                  <div className="grid grid-cols-12 gap-2 items-center" data-testid={`expense-row-${i}`}>
                    <div className="col-span-4">
                      <ManagedSelect
                        category="expense_category"
                        value={e.category}
                        onChange={(v) => setExp(i, "category", v)}
                        placeholder="Vrsta troška"
                        testId={`expense-category-${i}`}
                      />
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className={`${inputCls} col-span-2 mt-0`}
                      value={e.amount}
                      onChange={(ev) => setExp(i, "amount", ev.target.value)}
                      placeholder="Iznos"
                      data-testid={`expense-amount-${i}`}
                    />
                    <select
                      value={e.currency || "EUR"}
                      onChange={(ev) => setExp(i, "currency", ev.target.value)}
                      className="col-span-2 bg-[#1A2438] border border-[#23314A] rounded-lg px-2 py-2 text-sm text-slate-100"
                      data-testid={`expense-currency-${i}`}
                    >
                      {CURRENCIES.map((cc) => (
                        <option key={cc} value={cc}>{cc}</option>
                      ))}
                    </select>
                    <div className="col-span-3 flex rounded-lg overflow-hidden border border-[#23314A]">
                      <button
                        type="button"
                        onClick={() => setExp(i, "paid_from", "advance")}
                        className={`flex-1 text-xs py-2 transition-colors ${e.paid_from === "advance" ? "bg-blue-600 text-white" : "bg-[#1A2438] text-slate-400"}`}
                        data-testid={`expense-paidfrom-advance-${i}`}
                      >
                        Akontacija
                      </button>
                      <button
                        type="button"
                        onClick={() => setExp(i, "paid_from", "own")}
                        className={`flex-1 text-xs py-2 transition-colors ${e.paid_from === "own" ? "bg-amber-600 text-white" : "bg-[#1A2438] text-slate-400"}`}
                        data-testid={`expense-paidfrom-own-${i}`}
                      >
                        Svoj novac
                      </button>
                    </div>
                    <button
                      onClick={() => delExp(i)}
                      className="col-span-1 flex justify-center text-slate-500 hover:text-red-400"
                      data-testid={`del-expense-${i}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {manual && (
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        className={`${inputCls} col-span-4 mt-0`}
                        value={e.rate || ""}
                        onChange={(ev) => setExp(i, "rate", ev.target.value)}
                        placeholder={`Kurs: ${e.currency} za 1 €`}
                        data-testid={`expense-rate-${i}`}
                      />
                      <input
                        className={`${inputCls} col-span-4 mt-0`}
                        value={e.country || ""}
                        onChange={(ev) => setExp(i, "country", ev.target.value)}
                        placeholder="Država"
                        data-testid={`expense-country-${i}`}
                      />
                      <div className="col-span-4 text-[11px] text-slate-400 self-center text-right pr-1" data-testid={`expense-eur-preview-${i}`}>
                        {(Number(e.amount) || 0) > 0 && (Number(e.rate) || 0) > 0 ? `≈ ${eur(toEurAmt(e))}` : "unesite kurs"}
                      </div>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </div>

          {/* COMPANY EXPENSES — hidden from driver */}
          <div className="bg-[#131C2E] border border-amber-500/30 rounded-xl p-5" data-testid="company-expenses-card">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-head text-lg font-semibold flex items-center gap-2">
                <Lock className="h-4 w-4 text-amber-400" /> Troškovi preko računa firme
              </h2>
              <button
                data-testid="add-company-expense-button"
                onClick={addCompanyExpense}
                className="inline-flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-200 rounded-lg px-3 py-1.5 text-sm transition-colors"
              >
                <Plus className="h-4 w-4" /> Dodaj
              </button>
            </div>
            <p className="text-xs text-amber-300/80 mb-3">Gorivo, putarine karticom/fakturom i sl. koje plaća firma. Strogo skriveno od vozača — ulazi samo u profit firme.</p>
            {companyExpenses.length === 0 && (
              <p className="text-sm text-slate-500 py-4 text-center">Nema troškova preko računa.</p>
            )}
            <div className="space-y-2">
              {companyExpenses.map((e, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center" data-testid={`company-expense-row-${i}`}>
                  <div className="col-span-6">
                    <ManagedSelect
                      category="expense_category"
                      value={e.category}
                      onChange={(v) => setCompExp(i, "category", v)}
                      placeholder="Vrsta troška"
                      testId={`company-expense-category-${i}`}
                    />
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className={`${inputCls} col-span-3 mt-0`}
                    value={e.amount}
                    onChange={(ev) => setCompExp(i, "amount", ev.target.value)}
                    placeholder="Iznos"
                    data-testid={`company-expense-amount-${i}`}
                  />
                  <select
                    value={e.currency || "EUR"}
                    onChange={(ev) => setCompExp(i, "currency", ev.target.value)}
                    className="col-span-2 bg-[#1A2438] border border-[#23314A] rounded-lg px-2 py-2 text-sm text-slate-100"
                    data-testid={`company-expense-currency-${i}`}
                  >
                    <option value="EUR">EUR</option>
                    <option value="RSD">RSD</option>
                  </select>
                  <button
                    onClick={() => delCompExp(i)}
                    className="col-span-1 flex justify-center text-slate-500 hover:text-red-400"
                    data-testid={`del-company-expense-${i}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            {companyTotal > 0 && (
              <div className="mt-3 text-sm text-slate-300" data-testid="company-total">
                Ukupno preko računa: <span className="font-mono font-semibold text-amber-300">{eur(companyTotal)}</span>
              </div>
            )}
          </div>
        </div>

        {/* SUMMARY */}
        <div className="space-y-4">
          <div className="bg-[#131C2E] border border-[#23314A] rounded-xl p-5 sticky top-4" data-testid="settlement-summary">
            <h2 className="font-head text-lg font-semibold mb-4">{editingId ? "Uređivanje ture" : "Pregled obračuna"}</h2>
            <div className="space-y-2.5 text-sm">
              <Row icon={<Coins className="h-4 w-4 text-blue-400" />} label="Cena kruga (vozaču)" value={eur(driverPay)} testId="sum-driver-pay" />
              <Row icon={<Clock className="h-4 w-4 text-blue-400" />} label="Dnevnice za čekanje" value={eur(calc.waiting)} testId="sum-waiting" />
              <Row label="Ukupna zarada vozača" value={eur(calc.totalEarnings)} testId="sum-total-earnings" />
              <Row icon={<Wallet className="h-4 w-4 text-blue-400" />} label="Akontacija (zaduženje)" value={eur(cashAdvance)} testId="sum-advance" />
              <Row label="Keš troškovi iz akontacije" value={eur(calc.fromAdv)} muted />
              <Row label="Keš troškovi iz svog novca" value={eur(calc.own)} muted />
              <Row label="Ukupno keš troškovi" value={eur(calc.total)} testId="sum-total-expenses" />
              <div className="border-t border-[#23314A] my-2" />
              <Row icon={<Lock className="h-4 w-4 text-amber-400" />} label="Troškovi preko računa (skriveno)" value={eur(calc.companyTotal)} testId="sum-company-expenses" />
              <Row icon={<Coins className="h-4 w-4 text-emerald-400" />} label="Ugovorena cena (prihod)" value={eur(tourPrice)} testId="sum-tour-price" />
              <Row label="Ukupna zarada firme (profit)" value={eur(calc.profit)} testId="sum-profit" />
              <div className="border-t border-[#23314A] my-2" />
              <Row
                icon={<ArrowRightLeft className="h-4 w-4 text-amber-400" />}
                label="Preostala akontacija kod vozača"
                value={eur(calc.remainingAdvance)}
                testId="sum-remaining-advance"
              />
            </div>

            <div
              className={`mt-4 rounded-xl p-4 text-center ${calc.finalDue >= 0 ? "bg-emerald-600/15 border border-emerald-500/30" : "bg-red-600/15 border border-red-500/30"}`}
              data-testid="settlement-result"
            >
              {calc.finalDue >= 0 ? (
                <>
                  <div className="text-xs uppercase tracking-wider text-emerald-300">Za isplatu vozaču</div>
                  <div className="font-head text-3xl font-bold text-emerald-300 mt-1" data-testid="result-payout">
                    {eur(calc.payout)}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-xs uppercase tracking-wider text-red-300">Vozač vraća firmi</div>
                  <div className="font-head text-3xl font-bold text-red-300 mt-1" data-testid="result-return">
                    {eur(calc.driverReturns)}
                  </div>
                </>
              )}
            </div>

            {editingId ? (
              <div className="mt-4 space-y-2">
                <button data-testid="save-edit-button" onClick={() => save(editingStatus)} disabled={saving} className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-lg px-4 py-3 text-sm transition-colors">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Sačuvaj izmene
                </button>
                {editingStatus !== "razduzeno" && (
                  <button data-testid="finalize-edit-button" onClick={() => save("razduzeno")} disabled={saving} className="w-full inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors">
                    <Save className="h-4 w-4" /> Razduži krug
                  </button>
                )}
                <button data-testid="cancel-edit-button" onClick={resetForm} className="w-full inline-flex items-center justify-center gap-2 bg-[#1A2438] hover:bg-[#23314A] border border-[#23314A] text-slate-300 rounded-lg px-4 py-2.5 text-sm transition-colors">
                  <X className="h-4 w-4" /> Otkaži izmene
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                <button data-testid="assign-tour-button" onClick={() => save("otvorena")} disabled={saving} className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-lg px-4 py-3 text-sm transition-colors">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPinned className="h-4 w-4" />} Dodeli turu vozaču
                </button>
                <button data-testid="finalize-settlement-button" onClick={() => save("razduzeno")} disabled={saving} className="w-full inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors">
                  <Save className="h-4 w-4" /> Razduži odmah
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* HISTORY */}
      <div className="bg-[#131C2E] border border-[#23314A] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#23314A] flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-head text-lg font-semibold">Ture i razduženja</h2>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} data-testid="status-filter" className="bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-1.5 text-sm text-slate-100">
            <option value="all">Sve ture</option>
            <option value="otvorena">Otvorene</option>
            <option value="razduzeno">Razdužene</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-[#23314A]">
                <th className="px-5 py-3">Datum</th>
                <th className="px-5 py-3">Vozač</th>
                <th className="px-5 py-3">Krug</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Cena kruga</th>
                <th className="px-5 py-3 text-right">Akontacija</th>
                <th className="px-5 py-3 text-right">Troškovi</th>
                <th className="px-5 py-3 text-right">Rezultat</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-slate-500">
                    Nema tura za prikaz.
                  </td>
                </tr>
              )}
              {filtered.map((s) => {
                const driverExp = (s.expenses || []).filter((e) => e.by === "driver");
                const advEntries = s.advance_entries || [];
                const driverInputs = driverExp.length + advEntries.length;
                const isOpen = openId === s.id;
                return (
                <Fragment key={s.id}>
                <tr className="border-b border-[#23314A]/60 hover:bg-[#1C283F]/40 cursor-pointer" data-testid={`settlement-row-${s.id}`} onClick={() => setOpenId(isOpen ? null : s.id)}>
                  <td className="px-5 py-3 font-mono text-slate-300">
                    <span className="inline-flex items-center gap-1.5">
                      {isOpen ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                      {s.date}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-200">
                    <span className="inline-flex items-center gap-1.5">
                      {s.driver_name || "—"}
                      {driverInputs > 0 && (
                        <span className="inline-flex items-center gap-1 bg-blue-500/15 text-blue-300 text-[11px] font-semibold rounded-full px-2 py-0.5" data-testid={`driver-inputs-badge-${s.id}`}>
                          <User className="h-3 w-3" /> {driverInputs}
                        </span>
                      )}
                      {s.alerts && s.alerts.length > 0 && (
                        <span title={s.alerts.map((a) => a.message).join("\n")} data-testid={`settlement-alert-${s.id}`}>
                          <AlertTriangle className="h-4 w-4 text-amber-400" />
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-400">{s.trip_label || (s.vehicle_plate ? s.vehicle_plate : "—")}</td>
                  <td className="px-5 py-3" data-testid={`settlement-status-${s.id}`}>
                    {(s.status || "razduzeno") === "otvorena" ? (
                      <span className="inline-flex items-center bg-blue-500/15 text-blue-300 text-[11px] font-semibold rounded-full px-2 py-0.5">Otvorena</span>
                    ) : (
                      <span className="inline-flex items-center bg-emerald-500/15 text-emerald-300 text-[11px] font-semibold rounded-full px-2 py-0.5">Razduženo</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right font-mono">{eur(s.driver_pay)}</td>
                  <td className="px-5 py-3 text-right font-mono">{eur(s.cash_advance)}</td>
                  <td className="px-5 py-3 text-right font-mono">{eur(s.calc?.total_expenses)}</td>
                  <td className="px-5 py-3 text-right font-mono font-semibold">
                    {s.calc?.final_due >= 0 ? (
                      <span className="text-emerald-300">+{eur(s.calc?.payout)}</span>
                    ) : (
                      <span className="text-red-300">vraća {eur(s.calc?.driver_returns)}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => startEdit(s)} className="text-slate-500 hover:text-amber-300 mr-2" title="Uredi turu" data-testid={`edit-settlement-${s.id}`}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => printSettlement(s)} className="text-slate-500 hover:text-blue-300 mr-2" title="Štampaj" data-testid={`print-settlement-${s.id}`}>
                      <Printer className="h-4 w-4" />
                    </button>
                    <button onClick={() => downloadSettlementWord(s)} className="text-slate-500 hover:text-sky-300 mr-2" title="Word (.docx)" data-testid={`word-settlement-${s.id}`}>
                      <FileText className="h-4 w-4" />
                    </button>
                    <button onClick={() => downloadSettlementPdf(s)} className="text-slate-500 hover:text-emerald-300 mr-2" title="PDF" data-testid={`pdf-settlement-${s.id}`}>
                      <Download className="h-4 w-4" />
                    </button>
                    <button onClick={() => remove(s.id)} className="text-slate-500 hover:text-red-400" data-testid={`del-settlement-${s.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
                {isOpen && (
                  <tr className="bg-[#0B0F17]" data-testid={`settlement-detail-${s.id}`}>
                    <td colSpan={9} className="px-5 py-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Troškovi ({(s.expenses || []).length})</div>
                          {(s.expenses || []).length === 0 ? (
                            <p className="text-sm text-slate-500">Nema troškova.</p>
                          ) : (
                            <div className="space-y-1.5">
                              {(s.expenses || []).map((e, i) => {
                                const editing = expEdit && expEdit.sid === s.id && expEdit.idx === i;
                                const eManual = !["RSD", "EUR"].includes((eCur || "EUR").toUpperCase());
                                if (editing) {
                                  return (
                                    <div key={i} className="bg-[#131C2E] border border-amber-500/30 rounded-lg px-3 py-2 space-y-2" data-testid={`edit-exp-${s.id}-${i}`}>
                                      <ManagedSelect category="expense_category" value={eCat} onChange={setECat} placeholder="Vrsta troška" testId={`edit-exp-cat-${s.id}-${i}`} />
                                      <div className="grid grid-cols-2 gap-2">
                                        <input type="number" value={eAmt} onChange={(ev) => setEAmt(ev.target.value)} placeholder="Iznos" className="bg-[#1A2438] border border-[#23314A] rounded-lg px-2 py-1.5 text-sm" data-testid={`edit-exp-amt-${s.id}-${i}`} />
                                        <select value={eCur} onChange={(ev) => setECur(ev.target.value)} className="bg-[#1A2438] border border-[#23314A] rounded-lg px-2 py-1.5 text-sm" data-testid={`edit-exp-cur-${s.id}-${i}`}>
                                          {CURRENCIES.map((cc) => <option key={cc} value={cc}>{cc}</option>)}
                                        </select>
                                      </div>
                                      {eManual && (
                                        <input type="number" value={eRate} onChange={(ev) => setERate(ev.target.value)} placeholder={`Kurs za 1 € (${eCur})`} className="w-full bg-[#1A2438] border border-[#23314A] rounded-lg px-2 py-1.5 text-sm" data-testid={`edit-exp-rate-${s.id}-${i}`} />
                                      )}
                                      <div className="grid grid-cols-2 gap-2">
                                        <input value={eCountry} onChange={(ev) => setECountry(ev.target.value)} placeholder="Država" className="bg-[#1A2438] border border-[#23314A] rounded-lg px-2 py-1.5 text-sm" data-testid={`edit-exp-country-${s.id}-${i}`} />
                                        <select value={ePaid} onChange={(ev) => setEPaid(ev.target.value)} className="bg-[#1A2438] border border-[#23314A] rounded-lg px-2 py-1.5 text-sm" data-testid={`edit-exp-paid-${s.id}-${i}`}>
                                          <option value="advance">Iz akontacije</option>
                                          <option value="own">Svoj novac</option>
                                        </select>
                                      </div>
                                      <div className="flex gap-2">
                                        <button onClick={saveExpEdit} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-1.5 text-xs font-semibold" data-testid={`edit-exp-save-${s.id}-${i}`}>Sačuvaj</button>
                                        <button onClick={cancelExpEdit} className="flex-1 bg-[#1A2438] hover:bg-[#23314A] text-slate-300 rounded-lg py-1.5 text-xs" data-testid={`edit-exp-cancel-${s.id}-${i}`}>Otkaži</button>
                                      </div>
                                    </div>
                                  );
                                }
                                return (
                                <div key={i} className="flex items-start justify-between gap-3 text-sm bg-[#131C2E] border border-[#23314A] rounded-lg px-3 py-2" data-testid={`detail-exp-${s.id}-${i}`}>
                                  <div className="min-w-0">
                                    <div className="text-slate-200 truncate">
                                      {e.category || "Trošak"}
                                      <span className={`ml-2 text-[10px] font-semibold rounded px-1.5 py-0.5 ${e.by === "driver" ? "bg-blue-500/15 text-blue-300" : "bg-slate-500/15 text-slate-400"}`}>{byLbl(e.by)}</span>
                                    </div>
                                    <div className="text-xs text-slate-500">
                                      {paidLbl[e.paid_from] || e.paid_from}
                                      {e.orig_amount ? ` · ${e.orig_amount} ${e.currency || ""}` : ""}
                                      {e.country ? ` · ${e.country}` : ""}
                                      {e.at ? ` · ${fmtDT(e.at)}` : ""}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <div className="font-mono font-semibold text-slate-100">{eur(e.amount)}</div>
                                    <button onClick={() => startExpEdit(s.id, i, e)} className="text-slate-500 hover:text-amber-300" title="Izmeni trošak" data-testid={`detail-exp-edit-${s.id}-${i}`}><Pencil className="h-3.5 w-3.5" /></button>
                                    <button onClick={() => delExpenseAdmin(s.id, i)} className="text-slate-500 hover:text-red-400" title="Obriši trošak" data-testid={`detail-exp-del-${s.id}-${i}`}><Trash2 className="h-3.5 w-3.5" /></button>
                                  </div>
                                </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Akontacije — unosi ({advEntries.length})</div>
                          {advEntries.length === 0 ? (
                            <p className="text-sm text-slate-500">Nema pojedinačnih unosa akontacije.</p>
                          ) : (
                            <div className="space-y-1.5">
                              {advEntries.map((a, i) => (
                                <div key={i} className="flex items-start justify-between gap-3 text-sm bg-[#131C2E] border border-[#23314A] rounded-lg px-3 py-2" data-testid={`detail-adv-${s.id}-${i}`}>
                                  <div className="min-w-0">
                                    <div className="text-slate-200 truncate">
                                      Akontacija
                                      <span className={`ml-2 text-[10px] font-semibold rounded px-1.5 py-0.5 ${a.by === "driver" ? "bg-blue-500/15 text-blue-300" : "bg-slate-500/15 text-slate-400"}`}>{byLbl(a.by)}</span>
                                    </div>
                                    <div className="text-xs text-slate-500">{a.note || ""}{a.at ? `${a.note ? " · " : ""}${fmtDT(a.at)}` : ""}</div>
                                  </div>
                                  <div className="font-mono font-semibold text-blue-300 shrink-0">{eur(a.amount)}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      {(s.company_expenses || []).length > 0 && (
                        <div className="mt-4">
                          <div className="text-xs font-semibold uppercase tracking-wider text-amber-400/90 mb-2 flex items-center gap-1.5">
                            <Lock className="h-3 w-3" /> Troškovi preko računa firme — skriveno vozaču ({(s.company_expenses || []).length})
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                            {(s.company_expenses || []).map((e, i) => (
                              <div key={i} className="flex items-center justify-between gap-3 text-sm bg-[#131C2E] border border-amber-500/20 rounded-lg px-3 py-2" data-testid={`detail-comp-${s.id}-${i}`}>
                                <span className="text-slate-200 truncate">{e.category || "Trošak"}</span>
                                <span className="font-mono font-semibold text-amber-300 shrink-0">{eur(e.amount)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const Row = ({ icon, label, value, muted, testId }) => (
  <div className="flex items-center justify-between">
    <span className={`flex items-center gap-2 ${muted ? "text-slate-500" : "text-slate-300"}`}>
      {icon} {label}
    </span>
    <span className={`font-mono ${muted ? "text-slate-400" : "text-slate-100"}`} data-testid={testId}>
      {value}
    </span>
  </div>
);
