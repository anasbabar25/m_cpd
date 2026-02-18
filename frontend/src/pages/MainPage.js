import React, { useState } from "react";
import { useNavigate } from "react-router-dom";


function MainPage({ user, onLogout }) {
  const navigate = useNavigate();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const navTiles = [
    { 
      id: "bsp-fh-transfer", 
      title: "CPD - Place in Storage",
      path: "/bsp"
    },
  ];

  const handleTileClick = (path) => {
    navigate(path);
  };

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    onLogout();
    setShowLogoutConfirm(false);
  };

  const cancelLogout = () => {
    setShowLogoutConfirm(false);
  };

  const handleBack = () => {
    navigate('/login');
  };

  const handleNext = () => {
    // Navigate to the first available tile
    if (navTiles.length > 0) {
      navigate(navTiles[0].path);
    }
  };

  return (
    <div className="app-container">
      <div className="main-content">

        {/* Header */}
        <header className="app-header">
          <div className="user-info">
            <div className="user-details">
              <span className="username">{user?.username || "User"}</span>
              <span className="server-info">
                 Server {user?.server || "DEV"} • Client {user?.client || "110"}
              </span>
            </div>

            <button className="logout-btn" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>

        {/* Logout Confirmation Dialog */}
        {showLogoutConfirm && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div style={{
              backgroundColor: 'white',
              padding: '2rem',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              maxWidth: '400px',
              width: '90%'
            }}>
              <h3 style={{ margin: '0 0 1rem 0', color: '#333' }}>Confirm Logout</h3>
              <p style={{ margin: '0 0 1.5rem 0', color: '#666' }}>
                Are you sure you want to logout?
              </p>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={cancelLogout}
                  style={{
                    padding: '0.75rem 1.5rem',
                    border: '1px solid #ddd',
                    backgroundColor: 'white',
                    color: '#666',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmLogout}
                  style={{
                    padding: '0.75rem 1.5rem',
                    border: 'none',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  Yes, Logout
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Tiles */}
    <section className="tiles-container">
      {navTiles.map(tile => (
        <div 
          key={tile.id} 
          className="nav-tile text-tile hover:bg-gray-100 cursor-pointer transition-colors duration-200"
          onClick={() => handleTileClick(tile.path)}
        >
          <span className="tile-title">{tile.title}</span>
        </div>
      ))}
    </section>

        {/* Dashboard Content */}
        <section className="dashboard-content">






        </section>
      </div>




    </div>
  );
}

export default MainPage;
