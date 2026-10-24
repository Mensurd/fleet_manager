import { useEffect, useState } from "react";
import api, { API, fmtDate, rsd, DOC_META } from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";
import StatusBadge from "@/components/StatusBadge";
import { Printer, Download, FileText, Loader2, BellRing, Send, FileSpreadsheet, Calculator, Truck, Trophy } from "lucide-react";
import { toast } from "sonner";

export default function Reports() {
  const [vehicles, setVehicles] = useState([]);
  const [maint, setMaint] = useState([]);
  const [dl, setDl] = useState(false);
  const [dlx, setDlx] = useState(false);
  const [dlp, setDlp] = useState(false);
  const [reminder, setReminder] = useState(null);
  const [sending, setSending] = useState(false);

  // Driver earnings summary
  const [sdrivers, setSdrivers] = useState([]);
  const [sMode, setSMode] = useState("month");
  const [sMonth, setSMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [sYear, setSYear] = useState(() => String(new Date().getFullYear()));
  const [sStart, setSStart] = useState(() => new Date().toISOString().slice(0, 7));
  const [sEnd, setSEnd] = useState(() => new Date().toISOString().slice(0, 7));
  const [sDriver, setSDriver] = useState("");
  const [summary, setSummary] = useState(null);
  const [tMode, setTMode] = useState("month");
  const [tMonth, setTMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [tYear, setTYear] = useState(() => String(new Date().getFullYear()));
  const [tStart, setTStart] = useState(() => new Date().toISOString().slice(0, 7));
  const [tEnd, setTEnd] = useState(() => new Date().toISOString().slice(0, 7));
  const [truck, setTruck] = useState(null);
  const [tVehicle, setTVehicle] = useState("");

  const { money: eur, rate } = useCurrency();
  const maintEur = (m) => (m.cost_currency === "EUR" ? Number(m.cost) || 0 : (Number(m.cost) || 0) / (rate || 117));

  const sRange =
    sMode === "month"
      ? { start: sMonth, end: sMonth }
      : sMode === "year"
      ? { start: `${sYear}-01`, end: `${sYear}-12` }
      : { start: sStart, end: sEnd };

  const tRange =
    tMode === "month"
      ? { start: tMonth, end: tMonth }
      : tMode === "year"
      ? { start: `${tYear}-01`, end: `${tYear}-12` }
      : { start: tStart, end: tEnd };

  useEffect(() => {
    api.get("/vehicles").then((r) => setVehicles(r.data)).catch(() => {});
    api.get("/maintenance").then((r) => setMaint(r.data)).catch(() => {});
    api.get("/reminders/preview").then((r) => setReminder(r.data)).catch(() => {});
    api.get("/drivers").then((r) => setSdrivers(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!sRange.start || !sRange.end) return;
    api
      .get("/settlements/summary", {
        params: { start: sRange.start, end: sRange.end, driver_id: sDriver || undefined },
      })
      .then((r) => setSummary(r.data))
      .catch(() => setSummary(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sRange.start, sRange.end, sDriver]);

  useEffect(() => {
    if (!tRange.start || !tRange.end) return;
    api.get("/reports/truck-earnings", { params: { start: tRange.start, end: tRange.end, vehicle_id: tVehicle || undefined } })
      .then((r) => setTruck(r.data)).catch(() => setTruck(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tRange.start, tRange.end, tVehicle]);

  const sendReminder = async () => {
    setSending(true);
    try {
      const { data } = await api.post("/reminders/send-now");
      if (data.sent) toast.success(`Podsetnik poslat (${data.count} dokumenata)`);
      else toast.info(data.message || "Nema dokumenata za podsetnik");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Greška pri slanju");
    } finally {
      setSending(false);
    }
  };

  const exportPdf = async () => {
    setDlp(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/reports/pdf`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("fail");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `izvestaj_vozni_park_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("PDF izveštaj preuzet");
    } catch (e) {
      toast.error("Greška pri izvozu");
    } finally {
      setDlp(false);
    }
  };

  const exportExcel = async () => {
    setDlx(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/reports/excel`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("fail");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vozni_park_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Excel izveštaj preuzet");
    } catch (e) {
      toast.error("Greška pri izvozu");
    } finally {
      setDlx(false);
    }
  };

  const plateById = Object.fromEntries(vehicles.map((v) => [v.id, v.plate]));
  const totalCostEur = maint.reduce((s, m) => s + maintEur(m), 0);

  const today = new Date().toLocaleDateString("sr-RS", { day: "2-digit", month: "2-digit", year: "2-digit" });

  const exportWord = async () => {
    setDl(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/reports/word`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("fail");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `izvestaj_vozni_park_${new Date().toISOString().slice(0, 10)}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Word izveštaj preuzet");
    } catch (e) {
      toast.error("Greška pri izvozu");
    } finally {
      setDl(false);
    }
  };

  const downloadSummary = async (fmt) => {
    try {
      const token = localStorage.getItem("token");
      const qs = new URLSearchParams({ start: sRange.start, end: sRange.end });
      if (sDriver) qs.append("driver_id", sDriver);
      const res = await fetch(`${API}/settlements/summary/${fmt}?${qs.toString()}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("fail");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zbirni_obracun_${sRange.start}_${sRange.end}.${fmt === "word" ? "docx" : "pdf"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(fmt === "word" ? "Word preuzet" : "PDF preuzet");
    } catch (e) {
      toast.error("Greška pri izvozu");
    }
  };

  const printSummary = () => {
    if (!summary) return;
    const dname = sDriver && summary.rows[0] ? ` · ${summary.rows[0].driver_name}` : "";
    const t = summary.totals || {};
    const head = sDriver
      ? `<tr><th>Datum</th><th>Krug / ruta</th><th style="text-align:right">Dnevnice</th><th style="text-align:right">Ukupna zarada</th><th style="text-align:right">Isplaćeno</th><th style="text-align:right">Vraćeno</th></tr>`
      : `<tr><th>Vozač</th><th style="text-align:right">Krugova</th><th style="text-align:right">Dnevnice</th><th style="text-align:right">Ukupna zarada</th><th style="text-align:right">Isplaćeno</th><th style="text-align:right">Vraćeno</th></tr>`;
    const body = sDriver
      ? (summary.trips || [])
          .map(
            (tr) =>
              `<tr><td>${fmtDate(tr.date)}</td><td>${tr.trip_label || "-"}</td><td style="text-align:right">${eur(tr.waiting)}</td><td style="text-align:right">${eur(tr.earnings)}</td><td style="text-align:right">${eur(tr.payout)}</td><td style="text-align:right">${eur(tr.returns)}</td></tr>`
          )
          .join("")
      : (summary.rows || [])
          .map(
            (r) =>
              `<tr><td>${r.driver_name}</td><td style="text-align:right">${r.count}</td><td style="text-align:right">${eur(r.waiting)}</td><td style="text-align:right">${eur(r.earnings)}</td><td style="text-align:right">${eur(r.payout)}</td><td style="text-align:right">${eur(r.returns)}</td></tr>`
          )
          .join("");
    const tfoot = sDriver
      ? `<tr><td colspan="2">UKUPNO (${t.count || 0} krug.)</td><td style="text-align:right">${eur(t.waiting)}</td><td style="text-align:right">${eur(t.earnings)}</td><td style="text-align:right">${eur(t.payout)}</td><td style="text-align:right">${eur(t.returns)}</td></tr>`
      : `<tr><td>UKUPNO</td><td style="text-align:right">${t.count || 0}</td><td style="text-align:right">${eur(t.waiting)}</td><td style="text-align:right">${eur(t.earnings)}</td><td style="text-align:right">${eur(t.payout)}</td><td style="text-align:right">${eur(t.returns)}</td></tr>`;
    const w = window.open("", "_blank");
    w.document.write(`<!doctype html><html lang="sr"><head><meta charset="utf-8"><title>Zbirni izveštaj</title>
      <style>body{font-family:Arial,sans-serif;color:#111;padding:28px}h1{font-size:18px;margin:0}.sub{font-size:12px;color:#555;margin:4px 0 14px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #999;padding:6px 8px;text-align:left}th{background:#1e293b;color:#fff}tfoot td{font-weight:bold;background:#dbeafe}</style></head><body>
      <h1>Zbirni izveštaj obračuna vozača — ${summary.period_label || ""}${dname}</h1>
      <div class="sub">APR MENSUR DULJEVIĆ · PIB: 114365454 · MB: 67518896</div>
      <table><thead>${head}</thead><tbody>${body || '<tr><td colspan="6">Nema obračuna za izabrani period</td></tr>'}</tbody><tfoot>${tfoot}</tfoot></table>
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };

  const downloadTruck = async (fmt) => {
    try {
      const token = localStorage.getItem("token");
      const qs = new URLSearchParams({ start: tRange.start, end: tRange.end });
      if (tVehicle) qs.set("vehicle_id", tVehicle);
      const res = await fetch(`${API}/reports/truck-earnings/${fmt}?${qs.toString()}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("fail");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zarada_kamiona_${tRange.start}_${tRange.end}.${fmt === "word" ? "docx" : "pdf"}`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(fmt === "word" ? "Word preuzet" : "PDF preuzet");
    } catch { toast.error("Greška pri izvozu"); }
  };

  const printTruck = () => {
    if (!truck) return;
    const body = (truck.rows || []).map((r) => `<tr><td>${r.vehicle_plate}</td><td style="text-align:right">${eur(r.revenue)}</td><td style="text-align:right">${eur(r.driver_cost)}</td><td style="text-align:right">${eur(r.trip_expenses)}</td><td style="text-align:right">${eur(r.maintenance)}</td><td style="text-align:right">${eur(r.annual_costs)}</td><td style="text-align:right">${eur(r.total_cost)}</td><td style="text-align:right">${eur(r.profit)}</td></tr>`).join("") || '<tr><td colspan="8">Nema podataka</td></tr>';
    const t = truck.totals || {};
    const sv = truck.selected_vehicle;
    const vehHtml = sv ? `<div class="sub" style="color:#111;font-weight:bold">Vozilo: ${sv.plate || ""}${sv.make ? " · " + sv.make : ""}${sv.model ? " " + sv.model : ""}${sv.vehicle_type ? " · " + sv.vehicle_type : ""}${sv.year ? " · " + sv.year : ""}${sv.vin ? " · VIN " + sv.vin : ""}${sv.current_odometer ? " · " + sv.current_odometer + " km" : ""}</div>` : "";
    const ovRow = truck.show_overhead ? `<tr><td colspan="6">Opšti troškovi firme</td><td style="text-align:right">${eur(truck.overhead)}</td><td style="text-align:right">−${eur(truck.overhead)}</td></tr>` : "";
    const w = window.open("", "_blank");
    w.document.write(`<!doctype html><html lang="sr"><head><meta charset="utf-8"><title>Zarada kamiona</title><style>body{font-family:Arial,sans-serif;color:#111;padding:28px}h1{font-size:18px;margin:0}.sub{font-size:12px;color:#555;margin:4px 0 14px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #999;padding:5px 7px;text-align:left}th{background:#1e293b;color:#fff}tfoot td{font-weight:bold;background:#dbeafe}tfoot tr.net td{background:#bbf7d0}</style></head><body><h1>Zarada kamiona — ${truck.period_label || ""}</h1><div class="sub">APR MENSUR DULJEVIĆ · PIB: 114365454 · MB: 67518896</div>${vehHtml}<table><thead><tr><th>Vozilo</th><th style="text-align:right">Prihod</th><th style="text-align:right">Trošak vozača</th><th style="text-align:right">Putni troškovi</th><th style="text-align:right">Održavanje</th><th style="text-align:right">Godišnji fiksni</th><th style="text-align:right">Ukupno trošak</th><th style="text-align:right">Profit</th></tr></thead><tbody>${body}</tbody><tfoot><tr><td>UKUPNO</td><td style="text-align:right">${eur(t.revenue)}</td><td style="text-align:right">${eur(t.driver_cost)}</td><td style="text-align:right">${eur(t.trip_expenses)}</td><td style="text-align:right">${eur(t.maintenance)}</td><td style="text-align:right">${eur(t.annual_costs)}</td><td style="text-align:right">${eur(t.total_cost)}</td><td style="text-align:right">${eur(t.profit)}</td></tr>${ovRow}<tr class="net"><td colspan="7">NETO PROFIT</td><td style="text-align:right">${eur(truck.net_profit)}</td></tr></tfoot></table></body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <div>
          <h1 className="font-head text-3xl font-bold tracking-tight">Izveštaji i štampa</h1>
          <p className="text-sm text-slate-400 mt-1">
            Zvanični pregled voznog parka — APR MENSUR DULJEVIĆ
          </p>
        </div>
        <div className="flex gap-2">
          <button
            data-testid="print-report-button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 bg-[#131C2E] border border-[#23314A] hover:border-blue-500/40 rounded-lg px-4 py-2.5 text-sm transition-colors"
          >
            <Printer className="h-4 w-4" /> Štampa
          </button>
          <button
            data-testid="export-word-report-button"
            onClick={exportWord}
            disabled={dl}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
          >
            {dl ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Izvoz u Word
          </button>
          <button
            data-testid="export-pdf-report-button"
            onClick={exportPdf}
            disabled={dlp}
            className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
          >
            {dlp ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Izvoz u PDF
          </button>
          <button
            data-testid="export-excel-report-button"
            onClick={exportExcel}
            disabled={dlx}
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
          >
            {dlx ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Izvoz u Excel
          </button>
        </div>
      </div>

      <div className="no-print bg-[#131C2E] border border-[#23314A] rounded-xl p-5 shadow-lg shadow-black/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
              <BellRing className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-head text-lg font-semibold">Email podsetnici</h2>
              <p className="text-sm text-slate-400">
                Automatski svakog dana (30, 15 i 7 dana pre isteka). Primaoci:{" "}
                <span className="text-slate-200">{(reminder?.recipients || []).join(", ") || "—"}</span>
              </p>
              <p className="text-xs text-slate-500 mt-1" data-testid="reminder-due-count">
                Dokumentacija: {reminder?.count ?? 0} (30/15/7 dana) · Servis ulje/antifriz: {reminder?.service_count ?? 0} · Kočnice (6 mes.): {reminder?.brake_count ?? 0}.
              </p>
            </div>
          </div>
          <button
            data-testid="send-reminder-now-button"
            onClick={sendReminder}
            disabled={sending}
            className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Pošalji podsetnik sada
          </button>
        </div>
      </div>

      {/* DRIVER EARNINGS SUMMARY */}
      <div className="no-print bg-[#131C2E] border border-[#23314A] rounded-xl p-5 shadow-lg shadow-black/20" data-testid="driver-summary-section">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-10 w-10 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
            <Calculator className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-head text-lg font-semibold">Obračun i zarada vozača</h2>
            <p className="text-sm text-slate-400">Zbirni pregled po vozaču — mesec, opseg meseci ili cela godina.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Vozač</label>
            <select
              value={sDriver}
              onChange={(e) => setSDriver(e.target.value)}
              data-testid="summary-driver-filter"
              className="bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2 text-sm text-slate-100"
            >
              <option value="">Svi vozači</option>
              {sdrivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.first_name} {d.last_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Period</label>
            <div className="flex rounded-lg overflow-hidden border border-[#23314A]">
              {[["month", "Mesec"], ["range", "Opseg meseci"], ["year", "Godina"]].map(([m, lbl]) => (
                <button
                  key={m}
                  onClick={() => setSMode(m)}
                  data-testid={`summary-mode-${m}`}
                  className={`text-sm px-3 py-2 transition-colors ${sMode === m ? "bg-blue-600 text-white" : "bg-[#1A2438] text-slate-400"}`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>
          {sMode === "month" && (
            <div>
              <label className="text-xs text-slate-400 block mb-1">Mesec</label>
              <input type="month" value={sMonth} onChange={(e) => setSMonth(e.target.value)} data-testid="summary-month"
                className="bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2 text-sm text-slate-100" />
            </div>
          )}
          {sMode === "year" && (
            <div>
              <label className="text-xs text-slate-400 block mb-1">Godina</label>
              <input type="number" min="2000" max="2100" value={sYear} onChange={(e) => setSYear(e.target.value)} data-testid="summary-year"
                className="w-28 bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2 text-sm text-slate-100" />
            </div>
          )}
          {sMode === "range" && (
            <>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Od (mesec)</label>
                <input type="month" value={sStart} onChange={(e) => setSStart(e.target.value)} data-testid="summary-start"
                  className="bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2 text-sm text-slate-100" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Do (mesec)</label>
                <input type="month" value={sEnd} onChange={(e) => setSEnd(e.target.value)} data-testid="summary-end"
                  className="bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2 text-sm text-slate-100" />
              </div>
            </>
          )}
          <div className="flex gap-2 ml-auto">
            <button onClick={printSummary} data-testid="summary-print-btn" className="inline-flex items-center gap-1.5 bg-[#1A2438] hover:bg-[#23314A] border border-[#23314A] rounded-lg px-3 py-2 text-sm transition-colors">
              <Printer className="h-4 w-4" /> Štampaj
            </button>
            <button onClick={() => downloadSummary("word")} data-testid="summary-word-btn" className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-2 text-sm transition-colors">
              <Download className="h-4 w-4" /> Word
            </button>
            <button onClick={() => downloadSummary("pdf")} data-testid="summary-pdf-btn" className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg px-3 py-2 text-sm transition-colors">
              <FileText className="h-4 w-4" /> PDF
            </button>
          </div>
        </div>

        <div className="text-xs text-slate-500 mb-2" data-testid="summary-period-label">
          Period: {summary?.period_label || "—"}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-[#23314A] rounded-lg overflow-hidden">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-400 bg-[#0B0F17]">
                {sDriver ? (
                  <>
                    <th className="px-3 py-2.5">Datum</th>
                    <th className="px-3 py-2.5">Krug / ruta</th>
                  </>
                ) : (
                  <th className="px-3 py-2.5">Vozač</th>
                )}
                {!sDriver && <th className="px-3 py-2.5 text-right">Krugova</th>}
                <th className="px-3 py-2.5 text-right">Dnevnice</th>
                <th className="px-3 py-2.5 text-right">Ukupna zarada</th>
                <th className="px-3 py-2.5 text-right">Isplaćeno</th>
                <th className="px-3 py-2.5 text-right">Vraćeno</th>
              </tr>
            </thead>
            <tbody>
              {sDriver
                ? (summary?.trips || []).map((tr, i) => (
                    <tr key={i} className="border-t border-[#23314A]/60" data-testid={`summary-trip-${i}`}>
                      <td className="px-3 py-2.5 font-mono">{fmtDate(tr.date)}</td>
                      <td className="px-3 py-2.5 text-slate-300">{tr.trip_label || "—"}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{eur(tr.waiting)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{eur(tr.earnings)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-emerald-400">{eur(tr.payout)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-red-400">{eur(tr.returns)}</td>
                    </tr>
                  ))
                : (summary?.rows || []).map((r, i) => (
                    <tr key={i} className="border-t border-[#23314A]/60" data-testid={`summary-row-${i}`}>
                      <td className="px-3 py-2.5 text-slate-200">{r.driver_name}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{r.count}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{eur(r.waiting)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{eur(r.earnings)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-emerald-400">{eur(r.payout)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-red-400">{eur(r.returns)}</td>
                    </tr>
                  ))}
              {(!summary || (sDriver ? summary.trips.length === 0 : summary.rows.length === 0)) && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    Nema obračuna za izabrani period.
                  </td>
                </tr>
              )}
            </tbody>
            {summary && (sDriver ? summary.trips.length > 0 : summary.rows.length > 0) && (
              <tfoot>
                <tr className="border-t border-[#23314A] font-semibold bg-[#1A2438]/40" data-testid="summary-totals">
                  <td className="px-3 py-2.5" colSpan={sDriver ? 2 : 1}>
                    UKUPNO{sDriver ? ` (${summary.totals.count} krug.)` : ""}
                  </td>
                  {!sDriver && <td className="px-3 py-2.5 text-right font-mono">{summary.totals.count}</td>}
                  <td className="px-3 py-2.5 text-right font-mono">{eur(summary.totals.waiting)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{eur(summary.totals.earnings)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-400">{eur(summary.totals.payout)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-red-400">{eur(summary.totals.returns)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* TRUCK EARNINGS */}
      <div className="no-print bg-[#131C2E] border border-[#23314A] rounded-xl p-5 shadow-lg shadow-black/20" data-testid="truck-earnings-section">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0"><Truck className="h-5 w-5" /></div>
          <div>
            <h2 className="font-head text-lg font-semibold">Zarada kamiona (profit)</h2>
            <p className="text-sm text-slate-400">Prihod minus svi troškovi (vozač, putni troškovi, održavanje) po vozilu.</p>
            {truck?.selected_vehicle && (
              <div className="mt-1 text-xs text-emerald-300" data-testid="truck-selected-vehicle">
                Prikaz za vozilo: <span className="font-semibold">{truck.selected_vehicle.plate}</span>
                {truck.selected_vehicle.make ? ` · ${truck.selected_vehicle.make} ${truck.selected_vehicle.model || ""}` : ""}
                {truck.selected_vehicle.vehicle_type ? ` · ${truck.selected_vehicle.vehicle_type}` : ""}
                {truck.selected_vehicle.year ? ` · ${truck.selected_vehicle.year}` : ""}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Period</label>
            <div className="flex rounded-lg overflow-hidden border border-[#23314A]">
              {[["month", "Mesec"], ["range", "Opseg meseci"], ["year", "Godina"]].map(([m, lbl]) => (
                <button key={m} onClick={() => setTMode(m)} data-testid={`truck-mode-${m}`} className={`text-sm px-3 py-2 transition-colors ${tMode === m ? "bg-emerald-600 text-white" : "bg-[#1A2438] text-slate-400"}`}>{lbl}</button>
              ))}
            </div>
          </div>
          {tMode === "month" && (<div><label className="text-xs text-slate-400 block mb-1">Mesec</label><input type="month" value={tMonth} onChange={(e) => setTMonth(e.target.value)} data-testid="truck-month" className="bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2 text-sm text-slate-100" /></div>)}
          {tMode === "year" && (<div><label className="text-xs text-slate-400 block mb-1">Godina</label><input type="number" min="2000" max="2100" value={tYear} onChange={(e) => setTYear(e.target.value)} data-testid="truck-year" className="w-28 bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2 text-sm text-slate-100" /></div>)}
          {tMode === "range" && (<><div><label className="text-xs text-slate-400 block mb-1">Od</label><input type="month" value={tStart} onChange={(e) => setTStart(e.target.value)} data-testid="truck-start" className="bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2 text-sm text-slate-100" /></div><div><label className="text-xs text-slate-400 block mb-1">Do</label><input type="month" value={tEnd} onChange={(e) => setTEnd(e.target.value)} data-testid="truck-end" className="bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2 text-sm text-slate-100" /></div></>)}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Vozilo</label>
            <select value={tVehicle} onChange={(e) => setTVehicle(e.target.value)} data-testid="truck-vehicle-filter" className="bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2 text-sm text-slate-100 min-w-[160px]">
              <option value="">Sva vozila</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.plate}{v.make ? ` · ${v.make}` : ""}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 ml-auto">
            <button onClick={printTruck} data-testid="truck-print-btn" className="inline-flex items-center gap-1.5 bg-[#1A2438] hover:bg-[#23314A] border border-[#23314A] rounded-lg px-3 py-2 text-sm"><Printer className="h-4 w-4" /> Štampaj</button>
            <button onClick={() => downloadTruck("word")} data-testid="truck-word-btn" className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-2 text-sm"><Download className="h-4 w-4" /> Word</button>
            <button onClick={() => downloadTruck("pdf")} data-testid="truck-pdf-btn" className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg px-3 py-2 text-sm"><FileText className="h-4 w-4" /> PDF</button>
          </div>
        </div>
        <div className="text-xs text-slate-500 mb-2">Period: {truck?.period_label || "—"}</div>
        {truck?.top_vehicle && (
          <div
            data-testid="truck-top-vehicle"
            className="mb-4 bg-gradient-to-br from-emerald-600/15 to-[#131C2E] border border-emerald-500/40 rounded-xl p-4 flex items-center gap-4"
          >
            <div className="h-11 w-11 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
              <Trophy className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase tracking-wider text-emerald-400 font-semibold">Najprofitabilniji kamion</div>
              <div className="font-head text-lg font-bold text-slate-100 truncate">{truck.top_vehicle.vehicle_plate}</div>
            </div>
            <div className="text-right">
              <div className="text-slate-400 text-xs">Profit</div>
              <div className="font-mono font-bold text-emerald-400 text-lg" data-testid="truck-top-profit">{eur(truck.top_vehicle.profit)}</div>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-[#23314A] rounded-lg overflow-hidden">
            <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-400 bg-[#0B0F17]">
              <th className="px-3 py-2.5">Vozilo</th><th className="px-3 py-2.5 text-right">Prihod</th><th className="px-3 py-2.5 text-right">Trošak vozača</th><th className="px-3 py-2.5 text-right">Putni troškovi</th><th className="px-3 py-2.5 text-right">Održavanje</th><th className="px-3 py-2.5 text-right">Godišnji fiksni</th><th className="px-3 py-2.5 text-right">Ukupno trošak</th><th className="px-3 py-2.5 text-right">Profit</th>
            </tr></thead>
            <tbody>
              {(truck?.rows || []).map((r, i) => (
                <tr key={i} className={`border-t border-[#23314A]/60 ${i === 0 && r.profit > 0 ? "bg-emerald-500/5" : ""}`} data-testid={`truck-row-${i}`}>
                  <td className="px-3 py-2.5 text-slate-200">
                    {i === 0 && r.profit > 0 && <Trophy className="inline h-3.5 w-3.5 text-emerald-400 mr-1.5 -mt-0.5" />}
                    {r.vehicle_plate}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">{eur(r.revenue)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{eur(r.driver_cost)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{eur(r.trip_expenses)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{eur(r.maintenance)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{eur(r.annual_costs)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{eur(r.total_cost)}</td>
                  <td className={`px-3 py-2.5 text-right font-mono font-semibold ${r.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{eur(r.profit)}</td>
                </tr>
              ))}
              {(!truck || truck.rows.length === 0) && (<tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">Nema podataka za izabrani period.</td></tr>)}
            </tbody>
            {truck && (truck.rows.length > 0 || truck.overhead > 0) && (
              <tfoot>
                <tr className="border-t border-[#23314A] font-semibold bg-[#1A2438]/40" data-testid="truck-totals">
                  <td className="px-3 py-2.5">UKUPNO</td>
                  <td className="px-3 py-2.5 text-right font-mono">{eur(truck.totals.revenue)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{eur(truck.totals.driver_cost)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{eur(truck.totals.trip_expenses)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{eur(truck.totals.maintenance)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{eur(truck.totals.annual_costs)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{eur(truck.totals.total_cost)}</td>
                  <td className={`px-3 py-2.5 text-right font-mono ${truck.totals.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{eur(truck.totals.profit)}</td>
                </tr>
                {truck.show_overhead && (
                <tr className="border-t border-[#23314A]/60 text-slate-300" data-testid="truck-overhead">
                  <td className="px-3 py-2.5" colSpan={6}>Opšti troškovi firme (ne dele se po kamionu)</td>
                  <td className="px-3 py-2.5 text-right font-mono">{eur(truck.overhead)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-red-400">−{eur(truck.overhead)}</td>
                </tr>
                )}
                <tr className="border-t border-[#23314A] font-bold bg-emerald-500/10" data-testid="truck-net-profit">
                  <td className="px-3 py-2.5" colSpan={7}>NETO PROFIT</td>
                  <td className={`px-3 py-2.5 text-right font-mono ${truck.net_profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{eur(truck.net_profit)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="print-area bg-[#131C2E] border border-[#23314A] rounded-xl p-6 sm:p-8 shadow-lg shadow-black/20">        <div className="text-center border-b border-[#23314A] pb-5 mb-6">
          <div className="inline-flex items-center gap-2 text-blue-400 mb-2">
            <FileText className="h-6 w-6" />
          </div>
          <h2 className="font-head text-2xl font-bold">Izveštaj o voznom parku</h2>
          <p className="text-sm font-semibold mt-1">APR MENSUR DULJEVIĆ</p>
          <p className="text-xs text-slate-500">PIB: 114365454 · MB: 67518896</p>
          <p className="text-xs text-slate-500 mt-1">Datum izveštaja: {today}</p>
        </div>

        <h3 className="font-head text-lg font-semibold mb-3">Status dokumentacije vozila</h3>
        <div className="overflow-x-auto mb-8">
          <table className="w-full text-sm border border-[#23314A] rounded-lg overflow-hidden">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-400 bg-[#0B0F17]">
                <th className="px-3 py-2.5">Tablica</th>
                <th className="px-3 py-2.5">Vozilo</th>
                {Object.keys(DOC_META).map((k) => (
                  <th key={k} className="px-3 py-2.5">{DOC_META[k].short}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id} className="border-t border-[#23314A]/60">
                  <td className="px-3 py-2.5 font-mono font-semibold">{v.plate}</td>
                  <td className="px-3 py-2.5 text-slate-300">
                    {v.make} {v.model}
                  </td>
                  {Object.keys(DOC_META).map((k) => (
                    <td key={k} className="px-3 py-2.5">
                      <div className="font-mono text-xs">{fmtDate(v[k]?.expiry)}</div>
                      <StatusBadge status={v[k]?.status} />
                    </td>
                  ))}
                </tr>
              ))}
              {vehicles.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500 text-sm">
                    Nema vozila.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <h3 className="font-head text-lg font-semibold mb-3">Evidencija održavanja</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-[#23314A] rounded-lg overflow-hidden">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-400 bg-[#0B0F17]">
                <th className="px-3 py-2.5">Datum</th>
                <th className="px-3 py-2.5">Vozilo</th>
                <th className="px-3 py-2.5">Vrsta servisa</th>
                <th className="px-3 py-2.5">Opis</th>
                <th className="px-3 py-2.5">Trošak</th>
              </tr>
            </thead>
            <tbody>
              {maint.map((m) => (
                <tr key={m.id} className="border-t border-[#23314A]/60">
                  <td className="px-3 py-2.5 font-mono">{fmtDate(m.date)}</td>
                  <td className="px-3 py-2.5 font-mono">{plateById[m.vehicle_id] || "—"}</td>
                  <td className="px-3 py-2.5 text-slate-300">{m.service_type}</td>
                  <td className="px-3 py-2.5 text-slate-400">{m.description}</td>
                  <td className="px-3 py-2.5 font-mono">{eur(maintEur(m))}</td>
                </tr>
              ))}
              {maint.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500 text-sm">
                    Nema zapisa o održavanju.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="text-right mt-4 font-head font-bold">
          Ukupni troškovi održavanja: {eur(totalCostEur)}
        </div>
      </div>
    </div>
  );
}
