import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { CurrencySlider } from "@/context/CurrencyContext";
import { LayoutDashboard, Truck, FileText, LogOut, Wrench, Settings, Users, Sun, Moon, Calculator, MapPinned } from "lucide-react";
import { toast } from "sonner";

const nav = [
  { to: "/", label: "Kontrolna tabla", icon: LayoutDashboard, end: true, id: "nav-dashboard" },
  { to: "/vozila", label: "Vozila", icon: Truck, id: "nav-vehicles" },
  { to: "/vozaci", label: "Vozači", icon: Users, id: "nav-drivers" },
  { to: "/odrzavanje", label: "Održavanje", icon: Wrench, id: "nav-maintenance" },
  { to: "/aktivne-ture", label: "Aktivne ture", icon: MapPinned, id: "nav-active" },
  { to: "/obracun", label: "Obračun vozača", icon: Calculator, id: "nav-obracun" },
  { to: "/izvestaji", label: "Izveštaji", icon: FileText, id: "nav-reports" },
  { to: "/podesavanja", label: "Podešavanja", icon: Settings, id: "nav-settings" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");

  const toggleTheme = () => {
    const n = theme === "dark" ? "light" : "dark";
    setTheme(n);
    localStorage.setItem("theme", n);
    document.documentElement.classList.toggle("light", n === "light");
  };

  const doLogout = async () => {
    await logout();
    toast.success("Odjavljeni ste");
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg-main)" }}>
      <aside className="w-64 shrink-0 hidden md:flex flex-col border-r border-[#23314A] bg-[#080C13] fixed h-screen">
        <div className="flex items-center gap-3 px-5 h-16 border-b border-[#23314A]">
          <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center">
            <Truck className="h-5 w-5 text-white" />
          </div>
          <div className="leading-tight">
            <div className="font-head font-bold text-sm">Fleet Manager</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">
              APR M. Duljević
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              data-testid={n.id}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-blue-600/15 text-blue-300 border border-blue-500/30"
                    : "text-slate-400 hover:text-slate-100 hover:bg-[#131C2E]"
                }`
              }
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-[#23314A]">
          <div className="flex items-center justify-between px-3 py-2 mb-1">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Valuta</span>
            <CurrencySlider />
          </div>
          <button
            data-testid="theme-toggle"
            onClick={toggleTheme}
            className="w-full flex items-center gap-2 px-3 py-2 mb-1 rounded-lg text-sm text-slate-400 hover:text-slate-100 hover:bg-[#131C2E] transition-colors"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme === "dark" ? "Svetla tema" : "Tamna tema"}
          </button>
          <div className="px-3 py-2 mb-2">
            <div className="text-sm font-medium truncate">{user?.name}</div>
            <div className="text-xs text-slate-500 truncate">{user?.email}</div>
          </div>
          <button
            data-testid="logout-button"
            onClick={doLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-red-300 hover:bg-red-950/40 transition-colors"
          >
            <LogOut className="h-4 w-4" /> Odjava
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-20 h-14 bg-[#080C13] border-b border-[#23314A] flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-blue-400" />
          <span className="font-head font-bold text-sm">Fleet Manager</span>
        </div>
        <div className="flex items-center gap-3">
          <CurrencySlider />
        <button onClick={doLogout} className="text-slate-400" data-testid="logout-button-mobile">
          <LogOut className="h-5 w-5" />
        </button>
        </div>
      </div>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 h-16 bg-[#080C13] border-t border-[#23314A] flex">
        {nav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-1 text-[10px] ${
                isActive ? "text-blue-300" : "text-slate-500"
              }`
            }
          >
            <n.icon className="h-5 w-5" />
            {n.label}
          </NavLink>
        ))}
      </nav>

      <main className="flex-1 md:ml-64 pt-14 md:pt-0 pb-20 md:pb-0">
        <Outlet />
      </main>
    </div>
  );
}
