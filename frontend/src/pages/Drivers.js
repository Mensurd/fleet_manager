import { useEffect, useMemo, useRef, useState } from "react";
import api, { API } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import DriverForm from "@/components/DriverForm";
import { fmtDate } from "@/lib/api";
import { Plus, Search, Users, Pencil, Trash2, Phone, FileText, Upload, ExternalLink, Loader2, ImageIcon, FileSpreadsheet, Download, Printer } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const DRIVER_DOCS = {
  license: "Vozačka",
  passport: "Pasoš",
  medical: "Lekarsko",
  cod95: "CoD95",
  driver_card: "Kartica",
};

const worstStatus = (d) => {
  const order = ["expired", "expiring", "valid", "none"];
  const statuses = Object.keys(DRIVER_DOCS).map((k) => d[k]?.status || "none");
  return order.find((o) => statuses.includes(o)) || "none";
};

export default function Drivers() {
  const [drivers, setDrivers] = useState([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [docsDriver, setDocsDriver] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState("vozacka");
  const [preview, setPreview] = useState(null);
  const [dlx, setDlx] = useState(false);
  const [dlw, setDlw] = useState(false);
  const fileInputRef = useRef(null);

  const DOC_FULL = {
    license: "Vozačka dozvola",
    passport: "Pasoš",
    medical: "Lekarsko uverenje",
    cod95: "CoD95 (Kôd 95)",
    driver_card: "Kartica vozača",
  };

  const exportDriversWord = async () => {
    setDlw(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/reports/word/drivers`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("fail");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vozaci_${new Date().toISOString().slice(0, 10)}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Word vozača preuzet");
    } catch (e) {
      toast.error("Greška pri izvozu");
    } finally {
      setDlw(false);
    }
  };

  const exportDriversExcel = async () => {
    setDlx(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/reports/drivers/excel`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("fail");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vozaci_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Excel vozača preuzet");
    } catch (e) {
      toast.error("Greška pri izvozu");
    } finally {
      setDlx(false);
    }
  };

  const exportDriverWord = async (d) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/reports/word/driver/${d.id}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("fail");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vozac_${`${d.first_name}_${d.last_name}`.replace(/\s/g, "_")}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Word dokument preuzet");
    } catch (e) {
      toast.error("Greška pri izvozu");
    }
  };

  const downloadDriverDoc = async (doc) => {
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

  const printDriver = (d) => {
    const rows = Object.keys(DOC_FULL)
      .map((k) => `<tr><td>${DOC_FULL[k]}</td><td>${fmtDate(d[k]?.expiry)}</td></tr>`)
      .join("");
    const w = window.open("", "_blank");
    w.document.write(`<!doctype html><html lang="sr"><head><meta charset="utf-8"><title>Karton vozača ${d.first_name} ${d.last_name}</title>
      <style>body{font-family:Arial,sans-serif;color:#111;padding:32px}h1{font-size:20px;margin:0 0 2px}.sub{font-weight:bold}.meta{color:#555;font-size:13px;margin:6px 0}table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}th,td{border:1px solid #999;padding:6px 8px;text-align:left}th{background:#eee}</style></head><body>
      <h1>Karton vozača i dokumentacija</h1><div class="sub">APR MENSUR DULJEVIĆ</div><div style="font-size:12px;color:#555;margin-top:2px">PIB: 114365454 · MB: 67518896</div>
      <div class="meta">Vozač: <b>${d.first_name} ${d.last_name}</b><br/>Telefon: ${d.phone || "-"} · Br. lične/JMBG: ${d.id_number || "-"} · Datum: ${new Date().toLocaleDateString("sr-RS", { day: "2-digit", month: "2-digit", year: "2-digit" })}</div>
      <table><tr><th>Dokument</th><th>Datum isteka</th></tr>${rows}</table>
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };

  const openDocs = (d) => {
    setDocsDriver(d);
    api.get(`/drivers/${d.id}/documents`).then((r) => setDocuments(r.data)).catch(() => {});
  };
  const uploadDriverDoc = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", category);
      await api.post(`/drivers/${docsDriver.id}/documents`, fd);
      toast.success("Dokument otpremljen");
      api.get(`/drivers/${docsDriver.id}/documents`).then((r) => setDocuments(r.data)).catch(() => {});
    } catch (err) {
      toast.error(err.response?.data?.detail || "Greška pri otpremanju");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };
  const delDriverDoc = async (docId) => {
    await api.delete(`/documents/${docId}`);
    toast.success("Dokument obrisan");
    setDocuments((x) => x.filter((v) => v.id !== docId));
  };
  const openPreview = async (doc) => {
    try {
      const res = await api.get(`/documents/${doc.id}/download`, { responseType: "blob" });
      setPreview({ doc, url: window.URL.createObjectURL(res.data) });
    } catch (e) {
      toast.error("Greška pri otvaranju");
    }
  };
  const closePreview = () => {
    if (preview?.url) window.URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  const load = () => api.get("/drivers").then((r) => setDrivers(r.data)).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  const submit = async (payload) => {
    try {
      if (editing) await api.put(`/drivers/${editing.id}`, payload);
      else await api.post("/drivers", payload);
      toast.success(editing ? "Vozač izmenjen" : "Vozač dodat");
      setOpen(false);
      setEditing(null);
      load();
    } catch (e) {
      toast.error("Greška pri čuvanju");
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Obrisati ovog vozača?")) return;
    await api.delete(`/drivers/${id}`);
    toast.success("Vozač obrisan");
    load();
  };

  const filtered = useMemo(() => {
    return drivers.filter((d) => {
      const matchQ = !q || `${d.first_name} ${d.last_name} ${d.phone}`.toLowerCase().includes(q.toLowerCase());
      const matchF = filter === "all" || worstStatus(d) === filter;
      return matchQ && matchF;
    });
  }, [drivers, q, filter]);

  const filters = [
    { id: "all", label: "Svi" },
    { id: "expired", label: "Isteklo", testId: "driver-filter-red" },
    { id: "expiring", label: "Uskoro", testId: "driver-filter-yellow" },
    { id: "valid", label: "Važeće", testId: "driver-filter-green" },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-head text-3xl font-bold tracking-tight">Vozači</h1>
          <p className="text-sm text-slate-400 mt-1">{drivers.length} vozača · praćenje isteka dokumentacije</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <button
          data-testid="add-driver-button"
          onClick={() => { setEditing(null); setOpen(true); }}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
        >
          <Plus className="h-4 w-4" /> Novi vozač
        </button>
        <button
          data-testid="export-drivers-word-button"
          onClick={exportDriversWord}
          disabled={dlw}
          className="inline-flex items-center gap-2 bg-[#131C2E] border border-[#23314A] hover:border-blue-500/40 disabled:opacity-60 text-slate-100 font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
        >
          {dlw ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Word vozača
        </button>
        <button
          data-testid="export-drivers-excel-button"
          onClick={exportDriversExcel}
          disabled={dlx}
          className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
        >
          {dlx ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Excel vozača
        </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            data-testid="driver-list-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pretraga po imenu, telefonu..."
            className="w-full bg-[#131C2E] border border-[#23314A] rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <div className="flex gap-1.5">
          {filters.map((f) => (
            <button
              key={f.id}
              data-testid={f.testId || `driver-filter-${f.id}`}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                filter === f.id ? "bg-blue-600 text-white" : "bg-[#131C2E] border border-[#23314A] text-slate-400 hover:text-slate-100"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-[#131C2E] border border-[#23314A] rounded-xl p-12 text-center">
          <Users className="h-10 w-10 text-slate-600 mx-auto" />
          <p className="text-slate-400 mt-3 text-sm">Nema vozača za prikaz.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((d) => (
            <div
              key={d.id}
              data-testid={`driver-card-${d.id}`}
              className="bg-[#131C2E] border border-[#23314A] rounded-xl p-5 shadow-lg shadow-black/20 hover:border-blue-500/40 transition-all duration-200"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-blue-500/10 text-blue-300 flex items-center justify-center font-head font-bold">
                    {(d.first_name?.[0] || "") + (d.last_name?.[0] || "")}
                  </div>
                  <div>
                    <div className="font-semibold">{d.first_name} {d.last_name}</div>
                    {d.phone && (
                      <div className="text-xs text-slate-500 flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {d.phone}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openDocs(d)} className="text-slate-500 hover:text-blue-300" data-testid={`docs-driver-${d.id}`} title="Dokumenta">
                    <FileText className="h-4 w-4" />
                  </button>
                  <button onClick={() => printDriver(d)} className="text-slate-500 hover:text-blue-300" data-testid={`print-driver-${d.id}`} title="Štampaj">
                    <Printer className="h-4 w-4" />
                  </button>
                  <button onClick={() => exportDriverWord(d)} className="text-slate-500 hover:text-blue-300" data-testid={`word-driver-${d.id}`} title="Word">
                    <Download className="h-4 w-4" />
                  </button>
                  <button onClick={() => { setEditing(d); setOpen(true); }} className="text-slate-500 hover:text-blue-300" data-testid={`edit-driver-${d.id}`}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => remove(d.id)} className="text-slate-500 hover:text-red-400" data-testid={`delete-driver-${d.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {Object.keys(DRIVER_DOCS).map((k) => (
                  <div key={k} className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">{DRIVER_DOCS[k]}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-slate-400">{fmtDate(d[k]?.expiry)}</span>
                      <StatusBadge status={d[k]?.status} testId={`driver-${d.id}-${k}-badge`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <DriverForm
          open={open}
          onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}
          onSubmit={submit}
          initial={editing}
        />
      )}

      <Dialog open={!!docsDriver} onOpenChange={(o) => !o && setDocsDriver(null)}>
        <DialogContent className="bg-[#131C2E] border-[#23314A] text-slate-100 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-head">
              Dokumenta — {docsDriver?.first_name} {docsDriver?.last_name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 mb-3">
            <select
              data-testid="driver-doc-category-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="vozacka">Vozačka dozvola</option>
              <option value="pasos">Pasoš</option>
              <option value="lekarsko">Lekarsko uverenje</option>
              <option value="cod95">CoD95</option>
              <option value="ostalo">Ostalo</option>
            </select>
            <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={uploadDriverDoc} data-testid="driver-doc-file-input" />
            <button
              data-testid="upload-driver-document-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-lg px-3 py-2 text-sm transition-colors"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Otpremi
            </button>
          </div>
          {documents.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">Nema otpremljenih dokumenata. Otpremite skenirana dokumenta (slike i PDF).</p>
          ) : (
            <div className="space-y-2">
              {documents.map((d) => {
                const isPdf = (d.content_type || "").includes("pdf");
                return (
                  <div key={d.id} className="flex items-center gap-3 bg-[#0B0F17] border border-[#23314A] rounded-lg p-3" data-testid={`driver-document-item-${d.id}`}>
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${isPdf ? "bg-red-500/10 text-red-400" : "bg-blue-500/10 text-blue-400"}`}>
                      {isPdf ? <FileText className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{d.original_filename}</div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">{d.category}</div>
                    </div>
                    <button onClick={() => downloadDriverDoc(d)} className="text-slate-400 hover:text-emerald-300" title="Preuzmi (PDF)" data-testid={`download-driver-doc-${d.id}`}>
                      <Download className="h-4 w-4" />
                    </button>
                    <button onClick={() => openPreview(d)} className="text-slate-400 hover:text-blue-300" title="Otvori" data-testid={`open-driver-doc-${d.id}`}>
                      <ExternalLink className="h-4 w-4" />
                    </button>
                    <button onClick={() => delDriverDoc(d.id)} className="text-slate-500 hover:text-red-400" title="Obriši" data-testid={`del-driver-doc-${d.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={(o) => !o && closePreview()}>
        <DialogContent className="bg-[#131C2E] border-[#23314A] text-slate-100 max-w-3xl max-h-[92vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="font-head truncate pr-8">{preview?.doc?.original_filename}</DialogTitle>
          </DialogHeader>
          <div className="mt-2" data-testid="driver-document-preview">
            {preview &&
              ((preview.doc.content_type || "").includes("pdf") ? (
                <iframe title="pregled" src={preview.url} className="w-full h-[72vh] rounded-lg bg-white" />
              ) : (
                <img src={preview.url} alt={preview.doc.original_filename} className="w-full max-h-[72vh] object-contain rounded-lg bg-black/30" />
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
