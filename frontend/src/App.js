import { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { CurrencyProvider } from "@/context/CurrencyContext";
import Login from "@/pages/Login";
import Layout from "@/pages/Layout";
import Dashboard from "@/pages/Dashboard";
import Vehicles from "@/pages/Vehicles";
import VehicleDetail from "@/pages/VehicleDetail";
import Reports from "@/pages/Reports";
import Maintenance from "@/pages/Maintenance";
import Settings from "@/pages/Settings";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Drivers from "@/pages/Drivers";
import ObracunVozaca from "@/pages/ObracunVozaca";
import ActiveTours from "@/pages/ActiveTours";
import DriverLayout from "@/pages/DriverLayout";
import DriverPortal from "@/pages/DriverPortal";

const Loading = () => (
  <div className="min-h-screen flex items-center justify-center text-slate-400">Učitavanje...</div>
);

const AppRoutes = () => {
  const { user } = useAuth();
  if (user === null) return <Loading />;
  const isDriver = user && user.role === "driver";
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/zaboravljena-lozinka" element={<ForgotPassword />} />
      <Route path="/reset-lozinka" element={<ResetPassword />} />
      {!user ? (
        <Route path="*" element={<Navigate to="/login" replace />} />
      ) : isDriver ? (
        <Route path="/" element={<DriverLayout />}>
          <Route index element={<DriverPortal mode="active" />} />
          <Route path="moje-ture" element={<DriverPortal mode="active" />} />
          <Route path="zavrsene-ture" element={<DriverPortal mode="done" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      ) : (
        <>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="vozila" element={<Vehicles />} />
            <Route path="vozila/:id" element={<VehicleDetail />} />
            <Route path="vozaci" element={<Drivers />} />
            <Route path="odrzavanje" element={<Maintenance />} />
            <Route path="obracun" element={<ObracunVozaca />} />
            <Route path="aktivne-ture" element={<ActiveTours />} />
            <Route path="podesavanja" element={<Settings />} />
            <Route path="izvestaji" element={<Reports />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      )}
    </Routes>
  );
};

function App() {
  useEffect(() => {
    const t = localStorage.getItem("theme") || "dark";
    document.documentElement.classList.toggle("light", t === "light");
  }, []);
  return (
    <div className="App">
      <AuthProvider>
        <CurrencyProvider>
          <BrowserRouter>
            <Toaster position="top-right" theme="dark" richColors />
            <AppRoutes />
          </BrowserRouter>
        </CurrencyProvider>
      </AuthProvider>
    </div>
  );
}

export default App;
