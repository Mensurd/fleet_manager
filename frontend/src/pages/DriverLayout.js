import { Outlet, useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Truck, LogOut } from "lucide-react";
import { CurrencySlider } from "@/context/CurrencyContext";
import { toast } from "sonner";

export default function DriverLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const doLogout = async () => {
    await logout();
    toast.success("Odjavljeni ste");
    navigate("/login");
  };
  return (
    <div className="min-h-screen" style={{ background: "var(--bg-main)" }}>
      <header className="h-16 border-b border-[#23314A] bg-[#080C13] flex items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center">
            <Truck className="h-5 w-5 text-white" />
          </div>
          <div className="leading-tight">
            <div className="font-head font-bold text-sm">Portal vozača</div>
            <div className="text-[11px] text-slate-500">{user?.name}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <CurrencySlider />
          <button
            data-testid="driver-logout-button"
            onClick={doLogout}
            className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-red-300 transition-colors"
          >
            <LogOut className="h-4 w-4" /> Odjava
          </button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto p-4 sm:p-6">
        <nav className="flex gap-2 mb-5" data-testid="driver-nav">
          {[
            { to: "/", label: "Aktivne ture", end: true, id: "driver-nav-active" },
            { to: "/zavrsene-ture", label: "Završene ture", end: false, id: "driver-nav-done" },
          ].map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              data-testid={n.id}
              className={({ isActive }) =>
                `flex-1 text-center px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-blue-600/15 text-blue-300 border border-blue-500/30"
                    : "text-slate-400 hover:text-slate-100 bg-[#131C2E] border border-[#23314A]"
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <Outlet />
      </main>
    </div>
  );
}
