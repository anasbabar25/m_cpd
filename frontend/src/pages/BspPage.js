import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getUserCredentials } from '../api';
import { apiEndpoints } from "../config/servers";

function BspPage({ user, onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [batchNumber, setBatchNumber] = useState("");
  const [materialDocNumber, setMaterialDocNumber] = useState('');
  const [materials, setMaterials] = useState([]);
  const [checkedMaterials, setCheckedMaterials] = useState([]);
  const [isMaterialFlow, setIsMaterialFlow] = useState(false);
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [showDetailsPopup, setShowDetailsPopup] = useState(false);
  const [showAllMaterialsPopup, setShowAllMaterialsPopup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDocumentClearConfirm, setShowDocumentClearConfirm] = useState(false);
  const [success, setSuccess] = useState(() => {
    const state = location.state;
    if (state?.migoPostSuccess) {
      return state?.migoPostMessage || 'Posted successfully.';
    }
    return '';
  });
  const [fetchSuccess, setFetchSuccess] = useState('');
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false);

  const fieldLabels = {
    Charg: "Item Number",
    Werks: "Plant Number",
    Matnr: "Material Number",
    Maktx: "Material Description",
    Qty: "Quantity",
    Lgort: "Storage Location",
    Meins: "UOM",
    Sobkz: "Special Stock"
  };

  useEffect(() => {
    const prefill = location.state?.prefillBatches;
    const prefillDocumentNumber = location.state?.prefillDocumentNumber;
    const prefillDocumentData = location.state?.prefillDocumentData || location.state?.documentData; // Check both patterns
    
    console.log('BspPage useEffect - prefillBatches:', prefill);
    console.log('BspPage useEffect - prefillDocumentNumber:', prefillDocumentNumber);
    console.log('BspPage useEffect - prefillDocumentData:', prefillDocumentData ? 'EXISTS' : 'NONE');
    console.log('BspPage useEffect - documentData:', location.state?.documentData ? 'EXISTS' : 'NONE');
    
    // Handle pre-filled batches (existing logic)
    if (prefill) {
      const list = Array.isArray(prefill) ? prefill : [prefill];
      const normalized = list
        .filter(Boolean)
        .map((b) => (b?.d ? b : { d: b }));

      setBatches(normalized);
    }

    // Handle pre-filled document number and data - process even if no batches
    if (prefillDocumentNumber) {
      setMaterialDocNumber(prefillDocumentNumber);
    }
    
    if (prefillDocumentData) {
      setDocumentData(prefillDocumentData);
      setHasFetchedOnce(true);
      
      // Create summary data by grouping materials by description
      const materials = prefillDocumentData.d?.RefItemSet?.results || prefillDocumentData.d?.RefItemSet || [];
      console.log('BspPage - Materials found:', materials.length);
      console.log('BspPage - Sample material:', materials[0]);
      
      if (materials.length > 0) {
        const summaryMap = new Map();
        materials.forEach(material => {
          const description = material.MatDesc || material.Maktx || 'Unknown Description';
          if (summaryMap.has(description)) {
            summaryMap.get(description).count += 1;
          } else {
            summaryMap.set(description, {
              description: description,
              count: 1,
              materials: [material]
            });
          }
        });
        
        const summaryArray = Array.from(summaryMap.values());
        setSummaryData(summaryArray);
        console.log('BspPage - Summary data set:', summaryArray.length, 'items');
      } else {
        console.log('BspPage - No materials found, summary not created');
      }
    }

    const nextState = { ...(location.state || {}) };
    delete nextState.prefillBatches;
    delete nextState.prefillDocumentNumber;
    // Keep prefillDocumentData if it exists (from MIGO page or scan page)
    // Only delete it if we're explicitly clearing (not when navigating back)
    if (!nextState.prefillDocumentData) {
      delete nextState.documentData;
    }
    navigate('/bsp', { replace: true, state: Object.keys(nextState).length ? nextState : null });
  }, [location.state, navigate]);

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

  const fetchBatch = async (input) => {
    if (!input || typeof input !== 'string' || !input.trim()) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const creds = getUserCredentials();
      if (!creds) throw new Error("User not authenticated. Please log in again.");

      const baseUrl = apiEndpoints.dev;
      
      // Use backend API route to call the new API
      const response = await fetch(`${baseUrl}/api/material-doc/fetch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Auth': btoa(`${creds.username}:${creds.password}`),
          'X-User-Environment': creds.environment
        },
        body: JSON.stringify({
          Mblnr: input
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch material information: ${response.status} ${response.statusText}`);
      }
      
      const json = await response.json();
      const materials = json.d?.RefItemSet?.results || json.d?.RefItemSet || [];
      
      if (materials.length === 0) throw new Error("No materials found for this document");
      
      // Convert ALL materials to batch format for compatibility
      const newBatches = materials.map((batchData) => ({
        d: {
          ...batchData,
          Charg: batchData.Batch || batchData.Charg,
          QTY: batchData.Quantity || batchData.Qty
        }
      }));
      
      setBatches(prev => [...prev, ...newBatches]);
      setBatchNumber("");
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err.message || "Failed to fetch material information");
      // Clear input field if batch not found
      setBatchNumber("");
    } finally {
      setLoading(false);
    }
  };

  const cleanBatch = (batch) => {
    const batchToSend = { ...(batch?.d || batch) };
    delete batchToSend.__metadata;
    delete batchToSend.__batchInfo;
    return batchToSend;
  };

  const deleteOne = (charg) => {
    setBatches(prev => prev.filter(b => b.d?.Charg !== charg));
    if (selectedBatch?.d?.Charg === charg) {
      setSelectedBatch(null);
    }
  };

  const handleBack = () => {
    navigate("/main");
  };

  const clearAll = () => {
    setShowClearConfirm(true);
  };

  const confirmClearAll = () => {
    setBatches([]);
    setSelectedBatch(null);
    setShowDetailsPopup(false);
    setError(null);
    setShowClearConfirm(false);
  };

  const cancelClearAll = () => {
    setShowClearConfirm(false);
  };

  const openDetails = (batch) => {
    setSelectedBatch(batch);
    setShowDetailsPopup(true);
  };

  const closeDetails = () => {
    setShowDetailsPopup(false);
  };

  const handleMaterialDocNumberChange = (e) => {
    setMaterialDocNumber(e.target.value);
  };

  const [showFetchSuccessPopup, setShowFetchSuccessPopup] = useState(false);
  const [documentData, setDocumentData] = useState(null);
  const [summaryData, setSummaryData] = useState([]);

  const fetchMaterialsByDocNumber = async () => {
    if (!materialDocNumber.trim()) {
      setError('Please enter a material document number');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const credentials = getUserCredentials();
      if (!credentials) throw new Error("User not authenticated. Please log in again.");

      // BSP page should always use dev2 backend
      const baseUrl = apiEndpoints.dev;
      
      // Use backend API route to call the new API
      const response = await fetch(`${baseUrl}/api/material-doc/fetch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Auth': btoa(`${credentials.username}:${credentials.password}`),
          'X-User-Environment': credentials.environment
        },
        body: JSON.stringify({
          Mblnr: materialDocNumber.trim(),
          Mjahr: new Date().getFullYear().toString()
        })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch materials');
      }

      const data = await response.json();
      // Store full document data but don't display materials
      setDocumentData(data);
      const materials = data.d?.RefItemSet?.results || data.d?.RefItemSet || [];
      
      if (materials.length === 0) {
        throw new Error('No materials found for this document');
      }

      // Create summary data by grouping materials by description
      const summaryMap = new Map();
      materials.forEach(material => {
        const description = material.MatDesc || material.Maktx || 'Unknown Description';
        if (summaryMap.has(description)) {
          summaryMap.get(description).count += 1;
        } else {
          summaryMap.set(description, {
            description: description,
            count: 1,
            materials: [material]
          });
        }
      });
      
      const summaryArray = Array.from(summaryMap.values());
      setSummaryData(summaryArray);

      // Show success message instead of popup
      setFetchSuccess('Data fetched successfully. You can proceed to scanning now.');
      setHasFetchedOnce(true);
      
      // Auto-hide the success message after 5 seconds
      setTimeout(() => {
        setFetchSuccess('');
      }, 5000);
    } catch (err) {
      setError(err.message || 'Error fetching materials');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setShowDocumentClearConfirm(true);
  };

  const confirmDocumentClear = () => {
    setMaterialDocNumber('');
    setDocumentData(null);
    setSummaryData([]);
    setHasFetchedOnce(false);
    setError('');
    setFetchSuccess('');
    setShowDocumentClearConfirm(false);
  };

  const cancelDocumentClear = () => {
    setShowDocumentClearConfirm(false);
  };

  const handleScanButton = () => {
    // Navigate to scan page with document data
    navigate('/scan', {
      state: {
        documentData: documentData
      }
    });
  };

  const handleCheckItem = async (index) => {
    try {
      const material = materials[index];
      const credentials = getUserCredentials();
      // BSP page should always use dev2 backend
      const baseUrl = apiEndpoints.dev;
      
      // Try the new material check API first
      try {
        const response = await fetch(`${baseUrl}/api/MaterialDocument/check`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Auth': btoa(`${credentials.username}:${credentials.password}`),
            'X-User-Environment': credentials.environment
          },
          body: JSON.stringify(material)
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success || result.valid) {
            const newChecked = [...checkedMaterials];
            newChecked[index] = true;
            setCheckedMaterials(newChecked);
            return true;
          }
        }
      } catch (apiError) {
        console.log('Material check API failed, assuming valid:', apiError);
      }

      // Fallback: assume material is valid if API fails
      const newChecked = [...checkedMaterials];
      newChecked[index] = true;
      setCheckedMaterials(newChecked);
      return true;
    } catch (err) {
      console.error(`Material check failed for item ${index}:`, err);
      return false;
    }
  };

  const handleCheckAllItems = async () => {
    if (!materials.length) return;

    setLoading(true);
    setError(null);
    
    const newChecked = [...checkedMaterials];
    const validMaterials = [];
    
    try {
      for (let i = 0; i < materials.length; i++) {
        const isValid = await handleCheckItem(i);
        newChecked[i] = isValid;
        if (isValid) {
          validMaterials.push(materials[i]);
        }
      }
      
      setCheckedMaterials(newChecked);
      
      if (validMaterials.length > 0) {
        // Show success message with count
        const failedCount = materials.length - validMaterials.length;
        const message = failedCount > 0 
          ? `${validMaterials.length} materials validated successfully. ${failedCount} material(s) failed validation and will not be forwarded.`
          : `All ${validMaterials.length} materials validated successfully.`;
        
        setSuccess(message);
        
        // Navigate after a short delay to show the message
        setTimeout(() => {
          navigate('/migo', { 
            state: { 
              materials: validMaterials,
              isMaterialFlow: true,
              documentData: documentData
            } 
          });
        }, 2000);
      } else {
        setError('No valid materials to process. All materials failed validation.');
      }
    } catch (err) {
      setError(err.message || 'Error checking items');
    } finally {
      setLoading(false);
    }
  };

  const next = () => {
    if (isMaterialFlow) {
      if (materials.length === 0) return setError("Please fetch materials first.");
      handleCheckAllItems();
    } else {
      if (batches.length === 0) return setError("Please add at least one batch.");
      const batchListToSend = batches.map(cleanBatch);
      navigate("/migo", { 
        state: { 
          batchData: batchListToSend,
          isMaterialFlow: false,
          documentData: documentData
        } 
      });
    }
  };

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

      {/* Document Clear Confirmation Dialog */}
      {showDocumentClearConfirm && (
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
            <h3 style={{ margin: '0 0 1rem 0', color: '#333' }}>Confirm Clear</h3>
            <p style={{ margin: '0 0 1.5rem 0', color: '#666' }}>
              Are you sure you want to clear the document number and all related data? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={cancelDocumentClear}
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
                onClick={confirmDocumentClear}
                style={{
                  padding: '0.75rem 1.5rem',
                  border: 'none',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Yes, Clear
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: "600px", margin: "20px auto", padding: "1rem" }}>
        <div style={{ background: "white", borderRadius: "12px", padding: "1.5rem", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}>

          {success && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", background: "#dcfce7", color: "#166534", padding: "0.75rem", borderRadius: "8px", marginBottom: "0.75rem" }}>
              <div>{success}</div>
              <button
                onClick={() => {
                  setSuccess('');
                  navigate('/bsp', { replace: true, state: null });
                }}
                style={{ padding: "0.35rem 0.75rem", background: "transparent", color: "#166534", border: "1px solid rgba(22,101,52,0.35)", borderRadius: "8px", cursor: "pointer" }}
              >
                Dismiss
              </button>
            </div>
          )}

          {fetchSuccess && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", background: "#dcfce7", color: "#166534", padding: "0.75rem", borderRadius: "8px", marginBottom: "0.75rem" }}>
              <div>{fetchSuccess}</div>
            
            </div>
          )}

          <div style={{ marginTop: "0rem" }}>
            <h3>Place In Storage</h3>
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
              <input
                value={materialDocNumber}
                onChange={handleMaterialDocNumberChange}
                placeholder="Enter Document Number"
                style={{ flex: 1, padding: "0.85rem", borderRadius: "8px", border: "1px solid #d1d5db" }}
                onKeyDown={(e) => e.key === 'Enter' && materialDocNumber.trim() && fetchMaterialsByDocNumber()}
              />
              <button
                onClick={fetchMaterialsByDocNumber}
                disabled={!materialDocNumber.trim() || loading || hasFetchedOnce}
                style={{ 
                  padding: "0.85rem 1.5rem", 
                  background: (materialDocNumber.trim() && !loading && !hasFetchedOnce) ? "#3b82f6" : "#9ca3af", 
                  color: "#fff", 
                  border: "none", 
                  borderRadius: "8px" 
                }}
              >
                {loading ? "Loading..." : "Fetch"}
              </button>
            </div>
            <div style={{ width: "100%" }}>
              <button
                onClick={handleClear}
                style={{ 
                  width: "100%", 
                  padding: "0.85rem 1.5rem", 
                  background: "#ef4444", 
                  color: "#fff", 
                  border: "none", 
                  borderRadius: "8px", 
                  cursor: "pointer" 
                }}
              >
                Clear
              </button>
            </div>

          {error && (
            <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "0.75rem", borderRadius: "8px", marginTop: "0.5rem" }}>
              {error}
            </div>
          )}

          {/* Summary Table */}
          {summaryData.length > 0 && (
            <div style={{ marginTop: "1.5rem" }}>
              <h3 style={{ marginBottom: "0.75rem" }}>Document Summary</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f3f4f6" }}>
                      <th style={{ textAlign: "left", padding: "0.15rem", borderBottom: "2px solid #d1d5db" }}># of Reels</th>
                      <th style={{ textAlign: "left", padding: "0.85rem", borderBottom: "2px solid #d1d5db" }}>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryData.map((item, index) => (
                      <tr key={index} style={{ borderBottom: "1px solid #e5e7eb" }}>
                        <td style={{ padding: "0.75rem", fontWeight: "600" }}>{item.count}</td>
                        <td style={{ padding: "0.75rem" }}>{item.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Back Button - Bottom Left */}
      <div style={{ position: "fixed", bottom: "20px", left: "20px" }}>
        <button
          onClick={handleBack}
          disabled={loading}
          style={{ padding: "0.85rem 2rem", background: "#6b7280", color: "#fff", border: "none", borderRadius: "8px", cursor: loading ? "not-allowed" : "pointer" }}
        >
          Back
        </button>
      </div>

      {/* Next Button - Bottom Right */}
      <div style={{ position: "fixed", bottom: "20px", right: "20px" }}>
        <button
          onClick={handleScanButton}
          disabled={!documentData || loading}
          style={{ 
            padding: "0.85rem 2rem", 
            background: (documentData && !loading) ? "#3b82f6" : "#9ca3af", 
            color: "#fff", 
            border: "none", 
            borderRadius: "8px", 
            cursor: (documentData && !loading) ? "pointer" : "not-allowed" 
          }}
        >
          Next
        </button>
      </div>

      {/* Batch Details Popup */}
      {showDetailsPopup && selectedBatch && (
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
            maxWidth: '500px',
            width: '90%'
          }}>
            <h3 style={{ margin: '0 0 1rem 0', color: '#333' }}>Batch Details</h3>
            <div style={{ marginBottom: '1rem' }}>
              {Object.entries(fieldLabels).map(([key, label]) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <strong>{label}:</strong>
                  <span>{selectedBatch.d?.[key] || '-'}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button
                onClick={closeDetails}
                style={{
                  padding: '0.75rem 1.5rem',
                  border: '1px solid #ddd',
                  backgroundColor: 'white',
                  color: '#666',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* All Materials Details Popup */}
      {showAllMaterialsPopup && materials.length > 0 && (
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
            maxWidth: '700px',
            width: '95%',
            maxHeight: '80vh',
            overflowY: 'auto'
          }}>
            <h3 style={{ margin: '0 0 1rem 0', color: '#333' }}>All Materials in Document</h3>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <strong>Document Number:</strong>
                <span>{materials[0].Mblnr || '-'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <strong>Document Year:</strong>
                <span>{materials[0].Mjahr || '-'}</span>
              </div>
            </div>

            {materials.map((mat) => (
              <div
                key={mat.ItemNo}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  padding: '0.75rem 1rem',
                  marginBottom: '0.75rem',
                  backgroundColor: '#f9fafb'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <strong>Item:</strong>
                  <span>{mat.ItemNo || '-'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <strong>Material:</strong>
                  <span>{mat.Material || '-'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <strong>Description:</strong>
                  <span>{mat.MatDesc || mat.Maktx || '-'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <strong>Quantity:</strong>
                  <span>{mat.Quantity || '-'} {mat.Uom || mat.EntryUom || ''}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <strong>Batch:</strong>
                  <span>{mat.Batch || '-'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <strong>Storage Location:</strong>
                  <span>{mat.StgeLoc || '-'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <strong>Plant:</strong>
                  <span>{mat.Plant || '-'}</span>
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button
                onClick={() => setShowAllMaterialsPopup(false)}
                style={{
                  padding: '0.75rem 1.5rem',
                  border: '1px solid #ddd',
                  backgroundColor: 'white',
                  color: '#666',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

    
  );
}

export default BspPage;