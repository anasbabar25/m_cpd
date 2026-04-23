// frontend/src/pages/migoPage.js
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getUserCredentials } from '../api';
import { apiEndpoints } from "../config/servers";

function MigoPage({ user, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const batchData = location.state?.batchData;
  const materials = location.state?.materials;
  const isMaterialFlow = location.state?.isMaterialFlow;

  const [formData, setFormData] = useState({
    storageLocationTo: ''
  });
  const documentData = location.state?.documentData;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [validationPassed, setValidationPassed] = useState(false);
  const [transferResult, setTransferResult] = useState(null);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [showPostSuccessPopup, setShowPostSuccessPopup] = useState(false);
  const [postSuccessData, setPostSuccessData] = useState(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const formatMaterialNumber = (material) => {
    if (!material) return '-';
    // Skip leading zeros and display from first non-zero digit
    return material.replace(/^0+/, '');
  };

  useEffect(() => {
    if (!batchData && !materials) {
      navigate('/bsp');
      return;
    }

    // Auto-populate storage location from document data if available
    if (documentData && documentData.d && documentData.d.RefItemSet && documentData.d.RefItemSet.results && documentData.d.RefItemSet.results.length > 0) {
      const firstMaterial = documentData.d.RefItemSet.results[0];
      if (firstMaterial.StgeLoc || firstMaterial.LGORT) {
        setFormData(prev => ({
          ...prev,
          storageLocationTo: firstMaterial.StgeLoc || firstMaterial.LGORT || ''
        }));
      }
    }
  }, [batchData, materials, documentData, navigate]);

  // For new flow: only show matched batches
  const matchedMaterials = isMaterialFlow && materials 
    ? materials.filter(m => m.isMatched !== false) // Only matched batches
    : materials;

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    // Auto-uppercase storage location to field
    if (name === 'storageLocationTo') {
      setFormData(prev => ({
        ...prev,
        [name]: value.toUpperCase()
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const getAuthHeader = () => {
    const creds = getUserCredentials();
    if (!creds) throw new Error("User not authenticated. Please log in again.");
    
    return {
      'X-User-Auth': btoa(`${creds.username}:${creds.password}`),
      'X-User-Environment': creds.environment,
      'Content-Type': 'application/json'
    };
  };

  
  const preparePayload = (isTestRun, environment) => {
  let items;
  
  if (isMaterialFlow) {
    // Handle material document flow - use matched materials only
    items = Array.isArray(matchedMaterials) ? matchedMaterials : [matchedMaterials];
  } else {
    // Handle batch flow
    items = Array.isArray(batchData) 
      ? batchData.map(b => b.d || b) 
      : [batchData.d || batchData];
  }

  // Create payload with correct structure for SAP OData TransferHeaderSet
  const navItems = items.map((item, index) => ({
    ItemNo: item.ItemNo || String(index + 1).padStart(4, '0'),
    Material: item.Material || item.MATNR || item.Matnr || item.matnr || '',
    Plant: item.Plant || item.Werks || item.WERKS || item.werks || '1134',
    StgeLoc: item.StgeLoc || item.LGORT || item.Lgort || item.lgort || '3PW1',
    StgeLocTo: formData.storageLocationTo || '3PW1',
    Batch: item.Batch || item.Charg || item.charg || '',
    Quantity: parseFloat(item.Quantity || item.QTY || item.Qty || item.Quantity || item.MENGE || item.menge || '0').toFixed(3),
    EntryUom: item.Uom || item.EntryUom || item.MEINS || item.Meins || item.meins || 'KG'
  }));

  const payload = {
    Bwart: "315",
    GmCode: "04",
    TestRun: isTestRun ? "X" : "",
    ...((environment === 'prd' || environment === '300') ? { DocHeaderText: "From App" } : {}),
    NavItems: navItems
  };

  console.log('Prepared payload:', JSON.stringify(payload, null, 2));
  return payload;
};

  const handleCheck = async () => {
    await handleTransfer(true);
  };

  const handlePost = async () => {
    await handleTransfer(false);
  };

  const handleFetchAgain = () => {
    navigate('/bsp', { replace: true, state: null });
  };

  const handleTransfer = async (isTestRun) => {
    // Validate storage location before proceeding
    if (!formData.storageLocationTo.trim()) {
      setError('Storage Location To is required. Please enter a value before proceeding.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      const creds = getUserCredentials();
      if (!creds) throw new Error("User not authenticated. Please log in again.");

      const payload = preparePayload(isTestRun, creds.environment);
      
      // MIGO page should always use dev2 backend
      const apiUrl = `${apiEndpoints.dev2}/api/migo-transfer/transfer`;
      
      const headers = {
        'Content-Type': 'application/json',
        'X-User-Auth': btoa(`${creds.username}:${creds.password}`),
        'X-User-Environment': creds.environment
      };
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Transfer API Error:', errorText);
        throw new Error(`Transfer failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      if (isTestRun) {
        setTransferResult(result);
        setValidationPassed(true);
        setSuccessMessage('Validation successful! You can now post the materials.');
        setShowSuccessPopup(true);
      } else {
        // Handle successful post
        setPostSuccessData({
          documentNumber: result.d?.MatDoc || result.d?.DocumentNumber || 'N/A',
          message: result.d?.Message || result.d?.message || 'Materials posted successfully'
        });
        setShowPostSuccessPopup(true);
      }
    } catch (error) {
      console.error('Transfer error:', error);
      setError(error.message || (isTestRun ? 'Validation failed' : 'Post failed'));
      if (error.message.includes('401') || error.message.includes('authentication')) {
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate('/bsp', {
      state: {
        prefillBatches: batchData,
        prefillDocumentData: documentData,
        documentData: documentData, // Add this to match ScanPage pattern
        prefillDocumentNumber: documentData?.d?.Mblnr || documentData?.d?.DocumentNumber || ''
      }
    });
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

  if (!batchData && !materials) {
    return <div>Loading data...</div>;
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="user-info">
          <div className="user-details">
            <span className="username">{user?.username || "s.ashraf"}</span>
            <span className="server-info">
              Server {user?.server || "DEV"} • Client {user?.client || "110"}
            </span>
          </div>
          <button className="logout-btn" onClick={handleLogout}>Logout</button>
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

      <div style={{ maxWidth: "600px", margin: "20px auto", padding: "1rem" }}>
        <div style={{ background: "white", borderRadius: "12px", padding: "1.5rem", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}>
          <h2 style={{ marginTop: 0 }}>Place In Storage</h2>

          {error && <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "0.75rem", borderRadius: "8px", marginTop: "0.5rem" }}>{error}</div>}
          {successMessage && <div style={{ background: "#dcfce7", color: "#166534", padding: "0.75rem", borderRadius: "8px", marginTop: "0.5rem" }}>{successMessage}</div>}

          <div style={{ marginTop: "1rem" }}>
            <h4>Storage Location To</h4>
            <div style={{ padding: "0.75rem", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb", fontWeight: "600" }}>
              {formData.storageLocationTo || 'Auto-populated from document'}
            </div>
          </div>

          {isMaterialFlow && matchedMaterials && matchedMaterials.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <h4>Matched Batches to Post</h4>
              <div style={{ overflowX: "auto", marginTop: "0.5rem" }}>
                {matchedMaterials.map((material, index) => (
                  <div 
                    key={index} 
                    style={{ 
                      marginBottom: "1rem",
                      padding: "1rem",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                      backgroundColor: "#f0fdf4"
                    }}
                  >
                    <div style={{ display: "flex", marginBottom: "0.5rem" }}>
                      <strong style={{ minWidth: "120px" }}>Material:</strong>
                      <span>{formatMaterialNumber(material.Material || material.matnr || material.Matnr || material.matnr) || '-'}</span>
                    </div>
                    <div style={{ display: "flex", marginBottom: "0.5rem" }}>
                      <strong style={{ minWidth: "120px" }}>Description:</strong>
                      <span>{material.MatDesc || material.Maktx || material.maktx || '-'}</span>
                    </div>
                    <div style={{ display: "flex", marginBottom: "0.5rem" }}>
                      <strong style={{ minWidth: "120px" }}>Batch:</strong>
                      <span>{material.Batch || '-'}</span>
                    </div>
                    <div style={{ display: "flex" }}>
                      <strong style={{ minWidth: "120px" }}>Quantity:</strong>
                      <span>{material.Quantity || material.menge || material.Menge || '-'} {material.Uom || material.EntryUom || material.meins || material.Meins || ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showSuccessPopup && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", zIndex: 50 }}>
          <div style={{ width: "100%", maxWidth: "520px", background: "white", borderRadius: "12px", padding: "1.5rem", boxShadow: "0 10px 30px rgba(0,0,0,0.25)" }}>
            <h3 style={{ marginTop: 0 }}>Validation Successful</h3>
            <div style={{ background: "#dcfce7", color: "#166534", padding: "0.75rem", borderRadius: "8px", marginTop: "0.5rem" }}>
              Your data has been validated successfully. You can now post.
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1.25rem" }}>
              <button
                onClick={() => {
                  setShowSuccessPopup(false);
                }}
                style={{ padding: "0.85rem 2rem", background: "#6b7280", color: "#fff", border: "none", borderRadius: "8px" }}
              >
                Back
              </button>

              <button
                onClick={handlePost}
                disabled={!validationPassed || loading}
                style={{ padding: "0.85rem 2rem", background: validationPassed && !loading ? "#22c55e" : "#9ca3af", color: "#fff", border: "none", borderRadius: "8px" }}
              >
                {loading ? 'Posting...' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPostSuccessPopup && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", zIndex: 60 }}>
          <div style={{ width: "100%", maxWidth: "520px", background: "white", borderRadius: "12px", padding: "1.5rem", boxShadow: "0 10px 30px rgba(0,0,0,0.25)" }}>
            <h3 style={{ marginTop: 0 }}>Posted Successfully</h3>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: "10px", padding: "0.9rem", background: "#f9fafb" }}>
              <div style={{ fontWeight: 600, color: "#111827", marginBottom: "0.5rem" }}>Status</div>
              <div style={{ fontSize: "1.1rem", color: "#111827", fontWeight: "500" }}>
                {postSuccessData?.message || postSuccessData?.Message || 'Materials posted successfully'}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1.25rem" }}>
              <button
                onClick={handleFetchAgain}
                style={{ padding: "0.85rem 2rem", background: "#3b82f6", color: "#fff", border: "none", borderRadius: "8px" }}
              >
                Fetch Again
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ position: "fixed", bottom: "20px", left: "20px" }}>
        <button
          onClick={handleBack}
          disabled={loading}
          style={{ padding: "0.85rem 2rem", background: "#6b7280", color: "#fff", border: "none", borderRadius: "8px" }}
        >
          Back
        </button>
      </div>

      <div style={{ position: "fixed", bottom: "20px", right: "20px" }}>
        <button
          onClick={handleCheck}
          disabled={loading}
          style={{ padding: "0.85rem 2rem", background: "#3b82f6", color: "#fff", border: "none", borderRadius: "8px" }}
        >
          {loading ? 'Validating...' : 'Check'}
        </button>
      </div>
    </div>
  );
}

export default MigoPage;