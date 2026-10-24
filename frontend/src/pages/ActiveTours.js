import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";
import { toast } from "sonner";
import { MapPinned, Save, ChevronDown, ChevronRight, User, Loader2, AlertTriangle, Lock, Eye } from "lucide-react";

const fmtDT = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("sr-RS") + " " + d.toLocaleTimeString("sr-RS", { hour: "2-digit", minute: "2-digit" });
};
const byLbl = (b) => (b === "driver" ? "Vozač" : "Admin");
const paidLbl = { advance: "Akontacija", own: "Svoj novac" };

export default function ActiveTours() {
  const { money: eur } = useCurrency();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState(null);
  const navigate = useNavigate();

  const load = () =>
    api
      .get("/settlements")
      .then((r) => setList((r.data || []).filter((s) => (s.status || "razduzeno") === "otvorena")))
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const settle = async (s) => {
    if (!window.confirm(`Razdužiti turu „${s.trip_label || s.driver_name || "tura"}"?\n\nVozač je nakon toga više neće moći da uređuje.`)) return;
    setBusy(s.id);
    try {
      await api.put(`/settlements/${s.id}`, { status: "razduzeno" });
      toast.success("Tura razdužena");
      load();
    } catch {
      toast.error("Greška pri razduženju");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-4 sm:p-8 space-y-5" data-testid="active-tours-page">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
          <MapPinned className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-head text-2xl font-bold">Aktivne ture</h1>
          <p className="text-sm text-slate-400">Otvorene ture koje vozač trenutno vozi. Uredi ih ili razduži kada vozač stigne.</p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Učitavanje...</p>
      ) : list.length === 0 ? (
        <div className="bg-[#131C2E] border border-[#23314A] rounded-xl p-8 text-center text-slate-500 text-sm">
          Nema aktivnih tura. Dodeli turu vozaču u „Obračun vozača".
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((s) => {
            const driverExp = (s.expenses || []).filter((e) => e.by === "driver");
            const advEntries = s.advance_entries || [];
            const driverInputs = driverExp.length + advEntries.length;
            const isOpen = openId === s.id;
            return (
              <div key={s.id} className="bg-[#131C2E] border border-[#23314A] rounded-xl overflow-hidden" data-testid={`active-tour-${s.id}`}>
                <div className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-head font-semibold text-slate-100">{s.trip_label || s.vehicle_plate || "Tura"}</span>
                        <span className="inline-flex items-center bg-blue-500/15 text-blue-300 text-[11px] font-semibold rounded-full px-2 py-0.5">Otvorena</span>
                        {driverInputs > 0 && (
                          <span className="inline-flex items-center gap-1 bg-blue-500/15 text-blue-300 text-[11px] font-semibold rounded-full px-2 py-0.5" data-testid={`active-inputs-${s.id}`}>
                            <User className="h-3 w-3" /> {driverInputs}
                          </span>
                        )}
                        {s.alerts && s.alerts.length > 0 && (
                          <span title={s.alerts.map((a) => a.message).join("\n")}>
                            <AlertTriangle className="h-4 w-4 text-amber-400" />
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{s.driver_name || "—"} · {s.date}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate("/obracun", { state: { editId: s.id } })}
                        data-testid={`active-show-${s.id}`}
                        className="inline-flex items-center gap-1.5 bg-[#1A2438] hover:bg-[#23314A] border border-[#23314A] text-slate-200 rounded-lg px-3 py-2 text-sm transition-colors"
                      >
                        <Eye className="h-4 w-4" /> Prikaži turu
                      </button>
                      <button
                        onClick={() => settle(s)}
                        disabled={busy === s.id}
                        data-testid={`active-settle-${s.id}`}
                        className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold rounded-lg px-3 py-2 text-sm transition-colors"
                      >
                        {busy === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Razduži turu
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
                    <div><div className="text-[11px] text-slate-500">Isplata vozaču</div><div className="font-mono font-semibold text-slate-100">{eur(s.driver_pay)}</div></div>
                    <div><div className="text-[11px] text-slate-500">Akontacija</div><div className="font-mono font-semibold text-slate-100">{eur(s.cash_advance)}</div></div>
                    <div><div className="text-[11px] text-slate-500">Keš troškovi</div><div className="font-mono font-semibold text-slate-100">{eur(s.calc?.total_expenses)}</div></div>
                    <div><div className="text-[11px] text-slate-500">Za isplatu</div><div className={`font-mono font-semibold ${(s.calc?.final_due ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`}>{(s.calc?.final_due ?? 0) >= 0 ? eur(s.calc?.payout) : "vraća " + eur(s.calc?.driver_returns)}</div></div>
                  </div>

                  <button
                    onClick={() => setOpenId(isOpen ? null : s.id)}
                    data-testid={`active-toggle-${s.id}`}
                    className="mt-3 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200"
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    {isOpen ? "Sakrij detalje" : "Prikaži detalje ture"}
                  </button>
                </div>

                {isOpen && (
                  <div className="bg-[#0B0F17] border-t border-[#23314A] p-4 sm:p-5" data-testid={`active-detail-${s.id}`}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Keš troškovi ({(s.expenses || []).length})</div>
                        {(s.expenses || []).length === 0 ? (
                          <p className="text-sm text-slate-500">Nema troškova.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {(s.expenses || []).map((e, i) => (
                              <div key={i} className="flex items-start justify-between gap-3 text-sm bg-[#131C2E] border border-[#23314A] rounded-lg px-3 py-2">
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
                                <div className="font-mono font-semibold text-slate-100 shrink-0">{eur(e.amount)}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Akontacije — unosi ({advEntries.length})</div>
                        {advEntries.length === 0 ? (
                          <p className="text-sm text-slate-500">Nema unosa akontacije.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {advEntries.map((a, i) => (
                              <div key={i} className="flex items-start justify-between gap-3 text-sm bg-[#131C2E] border border-[#23314A] rounded-lg px-3 py-2">
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
                            <div key={i} className="flex items-center justify-between gap-3 text-sm bg-[#131C2E] border border-amber-500/20 rounded-lg px-3 py-2">
                              <span className="text-slate-200 truncate">{e.category || "Trošak"}</span>
                              <span className="font-mono font-semibold text-amber-300 shrink-0">{eur(e.amount)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
