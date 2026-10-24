import { useState } from "react";
import { DateField } from "@/components/DateField";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const DRIVER_DOCS = {
  license: "Vozačka dozvola",
  passport: "Pasoš",
  medical: "Lekarsko uverenje",
  cod95: "CoD95 (Kôd 95)",
  driver_card: "Kartica vozača",
};

const empty = {
  first_name: "",
  last_name: "",
  phone: "",
  id_number: "",
  license: { expiry: "" },
  passport: { expiry: "" },
  medical: { expiry: "" },
  cod95: { expiry: "" },
  driver_card: { expiry: "" },
};

export default function DriverForm({ open, onOpenChange, onSubmit, initial }) {
  const [form, setForm] = useState(() =>
    initial
      ? {
          ...empty,
          ...initial,
          license: { expiry: initial.license?.expiry || "" },
          passport: { expiry: initial.passport?.expiry || "" },
          medical: { expiry: initial.medical?.expiry || "" },
          cod95: { expiry: initial.cod95?.expiry || "" },
          driver_card: { expiry: initial.driver_card?.expiry || "" },
        }
      : empty
  );

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setDoc = (doc, v) => setForm((f) => ({ ...f, [doc]: { expiry: v } }));

  const submit = (e) => {
    e.preventDefault();
    onSubmit({
      ...form,
      license: { expiry: form.license.expiry || null },
      passport: { expiry: form.passport.expiry || null },
      medical: { expiry: form.medical.expiry || null },
      cod95: { expiry: form.cod95.expiry || null },
      driver_card: { expiry: form.driver_card.expiry || null },
    });
  };

  const inputCls =
    "w-full mt-1 bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors";
  const labelCls = "text-xs uppercase tracking-wider text-slate-400 font-semibold";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#131C2E] border-[#23314A] text-slate-100 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-head">{initial ? "Izmeni vozača" : "Novi vozač"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" data-testid="driver-form">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Ime *</label>
              <input data-testid="driver-first-name-input" className={inputCls} value={form.first_name} onChange={(e) => setField("first_name", e.target.value)} required />
            </div>
            <div>
              <label className={labelCls}>Prezime</label>
              <input data-testid="driver-last-name-input" className={inputCls} value={form.last_name} onChange={(e) => setField("last_name", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Telefon</label>
              <input className={inputCls} value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Br. lične / JMBG</label>
              <input className={inputCls} value={form.id_number} onChange={(e) => setField("id_number", e.target.value)} />
            </div>
          </div>

          <div className="border-t border-[#23314A] pt-3">
            <p className="text-xs uppercase tracking-wider text-blue-300 font-semibold mb-2">
              Datumi isteka dokumentacije
            </p>
            <div className="grid grid-cols-2 gap-3">
              {Object.keys(DRIVER_DOCS).map((key) => (
                <div key={key}>
                  <label className={labelCls}>{DRIVER_DOCS[key]}</label>
                  <DateField value={form[key].expiry} onChange={(v) => setDoc(key, v)} testId={`driver-${key}-input`} />
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <button type="button" onClick={() => onOpenChange(false)} className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:bg-[#1C283F] transition-colors">
              Otkaži
            </button>
            <button data-testid="driver-form-submit" type="submit" className="px-4 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors">
              Sačuvaj
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
