import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Truck, Loader2, Mail, ArrowLeft, CheckCircle2 } from "lucide-react";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (err) {
      setSent(true); // generic response — ne otkrivamo da li nalog postoji
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

        {sent ? (
          <div data-testid="forgot-sent" className="text-center py-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto" />
            <h2 className="font-head text-xl font-bold mt-4">Proverite email</h2>
            <p className="text-sm text-slate-400 mt-2">
              Ako nalog sa tom adresom postoji, poslali smo link za resetovanje lozinke. Link važi 1 sat.
            </p>
            <button
              onClick={() => navigate("/login")}
              className="mt-6 inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
              data-testid="back-to-login"
            >
              <ArrowLeft className="h-4 w-4" /> Nazad na prijavu
            </button>
          </div>
        ) : (
          <form onSubmit={submit} data-testid="forgot-form">
            <h2 className="font-head text-2xl font-bold">Zaboravljena lozinka</h2>
            <p className="text-sm text-slate-400 mt-1 mb-6">
              Unesite email naloga i poslaćemo vam link za resetovanje.
            </p>
            <label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Email</label>
            <div className="relative mt-1.5 mb-4">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                data-testid="forgot-email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="email@primer.com"
                className="w-full bg-[#1A2438] border border-[#23314A] rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <button
              data-testid="forgot-submit-button"
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-lg py-2.5 flex items-center justify-center gap-2 transition-colors"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Pošalji link
            </button>
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="w-full mt-3 text-sm text-slate-400 hover:text-blue-300 transition-colors"
            >
              Nazad na prijavu
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
