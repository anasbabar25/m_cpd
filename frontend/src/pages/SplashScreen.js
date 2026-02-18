import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

function SplashScreen({ onFinish }) {
  const navigate = useNavigate();
  
  useEffect(() => {
    const t = setTimeout(() => {
      onFinish();
    }, 2000);

    return () => clearTimeout(t);
  }, [onFinish]);

  const handleBack = () => {
    // No previous page for splash screen, could exit app or navigate to login
    navigate('/login');
  };

  const handleNext = () => {
    // Skip splash and go directly to login
    onFinish();
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(180deg, #679be9ff 0%, #559cc5ff 100%)",
        padding: "24px"
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "520px",
          background: "rgba(255,255,255,0.12)",
          border: "1px solid rgba(255,255,255,0.25)",
          borderRadius: "16px",
          padding: "28px",
          textAlign: "center",
          boxShadow: "0 18px 40px rgba(0,0,0,0.25)",
          color: "#fff"
        }}
      >
        <img
          src="/SAP_2011_logo.svg.png"
          alt="SAP"
          style={{ width: "180px", maxWidth: "100%", height: "auto" }}
        />

        <div style={{ marginTop: "18px", fontSize: "1.1rem", fontWeight: 600 }}>
          Welcome
        </div>
      </div>

      
      
      </div>

  );
}

export default SplashScreen;
