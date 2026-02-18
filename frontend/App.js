// App.js
import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import SplashScreen from './src/pages/SplashScreen';
import MainPage from './src/pages/MainPage';
import LoginPage from './src/pages/LoginPage';
import BspPage from './src/pages/BspPage';
import MigoPage from './src/pages/MigoPage';
import './src/index.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const handleLogin = (userData) => {
    setUser(userData);
    setLoading(false);
  };

  const handleLogout = () => {
    setUser(null);
  };

  if (loading) {
    return <SplashScreen onFinish={() => setLoading(false)} />;
  }

  return (
    <Router>
      <Routes>
        <Route 
          path="/login" 
          element={user ? <Navigate to="/main" /> : <LoginPage onLogin={handleLogin} />} 
        />
        <Route 
          path="/main" 
          element={user ? <MainPage user={user} onLogout={handleLogout} /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/bsp" 
          element={user ? <BspPage user={user} /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/migo" 
          element={user ? <MigoPage user={user} /> : <Navigate to="/login" />} 
        />
        <Route path="/" element={<Navigate to="/login" />} />
      </Routes>
    </Router>
  );
}

export default App;