import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { fmtDate, rsd } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import {
  Truck,
  AlertTriangle,
  Clock,
  Wrench,
  Wallet,
  ArrowRight,
  BarChart3,
  Users,
  Droplet,
  TrendingUp,
} from "lucide-react";
import { useCurrency } from "@/context/CurrencyContext";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";

const MONTHS_SR = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Avg", "Sep", "Okt", "Nov", "Dec"];

const SERVICE_CATS = [
  { name: "Gume", kw: ["gum", "vulkan", "pneumatik"], color: "#F59E0B" },
  { name: "Ulje i filteri", kw: ["ulj", "filter", "podmaz"], color: "#10B981" },
  { name: "Kočnice", kw: ["kočn", "kocn", "pločic", "plocic", "disk"], color: "#EF4444" },
  { name: "Motor i menjač", kw: ["motor", "kvačil", "kvacil", "menjač", "menjac"], color: "#8B5CF6" },
  { name: "Elektrika", kw: ["elektr", "akumulator", "sijalic", "svetl", "alternator"], color: "#3B82F6" },
  { name: "Ostalo", kw: [], color: "#64748B" },
];

const StatCard = ({ icon: Icon, label, value, tone, testId }) => {
  const tones = {
    blue: "text-blue-400 bg-blue-500/10",
    red: "text-red-400 bg-red-500/10",
    amber: "text-amber-400 bg-amber-500/10",
    emerald: "text-emerald-400 bg-emerald-500/10",
    slate: "text-slate-300 bg-slate-500/10",
  };
  return (
    <div
      data-testid={testId}
      className="bg-[#131C2E] border border-[#23314A] rounded-xl p-5 shadow-lg shadow-black/20 hover:border-blue-500/40 transition-all duration-200"
    >
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${tones[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-4 text-2xl font-head font-bold">{value}</div>
      <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mt-1">
        {label}
      </div>
    </div>
  );
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const eur = useCurrency().money;
  const [maint, setMaint] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [alerts, setAlerts] = useState({ count: 0, items: [] });
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/dashboard").then((r) => setData(r.data)).catch(() => {});
    api.get("/maintenance").then((r) => setMaint(r.data)).catch(() => {});
    api.get("/vehicles").then((r) => setVehicles(r.data)).catch(() => {});
    api.get("/alerts").then((r) => setAlerts(r.data)).catch(() => {});
  }, []);

  const monthly = (() => {
    const map = {};
    maint.forEach((m) => {
      if (!m.date) return;
      const [y, mo] = m.date.split("-");
      const key = `${y}-${mo}`;
      map[key] = (map[key] || 0) + (Number(m.cost) || 0);
    });
    return Object.keys(map)
      .sort()
      .slice(-12)
      .map((k) => {
        const [y, mo] = k.split("-");
        return { name: `${MONTHS_SR[Number(mo) - 1]} ${y.slice(2)}`, trosak: map[k] };
      });
  })();

  const byVehicle = (() => {
    const plate = Object.fromEntries(vehicles.map((v) => [v.id, v.plate]));
    const map = {};
    maint.forEach((m) => {
      const p = plate[m.vehicle_id] || "—";
      map[p] = (map[p] || 0) + (Number(m.cost) || 0);
    });
    return Object.entries(map)
      .map(([name, trosak]) => ({ name, trosak }))
      .sort((a, b) => b.trosak - a.trosak);
  })();

  const byCategory = (() => {
    const sums = {};
    SERVICE_CATS.forEach((c) => (sums[c.name] = 0));
    maint.forEach((m) => {
      const text = `${m.service_type || ""} ${m.description || ""}`.toLowerCase();
      const cat = SERVICE_CATS.find((c) => c.kw.some((k) => text.includes(k))) || SERVICE_CATS[SERVICE_CATS.length - 1];
      sums[cat.name] += Number(m.cost) || 0;
    });
    return SERVICE_CATS.map((c) => ({ name: c.name, trosak: sums[c.name], color: c.color })).filter((x) => x.trosak > 0);
  })();

  if (!data)
    return <div className="p-8 text-slate-400">Učitavanje kontrolne table...</div>;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-fade-up">
      <div>
        <h1 className="font-head text-3xl font-bold tracking-tight">Kontrolna tabla</h1>
        <p className="text-sm text-slate-400 mt-1">
          Pregled stanja voznog parka — APR MENSUR DULJEVIĆ
        </p>
      </div>

      {alerts.count > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-4" data-testid="driver-alert-banner">
          <div className="flex items-center gap-2 text-amber-300 font-semibold mb-2">
            <AlertTriangle className="h-5 w-5" /> Upozorenja o unosima vozača ({alerts.count})
          </div>
          <div className="space-y-1">
            {alerts.items.slice(0, 6).map((it) => (
              <button
                key={it.id}
                onClick={() => navigate("/obracun")}
                data-testid={`alert-item-${it.id}`}
                className="w-full text-left text-sm text-slate-300 hover:text-white flex flex-wrap gap-x-2"
              >
                <span className="text-slate-400 font-mono">{fmtDate(it.date)}</span>
                <span className="text-slate-400">· {it.driver_name || it.trip_label || "—"}:</span>
                <span>{it.alerts.map((a) => a.message).join(" · ")}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {data.month_profit && (
        <div
          data-testid="month-profit-card"
          className="bg-gradient-to-br from-emerald-600/15 to-[#131C2E] border border-emerald-500/40 rounded-xl p-5 shadow-lg shadow-black/20 flex flex-wrap items-center justify-between gap-4"
        >
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                Profit firme · {data.month_profit.period_label}
              </div>
              <div
                data-testid="month-profit-value"
                className={`font-head text-3xl font-bold mt-0.5 ${data.month_profit.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}
              >
                {eur(data.month_profit.profit)}
              </div>
            </div>
          </div>
          <div className="flex gap-6 text-sm">
            <div>
              <div className="text-slate-400 text-xs">Prihod</div>
              <div className="font-mono font-semibold text-slate-100">{eur(data.month_profit.revenue)}</div>
            </div>
            <div>
              <div className="text-slate-400 text-xs">Troškovi</div>
              <div className="font-mono font-semibold text-slate-100">{eur(data.month_profit.total_cost)}</div>
            </div>
            <div>
              <div className="text-slate-400 text-xs">Održavanje</div>
              <div className="font-mono font-semibold text-slate-100">{eur(data.month_profit.maintenance)}</div>
            </div>
            <div>
              <div className="text-slate-400 text-xs">Opšti troškovi</div>
              <div className="font-mono font-semibold text-slate-100">{eur(data.month_profit.overhead)}</div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <StatCard testId="stat-total-vehicles" icon={Truck} label="Ukupno vozila" value={data.total_vehicles} tone="blue" />
        <StatCard testId="stat-total-drivers" icon={Users} label="Ukupno vozača" value={data.total_drivers ?? 0} tone="blue" />
        <StatCard testId="stat-expired" icon={AlertTriangle} label="Istekle dokumentacije" value={data.expired_docs} tone="red" />
        <StatCard testId="stat-expiring" icon={Clock} label="Ističu uskoro" value={data.expiring_docs} tone="amber" />
        <StatCard testId="stat-services" icon={Wrench} label="Servisi" value={data.total_services} tone="emerald" />
        <StatCard testId="stat-cost" icon={Wallet} label="Troškovi održavanja" value={eur(data.total_cost)} tone="slate" />
      </div>

      <div className="bg-[#131C2E] border border-[#23314A] rounded-xl overflow-hidden shadow-lg shadow-black/20">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-[#23314A]">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <h2 className="font-head text-lg font-semibold">Upozorenja o isteku dokumentacije</h2>
        </div>

        {data.alerts.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            Nema dokumenata koji ističu u narednih 30 dana. Sve je u redu. ✅
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-[#23314A]">
                  <th className="px-5 py-3 font-semibold">Vozilo</th>
                  <th className="px-5 py-3 font-semibold">Dokument</th>
                  <th className="px-5 py-3 font-semibold">Datum isteka</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.alerts.map((a, i) => (
                  <tr
                    key={i}
                    data-testid={`alert-row-${i}`}
                    className={`border-b border-[#23314A]/60 transition-colors ${a.status === "expired" ? "bg-red-950/30 hover:bg-red-950/50" : a.status === "expiring" ? "bg-amber-950/25 hover:bg-amber-950/40" : "hover:bg-[#1C283F]/50"}`}
                  >
                    <td className="px-5 py-3">
                      <span className="font-mono font-semibold text-slate-100">{a.subject}</span>
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-slate-500 bg-[#1A2438] px-1.5 py-0.5 rounded">
                        {a.kind === "driver" ? "Vozač" : "Vozilo"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-300">{a.doc_type}</td>
                    <td className="px-5 py-3 font-mono">{fmtDate(a.expiry)}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={a.status} testId={`alert-badge-${i}`} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => navigate(a.kind === "driver" ? "/vozaci" : `/vozila/${a.id}`)}
                        className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                        data-testid={`alert-open-${i}`}
                      >
                        Otvori <ArrowRight className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data.service_alerts?.length > 0 && (
        <div className="bg-[#131C2E] border border-[#23314A] rounded-xl overflow-hidden shadow-lg shadow-black/20" data-testid="service-alerts-panel">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-[#23314A]">
            <Droplet className="h-4 w-4 text-amber-400" />
            <h2 className="font-head text-lg font-semibold">Uskoro zamena ulja / antifriza</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-[#23314A]">
                  <th className="px-5 py-3 font-semibold">Vozilo</th>
                  <th className="px-5 py-3 font-semibold">Sledeća zamena na</th>
                  <th className="px-5 py-3 font-semibold">Preostalo</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.service_alerts.map((s, i) => (
                  <tr
                    key={s.vehicle_id}
                    data-testid={`service-alert-row-${i}`}
                    className="border-b border-[#23314A]/60 hover:bg-[#1C283F]/50 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <span className="font-mono font-semibold text-slate-100">{s.plate}</span>
                      <span className="ml-2 text-slate-400 text-xs">{s.make} {s.model}</span>
                      {s.antifreeze_due && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-cyan-300 bg-cyan-500/15 px-1.5 py-0.5 rounded">+ antifriz</span>
                      )}
                    </td>
                    <td className="px-5 py-3 font-mono text-slate-300">
                      {s.next_oil_odometer != null ? s.next_oil_odometer.toLocaleString("de-DE") + " km" : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`font-mono text-xs font-semibold ${s.urgency === "overdue" ? "text-red-400" : "text-amber-400"}`}>
                        {s.remaining_km <= 0
                          ? "Prekoračeno " + Math.abs(s.remaining_km).toLocaleString("de-DE") + " km"
                          : "Još " + s.remaining_km.toLocaleString("de-DE") + " km"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => navigate(`/vozila/${s.vehicle_id}`)}
                        className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                        data-testid={`service-alert-open-${i}`}
                      >
                        Otvori <ArrowRight className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#131C2E] border border-[#23314A] rounded-xl p-5 shadow-lg shadow-black/20">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-blue-400" />
            <h2 className="font-head text-lg font-semibold">Troškovi po mesecu</h2>
          </div>
          {monthly.length === 0 ? (
            <p className="text-sm text-slate-500 py-10 text-center">Nema podataka o troškovima.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthly} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#23314A" vertical={false} />
                <XAxis dataKey="name" stroke="#64748B" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={11} tickLine={false} width={70}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
                <Tooltip
                  contentStyle={{ background: "#0B0F17", border: "1px solid #23314A", borderRadius: 8, color: "#F8FAFC" }}
                  formatter={(v) => [`${Number(v).toLocaleString("de-DE")} RSD`, "Trošak"]}
                  cursor={{ fill: "rgba(37,99,235,0.08)" }} />
                <Bar dataKey="trosak" fill="#2563EB" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-[#131C2E] border border-[#23314A] rounded-xl p-5 shadow-lg shadow-black/20">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-emerald-400" />
            <h2 className="font-head text-lg font-semibold">Troškovi po vozilu</h2>
          </div>
          {byVehicle.length === 0 ? (
            <p className="text-sm text-slate-500 py-10 text-center">Nema podataka o troškovima.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byVehicle} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#23314A" horizontal={false} />
                <XAxis type="number" stroke="#64748B" fontSize={11} tickLine={false}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
                <YAxis type="category" dataKey="name" stroke="#64748B" fontSize={11} tickLine={false} width={80} />
                <Tooltip
                  contentStyle={{ background: "#0B0F17", border: "1px solid #23314A", borderRadius: 8, color: "#F8FAFC" }}
                  formatter={(v) => [`${Number(v).toLocaleString("de-DE")} RSD`, "Trošak"]}
                  cursor={{ fill: "rgba(16,185,129,0.08)" }} />
                <Bar dataKey="trosak" fill="#10B981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="bg-[#131C2E] border border-[#23314A] rounded-xl p-5 shadow-lg shadow-black/20">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-4 w-4 text-purple-400" />
          <h2 className="font-head text-lg font-semibold">Troškovi po kategoriji servisa</h2>
        </div>
        {byCategory.length === 0 ? (
          <p className="text-sm text-slate-500 py-10 text-center">Nema podataka o troškovima.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byCategory} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#23314A" vertical={false} />
              <XAxis dataKey="name" stroke="#64748B" fontSize={11} tickLine={false} />
              <YAxis stroke="#64748B" fontSize={11} tickLine={false} width={70}
                tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
              <Tooltip
                contentStyle={{ background: "#0B0F17", border: "1px solid #23314A", borderRadius: 8, color: "#F8FAFC" }}
                formatter={(v) => [`${Number(v).toLocaleString("de-DE")} RSD`, "Trošak"]}
                cursor={{ fill: "rgba(139,92,246,0.08)" }} />
              <Bar dataKey="trosak" radius={[4, 4, 0, 0]}>
                {byCategory.map((e, i) => (
                  <Cell key={i} fill={e.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
