import { useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";

const pad = (n) => String(n).padStart(2, "0");

const isoToDisplay = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}.${m}.${y}`;
};

const parseDisplay = (s) => {
  const m = (s || "").trim().match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2}|\d{4})$/);
  if (!m) return null;
  let d = +m[1], mo = +m[2], y = +m[3];
  if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
};

export const DateField = ({ value, onChange, testId }) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(isoToDisplay(value));

  useEffect(() => {
    setText(isoToDisplay(value));
  }, [value]);

  const selected = value ? new Date(value + "T00:00:00") : undefined;
  const toIso = (d) => {
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  };

  const handleText = (raw) => {
    const digits = (raw || "").replace(/\D/g, "").slice(0, 8);
    let out = digits;
    if (digits.length > 4) out = `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
    else if (digits.length > 2) out = `${digits.slice(0, 2)}.${digits.slice(2)}`;
    setText(out);
    if (out.trim() === "") {
      onChange("");
      return;
    }
    const iso = parseDisplay(out);
    if (iso) onChange(iso);
  };

  const handleBlur = () => {
    if (text.trim() === "") return;
    if (!parseDisplay(text)) setText(isoToDisplay(value));
  };

  return (
    <div className="relative mt-1">
      <input
        type="text"
        inputMode="numeric"
        data-testid={testId}
        value={text}
        onChange={(e) => handleText(e.target.value)}
        onBlur={handleBlur}
        placeholder="dd.mm.gggg"
        className="w-full bg-[#1A2438] border border-[#23314A] rounded-lg pl-3 pr-10 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 transition-colors"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid={testId ? `${testId}-calendar` : undefined}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-blue-400 transition-colors"
          >
            <CalendarIcon className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 bg-[#131C2E] border-[#23314A]" align="end">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(d) => {
              onChange(d ? toIso(d) : "");
              setOpen(false);
            }}
            initialFocus
          />
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="w-full text-xs text-slate-400 hover:text-red-300 py-2 border-t border-[#23314A]"
            >
              Obriši datum
            </button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
};
