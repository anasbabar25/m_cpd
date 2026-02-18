import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import MainPage from "./pages/MainPage";
import BspPage from "./pages/BspPage";
import MigoPage from "./pages/MigoPage";
import ScanPage from "./pages/ScanPage";
import SplashScreen from "./pages/SplashScreen";

function SplashScreenWrapper() {
  const navigate = useNavigate();
  
  const handleFinish = () => {
    navigate("/login");
  };

  return <SplashScreen onFinish={handleFinish} />;
}

function App() {
  const [user, setUser] = useState(null);

  const handleLogout = () => setUser(null);

  // Protected Route component
  const ProtectedRoute = ({ children }) => {
    if (!user) {
      return <Navigate to="/login" replace />;
    }
    return children;
  };

  return (
    <Router>
      <div className="app-background">
        <Routes>
          <Route 
            path="/" 
            element={<SplashScreenWrapper />}
          />
          <Route 
            path="/login" 
            element={
              user ? (
                <Navigate to="/main" replace />
              ) : (
                <LoginPage 
                  onLogin={(userData) => 
                    setUser({
                      ...userData,
                      loginTime: new Date().toLocaleString()
                    })
                  } 
                />
              )
            }
          />
          <Route 
            path="/main" 
            element={
              <ProtectedRoute>
                <MainPage user={user} onLogout={handleLogout} />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/bsp" 
            element={
              <ProtectedRoute>
                <BspPage user={user} onLogout={handleLogout} />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/scan" 
            element={
              <ProtectedRoute>
                <ScanPage user={user} onLogout={handleLogout} />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/migo" 
            element={
              <ProtectedRoute>
                <MigoPage user={user} onLogout={handleLogout} />
              </ProtectedRoute>
            } 
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
