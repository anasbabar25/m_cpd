// frontend/src/pages/migoPage.js

import React, { useState, useEffect } from 'react';

import { useLocation, useNavigate } from 'react-router-dom';

import axios from 'axios';

import { getUserCredentials } from '../api';

import { apiEndpoints } from "../config/servers";



function MigoPage2({ user, onLogout }) {

  const location = useLocation();

  const navigate = useNavigate();

  const batchData = location.state?.batchData;



  const [formData, setFormData] = useState({

    storageLocationTo: ''

  });



  const [loading, setLoading] = useState(false);

  const [error, setError] = useState('');

  const [successMessage, setSuccessMessage] = useState('');

  const [validationPassed, setValidationPassed] = useState(false);

  const [transferResult, setTransferResult] = useState(null);

  const [showSuccessPopup, setShowSuccessPopup] = useState(false);

  const [showPostSuccessPopup, setShowPostSuccessPopup] = useState(false);

  const [postSuccessData, setPostSuccessData] = useState(null);

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);



  useEffect(() => {

    if (!batchData) {

      navigate('/bsp2');

      return;

    }



    // Don't auto-populate storage location - let user input it manually

    // The field will remain empty by default

  }, [batchData, navigate]);



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



  

const preparePayload = (isTestRun) => {

  const batchItems = Array.isArray(batchData) 

    ? batchData.map(b => b.d || b) 

    : [batchData.d || batchData];



  const navItems = batchItems.map((item, index) => {

    const itemNo = String((index + 1) * 10).padStart(6, '0');

    return {

      ItemNo: itemNo,

      Material: String(item.Matnr || item.MATNR || item.matnr || '').replace(/^0+/, ''),

      Plant: item.Werks || item.WERKS || '1134',

      StgeLoc: item.Lgort || item.LGORT || '',

      Batch: item.Charg || item.CHARG || '',

      Quantity: String(parseFloat(item.Qty || item.QTY || item.Quantity || '0').toFixed(3)),

      EntryUom: item.Meins || item.MEINS || 'KG',

      StgeLocTo: formData.storageLocationTo || '',

      MoveType: ''

    };

  });



  const payload = {

    Bwart: '313',

    GmCode: '04',

    TestRun: isTestRun ? 'X' : '',

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

    navigate('/bsp2', { replace: true, state: null });

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



      const payload = preparePayload(isTestRun);

      

      const baseUrl = apiEndpoints[creds.environment] || apiEndpoints.dev;

      

      // Use unified endpoints - backend handles CSRF tokens internally

      const endpoint = isTestRun ? '/api/migo/check' : '/api/migo/post';

      const response = await axios.post(`${baseUrl}${endpoint}`, payload, {

        headers: {

          'X-User-Auth': btoa(`${creds.username}:${creds.password}`),

          'X-User-Environment': creds.environment,

          'Content-Type': 'application/json'

        }

      });

      

      if (response.data.success) {

        if (isTestRun) {

          setTransferResult(response.data.data);

          setValidationPassed(true);

          setSuccessMessage('Validation successful!');

          setShowSuccessPopup(true);

        } else {

          setTransferResult(response.data);

          setShowSuccessPopup(false);

          setPostSuccessData(response.data);

          setShowPostSuccessPopup(true);

        }

      } else {

        throw new Error(response.data.error || isTestRun ? 'Validation failed' : 'Post failed');

      }

    } catch (error) {

      setError(error.response?.data?.error || error.message);

      if (error.response?.status === 401) {

        navigate('/login');

      }

    } finally {

      setLoading(false);

    }

  };



  const handleBack = () => {

    navigate('/bsp2', {

      state: {

        prefillBatches: batchData

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



  if (!batchData) {

    return <div>Loading batch data...</div>;

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

          <h2 style={{ marginTop: 0 }}>Remove from Storage</h2>



          {error && <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "0.75rem", borderRadius: "8px", marginTop: "0.5rem" }}>{error}</div>}

          {successMessage && <div style={{ background: "#dcfce7", color: "#166534", padding: "0.75rem", borderRadius: "8px", marginTop: "0.5rem" }}>{successMessage}</div>}



          <div className="form-group">

            <label>Storage Location To</label>

            <input

              type="text"

              name="storageLocationTo"

              value={formData.storageLocationTo}

              onChange={handleChange}

              className="form-control"

              required

            />

          </div>

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

              <div style={{ fontWeight: 600, color: "#111827" }}>Document Number</div>

              <div style={{ marginTop: "0.25rem", fontSize: "1.1rem", color: "#111827" }}>

                {postSuccessData?.documentNumber || '-'}

              </div>

              {(postSuccessData?.message || postSuccessData?.Message) && (

                <div style={{ marginTop: "0.75rem", color: "#374151" }}>{postSuccessData?.message || postSuccessData?.Message}</div>

              )}

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



export default MigoPage2;