import React from "react";
import { useNavigate } from "react-router-dom";

function MainPage({ user, onLogout }) {
  const navigate = useNavigate();
  
  const navTiles = [
    { 
      id: "rmv", 
      title: "CPD - Remove From Storage",
      path: "/bsp2"
    },
    { 
      id: "plc", 
      title: "CPD - Place In Storage",
      path: "/bsp"
    },
  ];

  const handleTileClick = (path) => {
    navigate(path);
  };

  return (
    <div className="app-container">
      <div className="main-content">
        <header className="app-header">
          <div className="user-info">
            <div className="user-details">
              <span className="username">{user?.username || "User"}</span>
              <span className="server-info">
                Server {user?.server || "DEV"} • Client {user?.client || "110"}
              </span>
            </div>
            <button className="logout-btn" onClick={onLogout}>
              Logout
            </button>
          </div>
        </header>
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
        <section className="dashboard-content">
        </section>
      </div>
    </div>
  );
}

export default MainPage;