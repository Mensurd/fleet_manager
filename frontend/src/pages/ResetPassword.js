import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { Truck, Loader2, Lock, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (newPw.length < 6) return toast.error("Nova lozinka mora imati najmanje 6 karaktera");
    if (newPw !== confirmPw) return toast.error("Lozinke se ne poklapaju");
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: newPw });
      setDone(true);
      toast.success("Lozinka je resetovana");
      setTimeout(() => navigate("/login"), 1800);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Greška pri resetovanju");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--bg-main)" }}>
      <div className="w-full max-w-sm bg-[#131C2E] border border-[#23314A] rounded-2xl p-8 shadow-2xl shadow-black/40 animate-fade-up">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center">
            <Truck className="h-5 w-5 text-white" />
          </div>
          <span className="font-head text-lg font-bold">Fleet Manager</span>
        </div>

        {!token ? (
          <div className="text-center py-4" data-testid="reset-invalid">
            <h2 className="font-head text-xl font-bold">Nevažeći link</h2>
            <p className="text-sm text-slate-400 mt-2">Link za resetovanje nije ispravan ili nedostaje token.</p>
            <button onClick={() => navigate("/zaboravljena-lozinka")} className="mt-6 text-sm text-blue-400 hover:text-blue-300">
              Zatraži novi link
            </button>
          </div>
        ) : done ? (
          <div className="text-center py-4" data-testid="reset-done">
            <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto" />
            <h2 className="font-head text-xl font-bold mt-4">Gotovo!</h2>
            <p className="text-sm text-slate-400 mt-2">Lozinka je uspešno resetovana. Preusmeravamo vas na prijavu...</p>
          </div>
        ) : (
          <form onSubmit={submit} data-testid="reset-form">
            <h2 className="font-head text-2xl font-bold">Nova lozinka</h2>
            <p className="text-sm text-slate-400 mt-1 mb-4">Unesite novu lozinku za vaš nalog.</p>
            <div className="mb-4">
              <button
                type="button"
                data-testid="toggle-reset-password"
                onClick={() => setShowPw(!showPw)}
                className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-blue-300 transition-colors"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {showPw ? "Sakrij lozinku" : "Prikaži lozinku"}
              </button>
            </div>
            <label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Nova lozinka</label>
            <div className="relative mt-1.5 mb-4">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                data-testid="reset-new-password-input"
                type={showPw ? "text" : "password"}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                required
                placeholder="najmanje 6 karaktera"
                className="w-full bg-[#1A2438] border border-[#23314A] rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Potvrdi lozinku</label>
            <div className="relative mt-1.5 mb-4">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                data-testid="reset-confirm-password-input"
                type={showPw ? "text" : "password"}
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full bg-[#1A2438] border border-[#23314A] rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <button
              data-testid="reset-submit-button"
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-lg py-2.5 flex items-center justify-center gap-2 transition-colors"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Resetuj lozinku
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
