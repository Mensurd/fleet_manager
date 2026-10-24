import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Truck, Loader2, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

function formatErr(detail) {
  if (detail == null) return "Došlo je do greške. Pokušajte ponovo.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => e?.msg || JSON.stringify(e)).join(" ");
  return String(detail);
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("duljevic1366@gmail.com");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(email, password);
      toast.success("Uspešna prijava");
      navigate("/");
    } catch (err) {
      setError(formatErr(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg-main)" }}>
      <div
        className="hidden lg:flex flex-col justify-between w-1/2 relative p-12 overflow-hidden"
        style={{
          backgroundImage:
            "linear-gradient(rgba(11,15,23,0.55), rgba(11,15,23,0.95)), url('https://images.unsplash.com/photo-1565793298595-6a879b1d9492?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
            <Truck className="h-6 w-6 text-white" />
          </div>
          <span className="font-head text-xl font-bold text-white">Fleet Manager</span>
        </div>
        <div>
          <h1 className="font-head text-4xl font-bold text-white leading-tight">
            Vozni park pod kontrolom
          </h1>
          <p className="text-slate-300 mt-4 max-w-md">
            Evidencija održavanja, praćenje isteka tehničkog pregleda, registracije,
            CMR i Kasko osiguranja — sve na jednom mestu.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 text-xs uppercase tracking-wider text-blue-300 font-semibold border border-blue-500/30 rounded-full px-4 py-1.5">
            <ShieldCheck className="h-4 w-4" /> APR MENSUR DULJEVIĆ
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <form
          onSubmit={submit}
          className="w-full max-w-sm bg-[#131C2E] border border-[#23314A] rounded-2xl p-8 shadow-2xl shadow-black/40 animate-fade-up"
          data-testid="login-form"
        >
          <div className="lg:hidden flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center">
              <Truck className="h-5 w-5 text-white" />
            </div>
            <span className="font-head text-lg font-bold">Fleet Manager</span>
          </div>
          <h2 className="font-head text-2xl font-bold">Prijava</h2>
          <p className="text-sm text-slate-400 mt-1 mb-6">
            Pristupite kontrolnoj tabli voznog parka
          </p>

          <label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
            Email ili korisničko ime
          </label>
          <input
            data-testid="login-email-input"
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mt-1.5 mb-4 bg-[#1A2438] border border-[#23314A] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
            placeholder="email@primer.com ili korisničko ime"
            required
          />

          <label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
            Lozinka
          </label>
          <div className="relative mt-1.5 mb-2">
            <input
              data-testid="login-password-input"
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#1A2438] border border-[#23314A] rounded-lg px-3 pr-10 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="••••••••"
              required
            />
            <button
              type="button"
              data-testid="toggle-login-password"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {error && (
            <p data-testid="login-error" className="text-sm text-red-400 mt-2">
              {error}
            </p>
          )}

          <button
            data-testid="login-submit-button"
            type="submit"
            disabled={loading}
            className="w-full mt-5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-lg py-2.5 flex items-center justify-center gap-2 transition-colors"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Prijavi se
          </button>

          <button
            type="button"
            onClick={() => navigate("/zaboravljena-lozinka")}
            data-testid="forgot-password-link"
            className="w-full mt-3 text-sm text-slate-400 hover:text-blue-300 transition-colors"
          >
            Zaboravili ste lozinku?
          </button>
        </form>
      </div>
    </div>
  );
}
