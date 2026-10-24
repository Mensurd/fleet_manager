import { useState, useEffect } from "react";
import api, { DOC_META } from "@/lib/api";
import { DateField } from "@/components/DateField";
import { ManagedSelect } from "@/components/ManagedSelect";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const empty = {
  plate: "",
  make: "",
  model: "",
  year: "",
  vehicle_type: "Kamion",
  vin: "",
  driver_id: "",
  trailer_id: "",
  oil_interval_km: 15000,
  antifreeze_every: 2,
  tech_6m: { expiry: "", note: "" },
  registration_12m: { expiry: "", note: "" },
  cmr_insurance: { expiry: "", note: "" },
  kasko_insurance: { expiry: "", note: "" },
  white_card: { expiry: "", note: "" },
  tachograph: { expiry: "", note: "" },
};

export default function VehicleForm({ open, onOpenChange, onSubmit, initial }) {
  const [form, setForm] = useState(() =>
    initial
      ? {
          ...empty,
          ...initial,
          year: initial.year || "",
          tech_6m: { expiry: initial.tech_6m?.expiry || "", note: initial.tech_6m?.note || "" },
          registration_12m: {
            expiry: initial.registration_12m?.expiry || "",
            note: initial.registration_12m?.note || "",
          },
          cmr_insurance: {
            expiry: initial.cmr_insurance?.expiry || "",
            note: initial.cmr_insurance?.note || "",
          },
          kasko_insurance: {
            expiry: initial.kasko_insurance?.expiry || "",
            note: initial.kasko_insurance?.note || "",
          },
          white_card: {
            expiry: initial.white_card?.expiry || "",
            note: initial.white_card?.note || "",
          },
          tachograph: {
            expiry: initial.tachograph?.expiry || "",
            note: initial.tachograph?.note || "",
          },
        }
      : empty
  );

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setDoc = (doc, v) => setForm((f) => ({ ...f, [doc]: { ...f[doc], expiry: v } }));

  const [drivers, setDrivers] = useState([]);
  const [allVehicles, setAllVehicles] = useState([]);
  useEffect(() => {
    api.get("/drivers").then((r) => setDrivers(r.data)).catch(() => {});
    api.get("/vehicles").then((r) => setAllVehicles(r.data)).catch(() => {});
  }, []);

  const submit = (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      year: form.year ? Number(form.year) : null,
      driver_id: form.driver_id || null,
      trailer_id: form.trailer_id || null,
      oil_interval_km: Number(form.oil_interval_km) || 15000,
      antifreeze_every: Number(form.antifreeze_every) || 2,
      tech_6m: { expiry: form.tech_6m.expiry || null },
      registration_12m: { expiry: form.registration_12m.expiry || null },
      cmr_insurance: { expiry: form.cmr_insurance.expiry || null },
      kasko_insurance: { expiry: form.kasko_insurance.expiry || null },
      white_card: { expiry: form.white_card.expiry || null },
      tachograph: { expiry: form.tachograph.expiry || null },
    };
    onSubmit(payload);
  };

  const inputCls =
    "w-full mt-1 bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors";
  const labelCls = "text-xs uppercase tracking-wider text-slate-400 font-semibold";

  const isTrailer = /prikolic/i.test(form.vehicle_type || "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#131C2E] border-[#23314A] text-slate-100 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-head">
            {initial ? "Izmeni vozilo" : "Novo vozilo"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" data-testid="vehicle-form">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Registarska oznaka *</label>
              <input
                data-testid="vehicle-plate-input"
                className={inputCls}
                value={form.plate}
                onChange={(e) => setField("plate", e.target.value)}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Tip vozila</label>
              <ManagedSelect
                category="vehicle_type"
                value={form.vehicle_type}
                onChange={(v) => setField("vehicle_type", v)}
                placeholder="Izaberite tip..."
                testId="vehicle-type-select"
              />
            </div>
            <div>
              <label className={labelCls}>Marka</label>
              <input
                data-testid="vehicle-make-input"
                className={inputCls}
                value={form.make}
                onChange={(e) => setField("make", e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Model</label>
              <input
                className={inputCls}
                value={form.model}
                onChange={(e) => setField("model", e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Godište</label>
              <input
                type="number"
                className={inputCls}
                value={form.year}
                onChange={(e) => setField("year", e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Broj šasije (VIN)</label>
              <input
                className={inputCls}
                value={form.vin}
                onChange={(e) => setField("vin", e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Vozač koji vozi</label>
              <select
                data-testid="vehicle-driver-select"
                className={inputCls}
                value={form.driver_id || ""}
                onChange={(e) => setField("driver_id", e.target.value)}
              >
                <option value="">— Nije dodeljen —</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.first_name} {d.last_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Prikolica (sastav) — po registarskoj oznaci</label>
              <select
                data-testid="vehicle-trailer-select"
                className={inputCls}
                value={form.trailer_id || ""}
                onChange={(e) => setField("trailer_id", e.target.value)}
              >
                <option value="">— Bez prikolice —</option>
                {allVehicles
                  .filter((v) => v.id !== initial?.id)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate} {v.vehicle_type ? `(${v.vehicle_type})` : ""}
                    </option>
                  ))}
              </select>
            </div>
            {!isTrailer && (
              <>
                <div>
                  <label className={labelCls}>Interval zamene ulja (km)</label>
                  <input
                    data-testid="vehicle-oil-interval-input"
                    type="number"
                    className={inputCls}
                    value={form.oil_interval_km}
                    onChange={(e) => setField("oil_interval_km", e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls}>Antifriz na svaku (zamenu ulja)</label>
                  <input
                    data-testid="vehicle-antifreeze-every-input"
                    type="number"
                    min="1"
                    className={inputCls}
                    value={form.antifreeze_every ?? 2}
                    onChange={(e) => setField("antifreeze_every", e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          <div className="border-t border-[#23314A] pt-3">
            <p className="text-xs uppercase tracking-wider text-blue-300 font-semibold mb-2">
              Datumi isteka dokumentacije
            </p>
            <div className="grid grid-cols-2 gap-3">
              {Object.keys(DOC_META).map((key) => (
                <div key={key}>
                  <label className={labelCls}>{DOC_META[key].short}</label>
                  <DateField value={form[key].expiry} onChange={(v) => setDoc(key, v)} testId={`vehicle-${key}-input`} />
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:bg-[#1C283F] transition-colors"
            >
              Otkaži
            </button>
            <button
              data-testid="vehicle-form-submit"
              type="submit"
              className="px-4 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors"
            >
              Sačuvaj
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
