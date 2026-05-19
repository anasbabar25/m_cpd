import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { INVENTORY_REPORT_COLUMNS } from "../constants/inventoryReportColumns";
import { isInventoryReportMockEnabled } from "../api/inventoryReportApi";

function ReportPage({ user, onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [report, setReport] = useState(location.state?.reportData ?? null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    if (!location.state?.reportData) {
      navigate("/inventory-report", { replace: true });
      return;
    }
    setReport(location.state.reportData);
  }, [location.state, navigate]);

  const handleBack = () => {
    navigate("/inventory-report");
  };

  if (!report) {
    return null;
  }

  return (
    <div className="app-container inventory-report-page">
      <header className="app-header">
        <div className="user-info">
          <div className="user-details">
            <span className="username">{user?.username || "User"}</span>
            <span className="server-info">
              Server {user?.server || "DEV"} • Client {user?.client || "110"}
            </span>
          </div>
          <button
            type="button"
            className="logout-btn"
            onClick={() => setShowLogoutConfirm(true)}
          >
            Logout
          </button>
        </div>
      </header>

      {showLogoutConfirm && (
        <div className="inventory-report-overlay">
          <div className="inventory-report-dialog">
            <h3>Confirm Logout</h3>
            <p>Are you sure you want to logout?</p>
            <div className="inventory-report-dialog-actions">
              <button
                type="button"
                className="inventory-report-btn-secondary"
                onClick={() => setShowLogoutConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inventory-report-btn-danger"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  onLogout();
                }}
              >
                Yes, Logout
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="inventory-report-main report-page-main">
        <section className="inventory-report-card">
          <h2 className="inventory-report-title">MMBE Inventory Report</h2>
          <p className="inventory-report-subtitle">
            Stock overview for material {report.materialNumber} at plant{" "}
            {report.plant}, SLOC {report.sloc}.
          </p>
          {isInventoryReportMockEnabled && (
            <p className="inventory-report-mock-badge" role="status">
              Demo mode — showing mock inventory data
            </p>
          )}

          <div className="report-table-wrap">
            <table className="report-kv-table">
              <tbody>
                {INVENTORY_REPORT_COLUMNS.map((col) => (
                  <tr key={col.key}>
                    <th scope="row">{col.label}</th>
                    <td>{report[col.key] ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </section>
      </main>

      <div className="inventory-report-footer">
        <button
          type="button"
          className="inventory-report-back-btn"
          onClick={handleBack}
        >
          Back
        </button>
      </div>
    </div>
  );
}

export default ReportPage;


