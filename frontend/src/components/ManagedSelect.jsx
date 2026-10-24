import { useState, useEffect } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, Plus, Pencil, Trash2, Check, X } from "lucide-react";

export const ManagedSelect = ({ category, value, onChange, placeholder = "Izaberite...", testId }) => {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState("");

  const load = () =>
    api.get(`/lookups/${category}`).then((r) => setOptions(r.data || [])).catch(() => {});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const q = query.trim();
  const filtered = options.filter((o) => o.toLowerCase().includes(q.toLowerCase()));
  const canAdd = q && !options.some((o) => o.toLowerCase() === q.toLowerCase());

  const addNew = async () => {
    if (!q) return;
    try {
      await api.post(`/lookups/${category}`, { value: q });
      await load();
      onChange(q);
      setQuery("");
      setOpen(false);
    } catch {
      toast.error("Greška pri dodavanju opcije");
    }
  };

  const select = (v) => {
    onChange(v);
    setQuery("");
    setOpen(false);
  };

  const saveEdit = async () => {
    const nv = editText.trim();
    if (!nv || nv === editing) {
      setEditing(null);
      return;
    }
    try {
      await api.put(`/lookups/${category}`, { old_value: editing, new_value: nv });
      if (value === editing) onChange(nv);
      setEditing(null);
      setEditText("");
      await load();
      toast.success("Opcija preimenovana");
    } catch {
      toast.error("Greška pri izmeni opcije");
    }
  };

  const del = async (v) => {
    if (!window.confirm(`Obrisati opciju "${v}" iz liste?\n\nPostojeći sačuvani zapisi ostaju netaknuti — opcija se samo uklanja iz budućih menija.`))
      return;
    try {
      await api.delete(`/lookups/${category}`, { params: { value: v } });
      await load();
      toast.success("Opcija obrisana");
    } catch {
      toast.error("Greška pri brisanju opcije");
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (!o && query.trim()) {
          const nv = query.trim();
          const match = options.find((x) => x.toLowerCase() === nv.toLowerCase());
          onChange(match || nv);
          setQuery("");
        }
        setOpen(o);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={testId}
          className="w-full mt-1 bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between focus:outline-none focus:border-blue-500 transition-colors"
        >
          <span className={value ? "text-slate-100 truncate" : "text-slate-500 truncate"}>
            {value || placeholder}
          </span>
          <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-[240px] p-0 bg-[#131C2E] border-[#23314A]"
        align="start"
      >
        <div className="p-2 border-b border-[#23314A] flex gap-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (canAdd) addNew();
                else if (filtered[0]) select(filtered[0]);
              }
            }}
            placeholder="Pretraži ili dodaj novu..."
            data-testid={testId ? `${testId}-search` : undefined}
            className="flex-1 bg-[#1A2438] border border-[#23314A] rounded-md px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
          />
          {canAdd && (
            <button
              type="button"
              onClick={addNew}
              data-testid={testId ? `${testId}-add` : undefined}
              className="inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md px-2 text-xs whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" /> Dodaj
            </button>
          )}
        </div>
        <div className="max-h-60 overflow-y-auto py-1">
          {filtered.length === 0 && !canAdd && (
            <div className="px-3 py-3 text-center text-xs text-slate-500">Nema opcija.</div>
          )}
          {filtered.map((o) => (
            <div
              key={o}
              className="flex items-center justify-between px-1 mx-1 rounded-md hover:bg-[#1C283F]/60"
              data-testid={testId ? `${testId}-opt` : undefined}
            >
              {editing === o ? (
                <div className="flex items-center gap-1 w-full py-1">
                  <input
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        saveEdit();
                      }
                      if (e.key === "Escape") setEditing(null);
                    }}
                    className="flex-1 bg-[#1A2438] border border-[#23314A] rounded-md px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                  <button type="button" onClick={saveEdit} title="Sačuvaj" className="text-emerald-400 hover:text-emerald-300 p-1">
                    <Check className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => setEditing(null)} title="Otkaži" className="text-slate-500 hover:text-slate-300 p-1">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => select(o)}
                    className={`flex-1 text-left text-sm truncate py-2 pl-2 ${value === o ? "text-blue-300 font-medium" : "text-slate-200"}`}
                  >
                    {o}
                  </button>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(o);
                        setEditText(o);
                      }}
                      title="Izmeni naziv"
                      className="text-slate-500 hover:text-blue-300 p-1.5"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => del(o)}
                      title="Obriši opciju"
                      className="text-slate-500 hover:text-red-400 p-1.5"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
