import { useEffect, useRef, useState } from "react";
import { useCurrency } from "@/context/CurrencyContext";
import { useParams, useNavigate } from "react-router-dom";
import api, { API, fmtDate, rsd, DOC_META } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import VehicleForm from "@/components/VehicleForm";
import { DateField } from "@/components/DateField";
import { ManagedSelect } from "@/components/ManagedSelect";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Plus,
  Wrench,
  ShieldCheck,
  FileCheck,
  Calendar,
  Shield,
  Printer,
  Download,
  Upload,
  ExternalLink,
  Loader2,
  FileText,
  ImageIcon,
  Droplet,
  Gauge,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const DOC_ICON = {
  tech_6m: FileCheck,
  registration_12m: Calendar,
  cmr_insurance: Shield,
  kasko_insurance: ShieldCheck,
  white_card: FileText,
  tachograph: Gauge,
};

const emptyM = { date: "", service_type: "", description: "", cost: "", cost_currency: "RSD", odometer: "", mechanic: "", status: "Završeno" };

export default function VehicleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null);
  const [maint, setMaint] = useState([]);
  const { money, rate } = useCurrency();
  const maintEur = (m) => (m.cost_currency === "EUR" ? Number(m.cost) || 0 : (Number(m.cost) || 0) / (rate || 117));
  const [editOpen, setEditOpen] = useState(false);
  const [mOpen, setMOpen] = useState(false);
  const [mForm, setMForm] = useState(emptyM);
  const [mReceipt, setMReceipt] = useState(null);
  const [viewM, setViewM] = useState(null);
  const [mEditId, setMEditId] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dlWord, setDlWord] = useState(false);
  const [category, setCategory] = useState("saobracajna");
  const fileInputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [serviceStatus, setServiceStatus] = useState(null);
  const [odoInput, setOdoInput] = useState("");
  const [savingOdo, setSavingOdo] = useState(false);
  const [intervalInput, setIntervalInput] = useState("");
  const [antiInput, setAntiInput] = useState("");
  const [dlOil, setDlOil] = useState(false);
  const [annualCosts, setAnnualCosts] = useState([]);
  const [acName, setAcName] = useState("");
  const [acAmount, setAcAmount] = useState("");

  const addAnnualCost = async () => {
    if (!acName.trim()) return toast.error("Naziv troška je obavezan");
    try {
      const { data } = await api.post(`/vehicles/${id}/annual-costs`, { name: acName.trim(), amount: Number(acAmount) || 0 });
      setAnnualCosts((a) => [...a, data]);
      setAcName("");
      setAcAmount("");
      toast.success("Godišnji trošak dodat");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Greška pri dodavanju");
    }
  };

  const delAnnualCost = async (itemId) => {
    try {
      await api.delete(`/vehicles/${id}/annual-costs/${itemId}`);
      setAnnualCosts((a) => a.filter((x) => x.id !== itemId));
      toast.success("Trošak obrisan");
    } catch {
      toast.error("Greška pri brisanju");
    }
  };


  const saveInterval = async () => {
    const body = {};
    if (intervalInput) body.oil_interval_km = Number(intervalInput);
    if (antiInput) body.antifreeze_every = Number(antiInput);
    if (!body.oil_interval_km && !body.antifreeze_every) return;
    try {
      await api.post(`/vehicles/${id}/oil-interval`, body);
      toast.success("Interval sačuvan");
      setIntervalInput("");
      setAntiInput("");
      api.get(`/vehicles/${id}/service-status`).then((r) => setServiceStatus(r.data)).catch(() => {});
      api.get(`/vehicles/${id}`).then((r) => setVehicle(r.data)).catch(() => {});
    } catch (e) {
      toast.error("Greška pri čuvanju");
    }
  };

  const exportOilWord = async () => {
    setDlOil(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/vehicles/${id}/oil-report/word`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("fail");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zamene_ulja_${(vehicle?.plate || "").replace(/\s/g, "_")}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Word preuzet");
    } catch (e) {
      toast.error("Greška pri izvozu");
    } finally {
      setDlOil(false);
    }
  };

  const printOilHistory = () => {
    const changes = maint
      .filter((m) => /ulj|antifriz/i.test(`${m.service_type || ""} ${m.description || ""}`))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const rows = changes
      .map((m) => {
        const isAnti = /antifriz/i.test(`${m.service_type || ""} ${m.description || ""}`);
        return `<tr><td>${fmtDate(m.date)}</td><td>${isAnti ? "Antifriz" : "Ulje"}</td><td>${m.service_type || ""}</td><td>${m.odometer || ""}</td><td style="text-align:right">${rsd(m.cost)}</td></tr>`;
      })
      .join("");
    const w = window.open("", "_blank");
    w.document.write(`<!doctype html><html lang="sr"><head><meta charset="utf-8"><title>Zamene ulja ${vehicle.plate}</title>
      <style>body{font-family:Arial,sans-serif;color:#111;padding:32px}h1{font-size:20px;margin:0 0 2px}.sub{font-weight:bold}.meta{color:#555;font-size:13px;margin:6px 0}table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}th,td{border:1px solid #999;padding:6px 8px;text-align:left}th{background:#eee}</style></head><body>
      <h1>Istorija zamena ulja i antifriza</h1><div class="sub">APR MENSUR DULJEVIĆ</div><div style="font-size:12px;color:#555;margin-top:2px">PIB: 114365454 · MB: 67518896</div>
      <div class="meta">Vozilo: <b>${vehicle.plate}</b> · ${vehicle.make || ""} ${vehicle.model || ""}<br/>
      Interval zamene ulja: ${serviceStatus?.interval || ""} km · Antifriz na svaku ${serviceStatus?.antifreeze_every || 2}. zamenu · Datum: ${new Date().toLocaleDateString("sr-RS", { day: "2-digit", month: "2-digit", year: "2-digit" })}</div>
      <table><tr><th>Datum</th><th>Tip</th><th>Vrsta servisa</th><th>Km</th><th style="text-align:right">Trošak</th></tr>${rows || '<tr><td colspan="5">Nema zapisa</td></tr>'}</table>
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };

  const saveOdometer = async () => {
    if (!odoInput) return;
    setSavingOdo(true);
    try {
      await api.post(`/vehicles/${id}/odometer`, { odometer: Number(odoInput) });
      toast.success("Kilometraža sačuvana");
      setOdoInput("");
      api.get(`/vehicles/${id}/service-status`).then((r) => setServiceStatus(r.data)).catch(() => {});
    } catch (e) {
      toast.error("Greška pri čuvanju");
    } finally {
      setSavingOdo(false);
    }
  };

  const load = () => {
    api.get(`/vehicles/${id}`).then((r) => setVehicle(r.data)).catch(() => {});
    api.get(`/maintenance?vehicle_id=${id}`).then((r) => setMaint(r.data)).catch(() => {});
    api.get(`/vehicles/${id}/documents`).then((r) => setDocuments(r.data)).catch(() => {});
    api.get(`/vehicles/${id}/service-status`).then((r) => setServiceStatus(r.data)).catch(() => {});
    api.get(`/vehicles/${id}/annual-costs`).then((r) => setAnnualCosts(r.data)).catch(() => {});
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const delReceipt = async (rid) => {
    if (!viewM) return;
    if (!window.confirm("Da li ste sigurni da želite da obrišete ovaj račun?")) return;
    try {
      const { data } = await api.delete(`/maintenance/${viewM.id}/receipt/${rid}`);
      const rec = data.receipts || [];
      setViewM((v) => (v ? { ...v, receipts: rec } : v));
      setMaint((prev) => prev.map((m) => (m.id === viewM.id ? { ...m, receipts: rec } : m)));
      toast.success("Račun obrisan");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Greška pri brisanju računa");
    }
  };

  const uploadDoc = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", category);
      await api.post(`/vehicles/${id}/documents`, fd);
      toast.success("Dokument otpremljen");
      api.get(`/vehicles/${id}/documents`).then((r) => setDocuments(r.data)).catch(() => {});
    } catch (err) {
      toast.error(err.response?.data?.detail || "Greška pri otpremanju");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const delDoc = async (docId) => {
    await api.delete(`/documents/${docId}`);
    toast.success("Dokument obrisan");
    setDocuments((d) => d.filter((x) => x.id !== docId));
  };

  const openDoc = async (doc) => {
    try {
      const res = await api.get(`/documents/${doc.id}/download`, { responseType: "blob" });
      const url = window.URL.createObjectURL(res.data);
      setPreview({ doc, url });
    } catch (e) {
      toast.error("Greška pri otvaranju");
    }
  };

  const closePreview = () => {
    if (preview?.url) window.URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  const downloadDoc = async (doc) => {
    try {
      const token = localStorage.getItem("token");
      const isImg = !(doc.content_type || "").includes("pdf");
      const qs = isImg ? "?as_pdf=1" : "?download=1";
      const res = await fetch(`${API}/documents/${doc.id}/download${qs}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("fail");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const base = (doc.original_filename || "dokument").replace(/\.[^.]+$/, "");
      const a = document.createElement("a");
      a.href = url;
      a.download = isImg ? base + ".pdf" : (doc.original_filename || "dokument");
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Preuzeto");
    } catch (e) {
      toast.error("Greška pri preuzimanju");
    }
  };

  const exportVehicleWord = async () => {
    setDlWord(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/reports/word/${id}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("fail");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vozilo_${(vehicle?.plate || "").replace(/\s/g, "_")}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Word dokument preuzet");
    } catch (e) {
      toast.error("Greška pri izvozu");
    } finally {
      setDlWord(false);
    }
  };

  const printHistory = () => {
    const rows = maint
      .map(
        (m) =>
          `<tr><td>${fmtDate(m.date)}</td><td>${m.service_type || ""}</td><td>${m.description || ""}</td><td>${m.odometer || ""}</td><td>${m.mechanic || ""}</td><td style="text-align:right">${rsd(m.cost)}</td></tr>`
      )
      .join("");
    const docRows = Object.keys(DOC_META)
      .map((k) => {
        const info = vehicle[k] || {};
        return `<tr><td>${DOC_META[k].label}</td><td>${fmtDate(info.expiry)}</td></tr>`;
      })
      .join("");
    const total = maint.reduce((s, m) => s + (Number(m.cost) || 0), 0);
    const w = window.open("", "_blank");
    w.document.write(`<!doctype html><html lang="sr"><head><meta charset="utf-8"><title>Karton vozila ${vehicle.plate}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:32px;}
        h1{margin:0 0 2px;font-size:22px;} h2{font-size:15px;margin:24px 0 8px;border-bottom:2px solid #111;padding-bottom:4px;}
        .sub{color:#444;font-weight:bold;} .meta{color:#555;font-size:13px;margin-top:6px;}
        table{width:100%;border-collapse:collapse;font-size:13px;margin-top:6px;}
        th,td{border:1px solid #999;padding:6px 8px;text-align:left;}
        th{background:#eee;} .tot{text-align:right;font-weight:bold;margin-top:10px;}
      </style></head><body>
      <h1>Karton vozila i istorija održavanja</h1>
      <div class="sub">APR MENSUR DULJEVIĆ</div>
      <div style="font-size:12px;color:#555;margin-top:2px">PIB: 114365454 · MB: 67518896</div>
      <div class="meta">Vozilo: <b>${vehicle.plate}</b> · ${vehicle.make || ""} ${vehicle.model || ""} ${vehicle.year ? "· " + vehicle.year : ""}<br/>
      Tip: ${vehicle.vehicle_type || ""} · VIN: ${vehicle.vin || "-"} · Datum: ${new Date().toLocaleDateString("sr-RS", { day: "2-digit", month: "2-digit", year: "2-digit" })}</div>
      <h2>Status dokumentacije</h2>
      <table><tr><th>Dokument</th><th>Datum isteka</th></tr>${docRows}</table>
      <h2>Istorija održavanja</h2>
      <table><tr><th>Datum</th><th>Vrsta servisa</th><th>Opis</th><th>Km</th><th>Mehaničar</th><th style="text-align:right">Trošak</th></tr>${rows || '<tr><td colspan="6">Nema zapisa</td></tr>'}</table>
      <div class="tot">Ukupni troškovi održavanja: ${rsd(total)}</div>
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };


  const update = async (payload) => {
    await api.put(`/vehicles/${id}`, payload);
    toast.success("Vozilo izmenjeno");
    setEditOpen(false);
    load();
  };

  const remove = async () => {
    if (!window.confirm("Obrisati ovo vozilo i svu evidenciju održavanja?")) return;
    await api.delete(`/vehicles/${id}`);
    toast.success("Vozilo obrisano");
    navigate("/vozila");
  };

  const addMaint = async (e) => {
    e.preventDefault();
    const body = {
      vehicle_id: id,
      date: mForm.date,
      service_type: mForm.service_type,
      description: mForm.description,
      cost: Number(mForm.cost) || 0,
      cost_currency: mForm.cost_currency || "RSD",
      odometer: mForm.odometer ? Number(mForm.odometer) : null,
      mechanic: mForm.mechanic,
      status: mForm.status,
    };
    let mid = mEditId;
    try {
      if (mEditId) {
        await api.put(`/maintenance/${mEditId}`, body);
      } else {
        const r = await api.post("/maintenance", body);
        mid = r.data.id;
      }
    } catch {
      return toast.error("Greška pri čuvanju servisa");
    }
    let uploadFailed = false;
    if (mReceipt && mid) {
      const fd = new FormData();
      fd.append("file", mReceipt);
      try {
        await api.post(`/maintenance/${mid}/receipt`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      } catch {
        uploadFailed = true;
      }
    }
    if (uploadFailed) toast.error("Servis sačuvan, ali otpremanje računa nije uspelo");
    else toast.success(mEditId ? "Servis izmenjen" : "Servis dodat");
    setMOpen(false);
    setMForm(emptyM);
    setMReceipt(null);
    setMEditId(null);
    load();
  };

  const openEditMaint = (m) => {
    setMEditId(m.id);
    setMForm({
      date: m.date || "",
      service_type: m.service_type || "",
      description: m.description || "",
      cost: m.cost ?? "",
      odometer: m.odometer ?? "",
      mechanic: m.mechanic || "",
      status: m.status || "Završeno",
    });
    setMOpen(true);
  };

  const delMaint = async (mid) => {
    await api.delete(`/maintenance/${mid}`);
    toast.success("Zapis obrisan");
    load();
  };

  if (!vehicle) return <div className="p-8 text-slate-400">Učitavanje...</div>;

  const totalCost = maint.reduce((s, m) => s + maintEur(m), 0);
  const isTrailer = /prikolic/i.test(vehicle.vehicle_type || "");
  const inputCls =
    "w-full mt-1 bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors";
  const labelCls = "text-xs uppercase tracking-wider text-slate-400 font-semibold";

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-fade-up">
      <button
        onClick={() => navigate("/vozila")}
        className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-100"
        data-testid="back-button"
      >
        <ArrowLeft className="h-4 w-4" /> Nazad na vozila
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-head text-3xl font-bold font-mono">{vehicle.plate}</h1>
            <span className="text-[10px] uppercase tracking-wider text-slate-400 bg-[#1A2438] px-2 py-1 rounded">
              {vehicle.vehicle_type}
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            {vehicle.make} {vehicle.model} {vehicle.year ? `· ${vehicle.year}` : ""}
            {vehicle.vin ? ` · VIN: ${vehicle.vin}` : ""}
          </p>
          {vehicle.driver_name && (
            <p className="text-sm text-blue-300 mt-1" data-testid="vehicle-driver-name">
              <span className="text-slate-500">Vozač:</span> {vehicle.driver_name}
            </p>
          )}
          {vehicle.trailer_plate && (
            <p className="text-sm text-emerald-300 mt-1" data-testid="vehicle-trailer-plate">
              <span className="text-slate-500">Prikolica:</span> <span className="font-mono">{vehicle.trailer_plate}</span>
            </p>
          )}
          {vehicle.tractor_plate && (
            <p className="text-sm text-amber-300 mt-1" data-testid="vehicle-tractor-plate">
              <span className="text-slate-500">Tegljač:</span> <span className="font-mono">{vehicle.tractor_plate}</span>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            data-testid="edit-vehicle-button"
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-2 bg-[#131C2E] border border-[#23314A] hover:border-blue-500/40 rounded-lg px-4 py-2 text-sm transition-colors"
          >
            <Pencil className="h-4 w-4" /> Izmeni
          </button>
          <button
            data-testid="delete-vehicle-button"
            onClick={remove}
            className="inline-flex items-center gap-2 bg-red-950/40 border border-red-500/30 text-red-300 hover:bg-red-950/70 rounded-lg px-4 py-2 text-sm transition-colors"
          >
            <Trash2 className="h-4 w-4" /> Obriši
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {Object.keys(DOC_META).map((key) => {
          const Icon = DOC_ICON[key];
          const info = vehicle[key] || {};
          return (
            <div
              key={key}
              data-testid={`doc-card-${key}`}
              className="bg-[#131C2E] border border-[#23314A] rounded-xl p-5 shadow-lg shadow-black/20"
            >
              <div className="flex items-center justify-between">
                <Icon className="h-5 w-5 text-blue-400" />
                <StatusBadge status={info.status} testId={`doc-expiry-badge-${key}`} />
              </div>
              <div className="mt-4 text-sm font-semibold text-slate-200">{DOC_META[key].short}</div>
              <div className="text-xs text-slate-500">{DOC_META[key].label}</div>
              <div className="mt-3 font-mono text-lg">{fmtDate(info.expiry)}</div>
            </div>
          );
        })}
      </div>

      {!isTrailer && serviceStatus && (
        <div className="bg-[#131C2E] border border-[#23314A] rounded-xl p-5 shadow-lg shadow-black/20" data-testid="service-reminders">
          <div className="flex items-center gap-2 mb-4">
            <Droplet className="h-4 w-4 text-amber-400" />
            <h2 className="font-head text-lg font-semibold">Servisni podsetnici</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Interval zamene ulja</div>
              <div className="font-mono text-lg mt-1">{serviceStatus.interval.toLocaleString("de-DE")} km</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Sledeća zamena ulja na</div>
              <div className="font-mono text-lg mt-1" data-testid="next-oil-km">
                {serviceStatus.next_oil_odometer != null ? serviceStatus.next_oil_odometer.toLocaleString("de-DE") + " km" : "—"}
              </div>
              {serviceStatus.remaining_km != null && (
                <div className={`text-xs mt-1 ${serviceStatus.remaining_km <= 0 ? "text-red-400" : serviceStatus.remaining_km <= 1000 ? "text-amber-400" : "text-slate-500"}`}>
                  {serviceStatus.remaining_km <= 0
                    ? "Prekoračeno za " + Math.abs(serviceStatus.remaining_km).toLocaleString("de-DE") + " km"
                    : "Još " + serviceStatus.remaining_km.toLocaleString("de-DE") + " km"}
                </div>
              )}
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Zamena antifriza</div>
              <div className="mt-1" data-testid="antifreeze-note">
                {serviceStatus.antifreeze_due_next ? (
                  <span className="text-amber-300 font-semibold">Uz sledeću zamenu ulja (br. {serviceStatus.next_change_number})</span>
                ) : (
                  <span className="text-slate-400">Nije na sledećoj zameni</span>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-[#23314A] flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Trenutna kilometraža</label>
              <div className="font-mono text-sm mt-1 text-slate-300">
                {serviceStatus.current_odometer != null ? serviceStatus.current_odometer.toLocaleString("de-DE") + " km" : "nije uneta"}
              </div>
            </div>
            <input
              data-testid="odometer-input"
              type="number"
              value={odoInput}
              onChange={(e) => setOdoInput(e.target.value)}
              placeholder="nova km vrednost"
              className="bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 w-40"
            />
            <button
              data-testid="save-odometer-button"
              onClick={saveOdometer}
              disabled={savingOdo}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-lg px-3 py-2 text-sm transition-colors"
            >
              {savingOdo ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Sačuvaj km
            </button>
            <div className="w-full sm:w-auto flex items-end gap-2">
              <div>
                <label className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Interval ulja (km)</label>
                <input data-testid="interval-input" type="number" value={intervalInput} onChange={(e) => setIntervalInput(e.target.value)} placeholder={String(serviceStatus.interval)} className="mt-1 bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 w-32" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Antifriz svaka</label>
                <input data-testid="antifreeze-every-input" type="number" min="1" value={antiInput} onChange={(e) => setAntiInput(e.target.value)} placeholder={String(serviceStatus.antifreeze_every)} className="mt-1 bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 w-24" />
              </div>
              <button data-testid="save-interval-button" onClick={saveInterval} className="inline-flex items-center gap-2 bg-[#1A2438] border border-[#23314A] hover:border-blue-500/40 rounded-lg px-3 py-2 text-sm transition-colors">
                Sačuvaj interval
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-3">
            Do sada zamena ulja: {serviceStatus.oil_change_count}. Antifriz se menja na svaku {serviceStatus.antifreeze_every}. zamenu ulja.
          </p>
        </div>
      )}

      <div className="bg-[#131C2E] border border-[#23314A] rounded-xl p-5 shadow-lg shadow-black/20" data-testid="annual-costs-card">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0"><ShieldCheck className="h-5 w-5" /></div>
          <div>
            <h2 className="font-head text-lg font-semibold">Godišnji troškovi vozila (unos u RSD)</h2>
            <p className="text-sm text-slate-400">Kasko, registracija i sl. Sistem ih srazmerno deli na mesečni nivo i uračunava u obračun zarade kamiona.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2 mb-4">
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Naziv troška</label>
            <input value={acName} onChange={(e) => setAcName(e.target.value)} data-testid="annual-cost-name" placeholder="npr. Kasko osiguranje" className="mt-1 w-full bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Godišnji iznos (RSD)</label>
            <input type="number" min="0" step="0.01" value={acAmount} onChange={(e) => setAcAmount(e.target.value)} data-testid="annual-cost-amount" placeholder="0" className="mt-1 w-36 bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <button onClick={addAnnualCost} data-testid="annual-cost-add" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-3 py-2 text-sm">
            <Plus className="h-4 w-4" /> Dodaj
          </button>
        </div>
        {annualCosts.length === 0 ? (
          <p className="text-sm text-slate-500">Nema unetih godišnjih troškova.</p>
        ) : (
          <div className="space-y-2">
            {annualCosts.map((c) => (
              <div key={c.id} data-testid={`annual-cost-${c.id}`} className="flex items-center justify-between bg-[#0B0F17] border border-[#23314A] rounded-lg px-4 py-2.5">
                <div className="text-sm">
                  <span className="font-semibold text-slate-100">{c.name}</span>
                  <span className="text-slate-500"> · {money(Number(c.amount) / (rate || 117))} / god</span>
                  <span className="text-slate-500"> · ≈ {money(Number(c.amount) / 12 / (rate || 117))} / mes</span>
                </div>
                <button onClick={() => delAnnualCost(c.id)} data-testid={`annual-cost-delete-${c.id}`} className="text-slate-500 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}
      </div>


      {!isTrailer && serviceStatus && (
        <div className="bg-[#131C2E] border border-[#23314A] rounded-xl p-5 shadow-lg shadow-black/20" data-testid="change-history">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Droplet className="h-4 w-4 text-blue-400" />
              <h2 className="font-head text-lg font-semibold">Istorija zamena (ulje i antifriz)</h2>
            </div>
            <div className="flex gap-2">
              <button data-testid="print-oil-history-button" onClick={printOilHistory} className="inline-flex items-center gap-2 bg-[#1A2438] border border-[#23314A] hover:border-blue-500/40 rounded-lg px-3 py-2 text-sm transition-colors">
                <Printer className="h-4 w-4" /> Štampaj
              </button>
              <button data-testid="export-oil-word-button" onClick={exportOilWord} disabled={dlOil} className="inline-flex items-center gap-2 bg-[#1A2438] border border-[#23314A] hover:border-blue-500/40 rounded-lg px-3 py-2 text-sm transition-colors">
                {dlOil ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Word
              </button>
            </div>
          </div>
          {(() => {
            const changes = maint
              .filter((m) => /ulj|antifriz/i.test(`${m.service_type || ""} ${m.description || ""}`))
              .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
            if (changes.length === 0)
              return <p className="text-sm text-slate-400 py-2">Još nema zabeleženih zamena ulja ni antifriza.</p>;
            return (
              <div className="space-y-2">
                {changes.map((m) => {
                  const isAnti = /antifriz/i.test(`${m.service_type || ""} ${m.description || ""}`);
                  return (
                    <div key={m.id} className="flex items-center justify-between text-sm border-b border-[#23314A]/60 pb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${isAnti ? "bg-cyan-500/15 text-cyan-300" : "bg-amber-500/15 text-amber-300"}`}>
                          {isAnti ? "Antifriz" : "Ulje"}
                        </span>
                        <span className="text-slate-300">{m.service_type}</span>
                      </div>
                      <div className="flex items-center gap-4 text-slate-400 font-mono text-xs">
                        <span>{fmtDate(m.date)}</span>
                        <span>{m.odometer ? m.odometer.toLocaleString("de-DE") + " km" : "—"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      <div className="bg-[#131C2E] border border-[#23314A] rounded-xl overflow-hidden shadow-lg shadow-black/20">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#23314A]">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-400" />
            <h2 className="font-head text-lg font-semibold">Skenirana dokumenta</h2>
          </div>
          <div className="flex items-center gap-2">
            <select
              data-testid="doc-category-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="saobracajna">Saobraćajna dozvola</option>
              <option value="registracija">Registracija</option>
              <option value="cmr">CMR polisa</option>
              <option value="kasko">Kasko polisa</option>
              <option value="bela_potvrda">Bela potvrda</option>
              <option value="tehnicki">Tehnički pregled</option>
              <option value="ostalo">Ostalo</option>
            </select>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={uploadDoc}
              data-testid="doc-file-input"
            />
            <button
              data-testid="upload-document-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-lg px-3 py-2 text-sm transition-colors"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Otpremi
            </button>
          </div>
        </div>
        {documents.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            Nema otpremljenih dokumenata. Otpremite slike saobraćajne ili polise osiguranja (slike i PDF).
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-5">
            {documents.map((d) => {
              const isPdf = (d.content_type || "").includes("pdf");
              return (
                <div key={d.id} data-testid={`document-item-${d.id}`} className="flex items-center gap-3 bg-[#0B0F17] border border-[#23314A] rounded-lg p-3">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${isPdf ? "bg-red-500/10 text-red-400" : "bg-blue-500/10 text-blue-400"}`}>
                    {isPdf ? <FileText className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{d.original_filename}</div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">{d.category}</div>
                  </div>
                  <button onClick={() => downloadDoc(d)} className="text-slate-400 hover:text-emerald-300" title="Preuzmi (PDF)" data-testid={`download-doc-${d.id}`}>
                    <Download className="h-4 w-4" />
                  </button>
                  <button onClick={() => openDoc(d)} className="text-slate-400 hover:text-blue-300" title="Otvori" data-testid={`open-doc-${d.id}`}>
                    <ExternalLink className="h-4 w-4" />
                  </button>
                  <button onClick={() => delDoc(d.id)} className="text-slate-500 hover:text-red-400" title="Obriši" data-testid={`del-doc-${d.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-[#131C2E] border border-[#23314A] rounded-xl overflow-hidden shadow-lg shadow-black/20">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-[#23314A]">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-emerald-400" />
            <h2 className="font-head text-lg font-semibold">Evidencija održavanja</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-400 mr-1">
              Ukupno: <span className="font-mono font-semibold text-slate-100">{money(totalCost)}</span>
            </span>
            <button
              data-testid="print-history-button"
              onClick={printHistory}
              className="inline-flex items-center gap-2 bg-[#1A2438] border border-[#23314A] hover:border-blue-500/40 rounded-lg px-3 py-2 text-sm transition-colors"
            >
              <Printer className="h-4 w-4" /> Štampaj
            </button>
            <button
              data-testid="export-vehicle-word-button"
              onClick={exportVehicleWord}
              disabled={dlWord}
              className="inline-flex items-center gap-2 bg-[#1A2438] border border-[#23314A] hover:border-blue-500/40 rounded-lg px-3 py-2 text-sm transition-colors"
            >
              {dlWord ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Word
            </button>
            <button
              data-testid="add-maintenance-button"
              onClick={() => { setMEditId(null); setMForm(emptyM); setMOpen(true); }}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-3 py-2 text-sm transition-colors"
            >
              <Plus className="h-4 w-4" /> Dodaj servis
            </button>
          </div>
        </div>

        {maint.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            Još uvek nema zapisa o održavanju.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-[#23314A]">
                  <th className="px-5 py-3">Datum</th>
                  <th className="px-5 py-3">Vrsta servisa</th>
                  <th className="px-5 py-3">Opis</th>
                  <th className="px-5 py-3">Km</th>
                  <th className="px-5 py-3">Trošak</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {maint.map((m) => (
                  <tr key={m.id} className="border-b border-[#23314A]/60 hover:bg-[#1C283F]/40">
                    <td className="px-5 py-3 font-mono">{fmtDate(m.date)}</td>
                    <td className="px-5 py-3 text-slate-200">{m.service_type}</td>
                    <td className="px-5 py-3 text-slate-400">{m.description}</td>
                    <td className="px-5 py-3 font-mono text-slate-400">{m.odometer || "—"}</td>
                    <td className="px-5 py-3 font-mono">{money(maintEur(m))}</td>
                    <td className="px-5 py-3 text-right">
                      {(m.receipts || []).length > 0 && (
                        <button
                          onClick={() => setViewM(m)}
                          className="text-emerald-400 hover:text-emerald-300 mr-3 text-xs font-semibold"
                          title="Priloženi računi"
                          data-testid={`receipts-btn-${m.id}`}
                        >
                          Priloženi računi ({m.receipts.length})
                        </button>
                      )}
                      <button
                        onClick={() => openEditMaint(m)}
                        className="text-slate-500 hover:text-blue-300 mr-2"
                        data-testid={`edit-maintenance-${m.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => delMaint(m.id)}
                        className="text-slate-500 hover:text-red-400"
                        data-testid={`delete-maintenance-${m.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => !o && closePreview()}>
        <DialogContent className="bg-[#131C2E] border-[#23314A] text-slate-100 max-w-3xl max-h-[92vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="font-head truncate pr-8" data-testid="preview-title">
              {preview?.doc?.original_filename}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2" data-testid="document-preview">
            {preview &&
              ((preview.doc.content_type || "").includes("pdf") ? (
                <iframe title="pregled" src={preview.url} className="w-full h-[72vh] rounded-lg bg-white" />
              ) : (
                <img
                  src={preview.url}
                  alt={preview.doc.original_filename}
                  className="w-full max-h-[72vh] object-contain rounded-lg bg-black/30"
                />
              ))}
          </div>
        </DialogContent>
      </Dialog>

      {editOpen && (
        <VehicleForm open={editOpen} onOpenChange={setEditOpen} onSubmit={update} initial={vehicle} />
      )}

      <Dialog open={mOpen} onOpenChange={(o) => { setMOpen(o); if (!o) { setMForm(emptyM); setMEditId(null); setMReceipt(null); } }}>
        <DialogContent className="bg-[#131C2E] border-[#23314A] text-slate-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-head">{mEditId ? "Izmena servisa" : "Novi servis"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={addMaint} className="space-y-3" data-testid="maintenance-form">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Datum *</label>
                <DateField value={mForm.date} onChange={(v) => setMForm({ ...mForm, date: v })} testId="maintenance-date-input" />
              </div>
              <div>
                <label className={labelCls}>Vrsta servisa *</label>
                <ManagedSelect
                  category="service_type"
                  value={mForm.service_type}
                  onChange={(v) => setMForm({ ...mForm, service_type: v })}
                  placeholder="Izaberite ili dodajte..."
                  testId="maintenance-type-input"
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Opis</label>
              <input
                className={inputCls}
                value={mForm.description}
                onChange={(e) => setMForm({ ...mForm, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Trošak</label>
                <div className="flex gap-2">
                  <input
                    data-testid="maintenance-cost-input"
                    type="number"
                    className={inputCls}
                    value={mForm.cost}
                    onChange={(e) => setMForm({ ...mForm, cost: e.target.value })}
                  />
                  <select
                    data-testid="maintenance-cost-currency"
                    value={mForm.cost_currency || "RSD"}
                    onChange={(e) => setMForm({ ...mForm, cost_currency: e.target.value })}
                    className="mt-1 bg-[#1A2438] border border-[#23314A] rounded-lg px-2 text-sm text-slate-100"
                  >
                    <option value="RSD">RSD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>Kilometraža</label>
                <input
                  type="number"
                  className={inputCls}
                  value={mForm.odometer}
                  onChange={(e) => setMForm({ ...mForm, odometer: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>Mehaničar</label>
                <input
                  className={inputCls}
                  value={mForm.mechanic}
                  onChange={(e) => setMForm({ ...mForm, mechanic: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Račun (slika ili PDF)</label>
              <input
                type="file"
                accept="image/*,application/pdf"
                data-testid="maintenance-receipt-input"
                onChange={(e) => setMReceipt(e.target.files?.[0] || null)}
                className="mt-1 w-full text-sm text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:text-sm hover:file:bg-blue-700"
              />
              {mEditId && !mReceipt && (
                <p className="text-xs text-slate-500 mt-1">Ostavite prazno da zadržite postojeći račun.</p>
              )}
            </div>
            <DialogFooter>
              <button
                type="button"
                onClick={() => setMOpen(false)}
                className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:bg-[#1C283F]"
              >
                Otkaži
              </button>
              <button
                data-testid="maintenance-form-submit"
                type="submit"
                className="px-4 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              >
                Sačuvaj
              </button>
            </DialogFooter>
          </form>
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
                <a href={`${process.env.REACT_APP_BACKEND_URL}/api/maintenance/${viewM.id}/receipt?rid=${r.id}&auth=${localStorage.getItem("token")}&as_pdf=1`} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 flex-1 min-w-0">
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
