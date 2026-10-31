import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { API, fmtDate, rsd } from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";
import { DateField } from "@/components/DateField";
import { ManagedSelect } from "@/components/ManagedSelect";
import { Plus, Wrench, Trash2, Search, Pencil, Paperclip } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const emptyM = { vehicle_id: "", date: "", service_type: "", description: "", cost: "", mechanic_cost: "", cost_currency: "RSD", mechanic_cost_currency: "EUR", odometer: "", mechanic: "", status: "Završeno" };

export default function Maintenance() {
  const [vehicles, setVehicles] = useState([]);
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyM);
  const [editing, setEditing] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [viewM, setViewM] = useState(null);
  const [laborModal, setLaborModal] = useState(null);
  const [savingLabor, setSavingLabor] = useState(false);
  const { money, rate, currency } = useCurrency();
  const navigate = useNavigate();

  const load = () => {
    api.get("/vehicles").then((r) => setVehicles(r.data)).catch(() => {});
    api.get("/maintenance").then((r) => setItems(r.data)).catch(() => {});
  };
  useEffect(() => {
    load();
  }, []);

  const delReceipt = async (rid) => {
    if (!viewM) return;
    if (!window.confirm("Da li ste sigurni da želite da obrišete ovaj račun?")) return;
    try {
      const { data } = await api.delete(`/maintenance/${viewM.id}/receipt/${rid}`);
      const rec = data.receipts || [];
      setViewM((v) => (v ? { ...v, receipts: rec } : v));
      setItems((prev) => prev.map((m) => (m.id === viewM.id ? { ...m, receipts: rec } : m)));
      toast.success("Račun obrisan");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Greška pri brisanju računa");
    }
  };

  const plateById = Object.fromEntries(vehicles.map((v) => [v.id, `${v.plate} · ${v.make} ${v.model}`.trim()]));

  const add = async (e) => {
    e.preventDefault();
    if (!form.vehicle_id) return toast.error("Izaberite vozilo");
    const body = {
      vehicle_id: form.vehicle_id,
      date: form.date,
      service_type: form.service_type,
      description: form.description,
      cost: Number(form.cost) || 0,
      mechanic_cost: Number(form.mechanic_cost) || 0,
      cost_currency: form.cost_currency || "RSD",
      mechanic_cost_currency: form.mechanic_cost_currency || form.cost_currency || "EUR",
      odometer: form.odometer ? Number(form.odometer) : null,
      mechanic: form.mechanic,
      status: form.status,
    };
    let mid = editing;
    try {
      if (editing) {
        await api.put(`/maintenance/${editing}`, body);
      } else {
        const r = await api.post("/maintenance", body);
        mid = r.data.id;
      }
    } catch {
      return toast.error("Greška pri čuvanju servisa");
    }
    let uploadFailed = false;
    if (receipt && mid) {
      const fd = new FormData();
      fd.append("file", receipt);
      try {
        await api.post(`/maintenance/${mid}/receipt`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      } catch {
        uploadFailed = true;
      }
    }
    if (uploadFailed) toast.error("Servis sačuvan, ali otpremanje računa nije uspelo");
    else toast.success(editing ? "Servis izmenjen" : "Servis dodat");
    setOpen(false);
    setForm(emptyM);
    setReceipt(null);
    setEditing(null);
    load();
  };

  const openEdit = (m) => {
    setEditing(m.id);
    const pCur = m.cost_currency || "RSD";
    const lCur = m.mechanic_cost_currency || pCur;
    setForm({
      vehicle_id: m.vehicle_id,
      date: m.date || "",
      service_type: m.service_type || "",
      description: m.description || "",
      cost: Number(m.cost) > 0 ? String(m.cost) : "",
      mechanic_cost: Number(m.mechanic_cost) > 0 ? String(m.mechanic_cost) : "",
      cost_currency: pCur,
      mechanic_cost_currency: lCur,
      odometer: m.odometer ?? "",
      mechanic: m.mechanic || "",
      status: m.status || "Završeno",
    });
    setOpen(true);
  };

  const saveQuickLabor = async (e) => {
    e.preventDefault();
    if (!laborModal?.item) return;
    setSavingLabor(true);
    try {
      const chosenCur = laborModal.cost_currency || "EUR";
      const payload = {
        mechanic_cost: Number(laborModal.mechanic_cost) || 0,
        mechanic: laborModal.mechanic || "",
        mechanic_cost_currency: chosenCur,
      };
      await api.patch(`/maintenance/${laborModal.item.id}/labor`, payload);
      toast.success("Rad sačuvan");
      setItems((prev) =>
        prev.map((m) =>
          m.id === laborModal.item.id
            ? { ...m, mechanic_cost: payload.mechanic_cost, mechanic: payload.mechanic, mechanic_cost_currency: chosenCur }
            : m
        )
      );
      setLaborModal(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Greška pri čuvanju rada");
    } finally {
      setSavingLabor(false);
    }
  };

  const del = async (mid) => {
    await api.delete(`/maintenance/${mid}`);
    toast.success("Zapis obrisan");
    load();
  };

  const filtered = useMemo(() => {
    return items.filter((m) => {
      const hay = `${plateById[m.vehicle_id] || ""} ${m.service_type} ${m.description} ${m.mechanic}`.toLowerCase();
      return !q || hay.includes(q.toLowerCase());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, q, vehicles]);

  const toEur = (m) => {
    const pCur = m.cost_currency || "RSD";
    const lCur = m.mechanic_cost_currency || "EUR";
    const pVal = Number(m.cost) || 0;
    const lVal = Number(m.mechanic_cost) || 0;
    const pEur = pCur === "EUR" ? pVal : pVal / (rate || 117);
    const lEur = lCur === "EUR" ? lVal : lVal / (rate || 117);
    return pEur + lEur;
  };
  const costLbl = (m) => money(toEur(m));
  const laborEur = (m) => {
    const lCur = m.mechanic_cost_currency || "EUR";
    const v = Number(m.mechanic_cost) || 0;
    return lCur === "EUR" ? v : v / (rate || 117);
  };
  const partsEur = (m) => {
    const pCur = m.cost_currency || "RSD";
    const v = Number(m.cost) || 0;
    return pCur === "EUR" ? v : v / (rate || 117);
  };
  const totalEur = filtered.reduce((s, m) => s + toEur(m), 0);
  const inputCls =
    "w-full mt-1 bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";
  const labelCls = "text-xs uppercase tracking-wider text-slate-400 font-semibold";

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-head text-3xl font-bold tracking-tight">Održavanje</h1>
          <p className="text-sm text-slate-400 mt-1">
            Evidencija svih servisa · {filtered.length} zapisa · ukupno {money(totalEur)}
          </p>
        </div>
        <button
          data-testid="add-maintenance-global-button"
          onClick={() => { setEditing(null); setForm({ ...emptyM, cost_currency: "RSD", mechanic_cost_currency: "EUR" }); setOpen(true); }}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
        >
          <Plus className="h-4 w-4" /> Novi servis
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <input
          data-testid="maintenance-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Pretraga po vozilu, servisu, mehaničaru..."
          className="w-full bg-[#131C2E] border border-[#23314A] rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
        />
      </div>

      <div className="bg-[#131C2E] border border-[#23314A] rounded-xl overflow-hidden shadow-lg shadow-black/20">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Wrench className="h-10 w-10 text-slate-600 mx-auto" />
            <p className="text-slate-400 mt-3 text-sm">Nema zapisa o održavanju.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-[#23314A]">
                  <th className="px-5 py-3">Datum</th>
                  <th className="px-5 py-3">Vozilo</th>
                  <th className="px-5 py-3">Vrsta servisa</th>
                  <th className="px-5 py-3">Opis</th>
                  <th className="px-5 py-3">Mehaničar</th>
                  <th className="px-5 py-3">Rad</th>
                  <th className="px-5 py-3">Trošak</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id} className="border-b border-[#23314A]/60 hover:bg-[#1C283F]/40">
                    <td className="px-5 py-3 font-mono">{fmtDate(m.date)}</td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => navigate(`/vozila/${m.vehicle_id}`)}
                        className="font-mono text-blue-400 hover:text-blue-300"
                      >
                        {plateById[m.vehicle_id] || "—"}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-slate-200">{m.service_type}</td>
                    <td className="px-5 py-3 text-slate-400">{m.description}</td>
                    <td className="px-5 py-3 text-slate-400">{m.mechanic || "—"}</td>
                    <td className="px-5 py-3 font-mono text-slate-300">
                      {Number(m.mechanic_cost) > 0 ? money(laborEur(m)) : "—"}
                    </td>
                    <td className="px-5 py-3 font-mono">
                      <div>{money(toEur(m))}</div>
                      {Number(m.mechanic_cost) > 0 && Number(m.cost) > 0 && (
                        <div className="text-[10px] text-slate-500">
                          (delovi: {money(partsEur(m))})
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex flex-col items-end gap-1.5">
                        <div>
                          <button
                            onClick={() => {
                              const lCur = m.mechanic_cost_currency || m.cost_currency || "EUR";
                              setLaborModal({
                                item: m,
                                mechanic_cost: Number(m.mechanic_cost) > 0 ? String(m.mechanic_cost) : "",
                                mechanic: m.mechanic || "",
                                cost_currency: lCur,
                              });
                            }}
                            className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded transition-colors whitespace-nowrap ${
                              Number(m.mechanic_cost) > 0
                                ? "bg-blue-950/60 text-blue-300 border border-blue-500/30 hover:bg-blue-900/60"
                                : "bg-slate-800/80 text-slate-300 border border-slate-700 hover:border-blue-500/50 hover:text-white"
                            }`}
                            title="Brzi unos cene rada mehaničara"
                            data-testid={`quick-labor-btn-${m.id}`}
                          >
                            <Wrench className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                            <span className="font-medium">
                              {Number(m.mechanic_cost) > 0 ? money(laborEur(m)) : "+ Rad"}
                            </span>
                          </button>
                        </div>
                        <div className="inline-flex items-center justify-end gap-2">
                          {(m.receipts || []).length > 0 && (
                            <button
                              onClick={() => {
                                if (m.receipts.length === 1) {
                                  const r = m.receipts[0];
                                  const token = localStorage.getItem("token") || "";
                                  window.open(`${API}/maintenance/${m.id}/receipt?rid=${r.id}&auth=${token}&as_pdf=1`, "_blank");
                                } else {
                                  setViewM(m);
                                }
                              }}
                              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-900/60 transition-colors"
                              title={
                                m.receipts.length === 1
                                  ? `Otvori priloženi račun: ${m.receipts[0]?.filename || "Račun"}`
                                  : `Pregledaj priložene račune (${m.receipts.length})`
                              }
                              data-testid={`receipts-btn-${m.id}`}
                            >
                              <Paperclip className="h-3.5 w-3.5 text-emerald-400" />
                              <span className="font-semibold">{m.receipts.length}</span>
                            </button>
                          )}
                          <button
                            onClick={() => openEdit(m)}
                            className="text-slate-500 hover:text-blue-300 p-0.5"
                            title="Izmeni servis"
                            data-testid={`edit-maint-${m.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => del(m.id)}
                            className="text-slate-500 hover:text-red-400 p-0.5"
                            title="Obriši servis"
                            data-testid={`del-maint-${m.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setForm(emptyM); setEditing(null); setReceipt(null); } }}>
        <DialogContent className="bg-[#131C2E] border-[#23314A] text-slate-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-head">{editing ? "Izmena servisa" : "Novi servis"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={add} className="space-y-3" data-testid="global-maintenance-form">
            <div>
              <label className={labelCls}>Vozilo *</label>
              <Select value={form.vehicle_id} onValueChange={(v) => setForm({ ...form, vehicle_id: v })}>
                <SelectTrigger data-testid="maintenance-vehicle-select" className={inputCls}>
                  <SelectValue placeholder="Izaberite vozilo" />
                </SelectTrigger>
                <SelectContent className="bg-[#131C2E] border-[#23314A] text-slate-100">
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.plate} · {v.make} {v.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Datum *</label>
                <DateField value={form.date} onChange={(v) => setForm({ ...form, date: v })} testId="gm-date" />
              </div>
              <div>
                <label className={labelCls}>Vrsta servisa *</label>
                <ManagedSelect category="service_type" value={form.service_type} onChange={(v) => setForm({ ...form, service_type: v })} placeholder="Izaberite ili dodajte..." testId="gm-type" />
              </div>
            </div>
            <div>
              <label className={labelCls}>Opis</label>
              <input className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <div>
                <label className={`${labelCls} whitespace-nowrap`}>Delovi / materijal</label>
                <div className="flex gap-1.5 mt-1">
                  <input
                    data-testid="gm-cost"
                    type="number"
                    className="w-full bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    value={form.cost}
                    onChange={(e) => setForm({ ...form, cost: e.target.value })}
                    placeholder="0"
                  />
                  <select
                    data-testid="gm-cost-currency"
                    value={form.cost_currency || "RSD"}
                    onChange={(e) => setForm({ ...form, cost_currency: e.target.value })}
                    className="bg-[#1A2438] border border-[#23314A] rounded-lg px-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500 font-semibold"
                  >
                    <option value="RSD">RSD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={`${labelCls} whitespace-nowrap`}>Rad (cena)</label>
                <div className="flex gap-1.5 mt-1">
                  <input
                    data-testid="gm-mechanic-cost"
                    type="number"
                    className="w-full bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    value={form.mechanic_cost}
                    onChange={(e) => setForm({ ...form, mechanic_cost: e.target.value })}
                    placeholder="0"
                  />
                  <select
                    data-testid="gm-mechanic-cost-currency"
                    value={form.mechanic_cost_currency || form.cost_currency || "EUR"}
                    onChange={(e) => setForm({ ...form, mechanic_cost_currency: e.target.value })}
                    className="bg-[#1A2438] border border-[#23314A] rounded-lg px-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500 font-semibold"
                  >
                    <option value="EUR">EUR</option>
                    <option value="RSD">RSD</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="bg-[#0B0F17] border border-[#23314A] rounded-lg px-3 py-2 text-xs flex items-center justify-between text-slate-400">
              <span>Ukupan trošak servisa:</span>
              <span className="font-mono text-sm font-semibold text-slate-100">
                {form.cost_currency === (form.mechanic_cost_currency || form.cost_currency)
                  ? `${((Number(form.cost) || 0) + (Number(form.mechanic_cost) || 0)).toLocaleString("de-DE")} ${form.cost_currency}`
                  : `${Number(form.cost) > 0 ? `${Number(form.cost).toLocaleString("de-DE")} ${form.cost_currency}` : ""}${Number(form.cost) > 0 && Number(form.mechanic_cost) > 0 ? " + " : ""}${Number(form.mechanic_cost) > 0 ? `${Number(form.mechanic_cost).toLocaleString("de-DE")} ${form.mechanic_cost_currency}` : ""}`.trim() || `0 ${form.cost_currency}`}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Kilometraža</label>
                <input type="number" className={inputCls} value={form.odometer} onChange={(e) => setForm({ ...form, odometer: e.target.value })} placeholder="km" />
              </div>
              <div>
                <label className={labelCls}>Mehaničar / Servis</label>
                <input className={inputCls} value={form.mechanic} onChange={(e) => setForm({ ...form, mechanic: e.target.value })} placeholder="ime ili naziv servisa" />
              </div>
            </div>
            <div>
              <label className={labelCls}>Priloži račun (slika ili PDF)</label>
              <input type="file" accept="image/*,application/pdf" data-testid="gm-receipt" onChange={(e) => setReceipt(e.target.files?.[0] || null)} className="mt-1 w-full text-sm text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:text-sm hover:file:bg-blue-700" />
              {editing && <p className="text-xs text-slate-500 mt-1">Dodavanjem novog fajla prilažete još jedan račun uz ovaj servis.</p>}
            </div>
            <DialogFooter>
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:bg-[#1C283F]">
                Otkaži
              </button>
              <button data-testid="gm-submit" type="submit" className="px-4 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold">
                Sačuvaj
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!laborModal} onOpenChange={(o) => { if (!o) setLaborModal(null); }}>
        <DialogContent className="bg-[#131C2E] border-[#23314A] text-slate-100 max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-head flex items-center gap-2">
              <Wrench className="h-5 w-5 text-blue-400" />
              Brzi unos rada
            </DialogTitle>
          </DialogHeader>
          {laborModal?.item && (
            <form onSubmit={saveQuickLabor} className="space-y-3">
              <div className="text-xs text-slate-400 bg-[#0B0F17] p-2.5 rounded-lg border border-[#23314A] space-y-1">
                <div><span className="text-slate-500">Vozilo:</span> <b className="text-slate-200">{plateById[laborModal.item.vehicle_id] || "—"}</b></div>
                <div><span className="text-slate-500">Servis:</span> {laborModal.item.service_type} ({fmtDate(laborModal.item.date)})</div>
                <div>
                  <span className="text-slate-500">Delovi/materijal:</span>{" "}
                  {Number(laborModal.item.cost) > 0
                    ? `${Number(laborModal.item.cost).toLocaleString("de-DE")} ${laborModal.item.cost_currency || "RSD"}`
                    : "0 RSD"}
                </div>
              </div>
              <div>
                <label className={labelCls}>Cena rada *</label>
                <div className="flex gap-1.5 mt-1">
                  <input
                    type="number"
                    autoFocus
                    className="w-full bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    value={laborModal.mechanic_cost}
                    onChange={(e) => setLaborModal({ ...laborModal, mechanic_cost: e.target.value })}
                    placeholder="0"
                    data-testid="quick-mechanic-cost-input"
                  />
                  <select
                    value={laborModal.cost_currency || "EUR"}
                    onChange={(e) => setLaborModal({ ...laborModal, cost_currency: e.target.value })}
                    className="bg-[#1A2438] border border-[#23314A] rounded-lg px-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500 font-semibold"
                    data-testid="quick-mechanic-currency-select"
                  >
                    <option value="EUR">EUR</option>
                    <option value="RSD">RSD</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>Mehaničar / Servis</label>
                <input
                  className={inputCls}
                  value={laborModal.mechanic}
                  onChange={(e) => setLaborModal({ ...laborModal, mechanic: e.target.value })}
                  placeholder="Ime majstora ili servis"
                  data-testid="quick-mechanic-name-input"
                />
              </div>
              <div className="bg-[#0B0F17] border border-[#23314A] rounded-lg px-3 py-2 text-xs flex items-center justify-between text-slate-400">
                <span>Novi ukupan trošak:</span>
                <span className="font-mono text-sm font-semibold text-emerald-400">
                  {((laborModal.item.cost_currency || "RSD") === (laborModal.cost_currency || "EUR"))
                    ? `${((Number(laborModal.item.cost) || 0) + (Number(laborModal.mechanic_cost) || 0)).toLocaleString("de-DE")} ${laborModal.cost_currency || "EUR"}`
                    : `${Number(laborModal.item.cost) > 0 ? `${Number(laborModal.item.cost).toLocaleString("de-DE")} ${laborModal.item.cost_currency || "RSD"} + ` : ""}${Number(laborModal.mechanic_cost) || 0} ${laborModal.cost_currency || "EUR"}`}
                </span>
              </div>
              <DialogFooter className="mt-4">
                <button type="button" onClick={() => setLaborModal(null)} className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:bg-[#1C283F]">
                  Otkaži
                </button>
                <button disabled={savingLabor} type="submit" className="px-4 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50">
                  {savingLabor ? "Čuvanje..." : "Sačuvaj rad"}
                </button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewM} onOpenChange={(o) => { if (!o) setViewM(null); }}>
        <DialogContent className="bg-[#131C2E] border-[#23314A] text-slate-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-head">Priloženi računi</DialogTitle>
          </DialogHeader>
          <div className="space-y-2" data-testid="receipts-list">
            {(viewM?.receipts || []).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2 text-sm hover:border-blue-500" data-testid={`receipt-item-${r.id}`}>
                <a href={`${API}/maintenance/${viewM.id}/receipt?rid=${r.id}&auth=${localStorage.getItem("token") || ""}&as_pdf=1`} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 flex-1 min-w-0">
                  <span className="truncate text-slate-200">{r.filename || "Račun"}</span>
                  <span className="text-emerald-400 text-xs font-semibold shrink-0">Otvori / štampaj</span>
                </a>
                <button onClick={() => delReceipt(r.id)} className="text-rose-400 hover:text-rose-300 shrink-0" title="Obriši račun" data-testid={`receipt-delete-${r.id}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {(viewM?.receipts || []).length === 0 && <p className="text-sm text-slate-500">Nema priloženih računa.</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
