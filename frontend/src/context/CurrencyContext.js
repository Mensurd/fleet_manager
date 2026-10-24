import { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

const Ctx = createContext(null);

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState(() => localStorage.getItem("app_currency") || "EUR");
  const [rate, setRate] = useState(117);

  const refreshRate = () =>
    api.get("/settings/rates").then((r) => setRate(r.data.rsd_per_eur || 117)).catch(() => {});
  useEffect(() => {
    refreshRate();
  }, []);
  useEffect(() => {
    localStorage.setItem("app_currency", currency);
  }, [currency]);

  const money = (nEur) => {
    const v = Number(nEur) || 0;
    if (currency === "RSD") {
      return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(Math.round(v * rate)) + " RSD";
    }
    return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v) + " €";
  };

  return <Ctx.Provider value={{ currency, setCurrency, rate, money, refreshRate }}>{children}</Ctx.Provider>;
}

export const useCurrency = () => useContext(Ctx) || { currency: "EUR", rate: 117, setCurrency: () => {}, money: (n) => (Number(n) || 0) + " €", refreshRate: () => {} };

export function CurrencySlider({ className = "" }) {
  const { currency, setCurrency } = useCurrency();
  const isRsd = currency === "RSD";
  return (
    <button
      type="button"
      onClick={() => setCurrency(isRsd ? "EUR" : "RSD")}
      data-testid="currency-slider"
      title="Prebaci valutu EUR / RSD"
      className={`relative inline-flex items-center h-8 w-[96px] rounded-full bg-[#1A2438] border border-[#23314A] text-xs font-semibold select-none ${className}`}
    >
      <span className={`z-10 flex-1 text-center transition-colors ${!isRsd ? "text-white" : "text-slate-500"}`}>EUR</span>
      <span className={`z-10 flex-1 text-center transition-colors ${isRsd ? "text-white" : "text-slate-500"}`}>RSD</span>
      <span
        className="absolute top-0.5 bottom-0.5 w-[46px] rounded-full bg-blue-600 transition-all duration-200"
        style={{ left: isRsd ? "48px" : "2px" }}
      />
    </button>
  );
}
