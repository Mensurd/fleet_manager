import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { fmtDate } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import VehicleForm from "@/components/VehicleForm";
import { Plus, Search, Truck } from "lucide-react";
import { toast } from "sonner";

const worstStatus = (v) => {
  const order = ["expired", "expiring", "valid", "none"];
  const statuses = ["tech_6m", "registration_12m", "cmr_insurance", "kasko_insurance", "white_card"].map(
    (k) => v[k]?.status || "none"
  );
  return order.find((o) => statuses.includes(o)) || "none";
};

export default function Vehicles() {
  const [vehicles, setVehicles] = useState([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [type, setType] = useState("all");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const load = () => api.get("/vehicles").then((r) => setVehicles(r.data)).catch(() => toast.error("Greška pri učitavanju vozila"));
  useEffect(() => {
    load();
  }, []);

  const create = async (payload) => {
    try {
      await api.post("/vehicles", payload);
      toast.success("Vozilo dodato");
      setOpen(false);
      load();
    } catch (e) {
      toast.error("Greška pri čuvanju");
    }
  };

  const filtered = useMemo(() => {
    return vehicles.filter((v) => {
      const matchQ =
        !q ||
        `${v.plate} ${v.make} ${v.model}`.toLowerCase().includes(q.toLowerCase());
      const matchF = filter === "all" || worstStatus(v) === filter;
      const matchType = type === "all" || v.vehicle_type === type;
      return matchQ && matchF && matchType;
    });
  }, [vehicles, q, filter, type]);

  const allTypes = useMemo(
    () =>
      Array.from(
        new Set(["Tegljač", "Kamion", "Prikolica", ...vehicles.map((v) => v.vehicle_type).filter(Boolean)])
      ),
    [vehicles]
  );

  const filters = [
    { id: "all", label: "Sve" },
    { id: "expired", label: "Isteklo", testId: "filter-status-red" },
    { id: "expiring", label: "Uskoro", testId: "filter-status-yellow" },
    { id: "valid", label: "Važeće", testId: "filter-status-green" },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-head text-3xl font-bold tracking-tight">Vozila</h1>
          <p className="text-sm text-slate-400 mt-1">{vehicles.length} vozila u voznom parku</p>
        </div>
        <button
          data-testid="add-vehicle-button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
        >
          <Plus className="h-4 w-4" /> Novo vozilo
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            data-testid="vehicle-list-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pretraga po tablici, marki, modelu..."
            className="w-full bg-[#131C2E] border border-[#23314A] rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <div className="flex gap-1.5">
          {filters.map((f) => (
            <button
              key={f.id}
              data-testid={f.testId || `filter-${f.id}`}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                filter === f.id
                  ? "bg-blue-600 text-white"
                  : "bg-[#131C2E] border border-[#23314A] text-slate-400 hover:text-slate-100"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold mr-1">Tip:</span>
        <button
          data-testid="type-filter-all"
          onClick={() => setType("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            type === "all" ? "bg-blue-600 text-white" : "bg-[#131C2E] border border-[#23314A] text-slate-400 hover:text-slate-100"
          }`}
        >
          Svi tipovi
        </button>
        {allTypes.map((t) => (
          <button
            key={t}
            data-testid={`type-filter-${t}`}
            onClick={() => setType(t)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              type === t ? "bg-blue-600 text-white" : "bg-[#131C2E] border border-[#23314A] text-slate-400 hover:text-slate-100"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-[#131C2E] border border-[#23314A] rounded-xl p-12 text-center">
          <Truck className="h-10 w-10 text-slate-600 mx-auto" />
          <p className="text-slate-400 mt-3 text-sm">Nema vozila za prikaz.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((v) => (
            <button
              key={v.id}
              data-testid={`vehicle-card-${v.plate}`}
              onClick={() => navigate(`/vozila/${v.id}`)}
              className="text-left bg-[#131C2E] border border-[#23314A] rounded-xl p-5 shadow-lg shadow-black/20 hover:border-blue-500/40 hover:bg-[#1C283F]/40 transition-all duration-200"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono text-lg font-bold">{v.plate}</div>
                  <div className="text-sm text-slate-400">
                    {v.make} {v.model} {v.year ? `· ${v.year}` : ""}
                  </div>
                  {v.driver_name && (
                    <div className="text-xs text-blue-300 mt-1 flex items-center gap-1">
                      <span className="text-slate-500">Vozač:</span> {v.driver_name}
                    </div>
                  )}
                  {v.trailer_plate && (
                    <div className="text-xs text-emerald-300 mt-0.5 flex items-center gap-1">
                      <span className="text-slate-500">Prikolica:</span> <span className="font-mono">{v.trailer_plate}</span>
                    </div>
                  )}
                </div>
                <span className="text-[10px] uppercase tracking-wider text-slate-500 bg-[#1A2438] px-2 py-1 rounded">
                  {v.vehicle_type}
                </span>
              </div>
              <div className="mt-4 space-y-2">
                {["tech_6m", "registration_12m", "cmr_insurance", "kasko_insurance"].map((k) => (
                  <div key={k} className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">
                      {{ tech_6m: "Tehnički", registration_12m: "Registracija", cmr_insurance: "CMR", kasko_insurance: "Kasko" }[k]}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-slate-400">{fmtDate(v[k]?.expiry)}</span>
                      <StatusBadge status={v[k]?.status} />
                    </div>
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}

      {open && <VehicleForm open={open} onOpenChange={setOpen} onSubmit={create} />}
    </div>
  );
}
