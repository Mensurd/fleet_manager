import axios from "axios";

const LIVE_RENDER_URL = "https://fleet-manager-8opw.onrender.com";


const getBackendUrl = () => {
  const envUrl = process.env.REACT_APP_BACKEND_URL;
  if (envUrl && !envUrl.includes("localhost") && !envUrl.includes("127.0.0.1")) {
    return envUrl;
  }
  if (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
    return LIVE_RENDER_URL;
  }
  return envUrl || "http://localhost:8001";
};

const RAW_BACKEND_URL = getBackendUrl();
export const API = `${RAW_BACKEND_URL.replace(/\/api\/?$/, "").replace(/\/$/, "")}/api`;

const api = axios.create({ baseURL: API, withCredentials: true, timeout: 15000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;

export const rsd = (v) =>
  (Number(v) || 0).toLocaleString("de-DE", { maximumFractionDigits: 0 }) + " RSD";

export const fmtDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y.slice(-2)}`;
};

export const DOC_META = {
  tech_6m: { label: "6-mesečni tehnički pregled", short: "Tehnički pregled" },
  registration_12m: { label: "12-mesečna registracija", short: "Registracija" },
  cmr_insurance: { label: "CMR osiguranje", short: "CMR" },
  kasko_insurance: { label: "Kasko osiguranje", short: "Kasko" },
  white_card: { label: "Bela potvrda", short: "Bela potvrda" },
  tachograph: { label: "Tahograf (kalibracija)", short: "Tahograf" },
};

export const STATUS_STYLE = {
  expired: "bg-red-950/80 text-red-300 border border-red-500/40",
  expiring: "bg-amber-950/80 text-amber-300 border border-amber-500/40",
  valid: "bg-emerald-950/80 text-emerald-300 border border-emerald-500/40",
  none: "bg-slate-800/80 text-slate-400 border border-slate-600/40",
};

export const STATUS_LABEL = {
  expired: "Isteklo",
  expiring: "Uskoro ističe",
  valid: "Važeće",
  none: "Nema podatka",
};
