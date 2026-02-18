import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser } from "../api";
import { apiEndpoints } from "../config/servers";

export default function LoginPage({ onLogin }) {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [environment, setEnvironment] = useState("dev");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      // Set client number based on environment
      const client = environment === 'dev' ? '110' : '300';
      const result = await loginUser(username, password, environment);
      onLogin({
        ...result,
        client,
        server: environment.toUpperCase()
      });
    } catch (err) {
      console.error("Login page error:", err);
      setError(err.message || "Login failed");
    }
  };

  const handleBack = () => {
    navigate('/splash');
  };

  const handleNext = () => {
    // This will be handled by form submission
    const form = document.querySelector('form');
    if (form) {
      form.requestSubmit();
    }
  };

  return (
    <div className="login-page">
    <div className="login-container">
      <h2>SAP Login</h2>

      <form onSubmit={handleSubmit}>
        {/* Environment */}
        <div className="form-group">
          <label>Server</label>
          <select
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
            required
          >
            <option value="dev">Development</option>
            <option value="prd">Production</option>
          </select>
        </div>

        {/* Username */}
        <div className="form-group">
          <label>Username</label>
          <input
            type="text"
            value={username}
            placeholder="Enter username"
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>

        {/* Password */}
        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            value={password}
            placeholder="Enter password"
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {/* Login Button */}
        <button type="submit" className="btn">
          Login
        </button>

        {error && <div className="error-message">{error}</div>}
      </form>
    </div>
    
    {/* Bottom Navigation Buttons */}

    </div>

  );
}
