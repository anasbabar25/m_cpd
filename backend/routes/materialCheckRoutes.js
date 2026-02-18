const express = require('express');
const axios = require('axios');
const https = require('https');

// Create axios instance that ignores SSL certificate errors
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false // Ignore SSL certificate validation
  })
});

const router = express.Router();

// Base OData URL for ZMH_BATCH_INFO_SRV (e.g. https://<host>/sap/opu/odata/SAP/ZMH_BATCH_INFO_SRV)
const ODATA_BASE_URL = process.env.SAP_ODATA_BASE_URL;

// Check individual material item via OData TransferHeaderSet (TestRun = 'X')
router.post('/check', async (req, res) => {
  try {
    // Validate request body
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Material data is required'
      });
    }

    // Decode user credentials from header
    const authHeader = req.headers['x-user-auth'];
    let username, password;
    
    if (authHeader) {
      try {
        const decoded = Buffer.from(authHeader, 'base64').toString('utf-8');
        [username, password] = decoded.split(':');
      } catch (error) {
        console.error('Error decoding auth header:', error);
      }
    }

    if (!username || !password) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Valid user credentials are required'
      });
    }

    if (!ODATA_BASE_URL) {
      console.error('SAP_ODATA_BASE_URL is not configured');
      return res.status(500).json({
        error: 'Configuration error',
        message: 'SAP_ODATA_BASE_URL is not set on the server'
      });
    }

    console.log('Attempting material check via OData TransferHeaderSet');
    console.log('Source material payload:', JSON.stringify(req.body, null, 2));

    const apiUrl = `${ODATA_BASE_URL}/TransferHeaderSet?sap-client=110`;

    // Map single material to TransferHeaderSet payload with TestRun = 'X'
    const item = req.body;
    const payload = {
      Bwart: '315',
      GmCode: '04',
      TestRun: 'X',
      NavItems: [
        {
          ItemNo: item.ItemNo || '0001',
          Material: item.Material || item.MATNR || item.Matnr || item.matnr || '',
          Plant: item.Plant || item.Werks || item.WERKS || item.werks || '1134',
          StgeLoc: item.StgeLoc || item.LGORT || item.Lgort || item.lgort || '3PW1',
          StgeLocTo:
            item.StgeLocTo ||
            item.StgeLoc ||
            item.LGORT ||
            item.Lgort ||
            item.lgort ||
            '3PW1',
          Batch: item.Batch || item.Charg || item.charg || '',
          Quantity: String(
            item.Quantity ||
              item.Qty ||
              item.QTY ||
              item.MENGE ||
              item.menge ||
              '0.000'
          ),
          EntryUom: item.EntryUom || item.MEINS || item.Meins || item.meins || 'KG'
        }
      ]
    };

    console.log('Mapped TransferHeaderSet payload for check:', JSON.stringify(payload, null, 2));

    // Get CSRF token for API call
    let csrfToken;
    let cookies;
    try {
      // Fetch CSRF token from the OData service root
      const csrfResponse = await axiosInstance.head(`${ODATA_BASE_URL}?sap-client=110`, {
        headers: {
          'X-CSRF-Token': 'Fetch'
        },
        auth: {
          username: username,
          password: password
        }
      });
      
      csrfToken = csrfResponse.headers['x-csrf-token'];
      cookies = (csrfResponse.headers['set-cookie'] || [])
        .map(c => c.split(';')[0])
        .join('; ');
      
      console.log('CSRF token obtained:', csrfToken);
      console.log('Cookies obtained:', cookies);
    } catch (csrfError) {
      console.log('CSRF token fetch failed, trying without CSRF:', csrfError.message);
    }


    const headers = {
      'Content-Type': 'application/json'
    };
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    if (cookies) headers['Cookie'] = cookies;

    const response = await axiosInstance.post(apiUrl, payload, {
      headers,
      auth: { username, password }
    });

    const data = response.data;
    
    // Set CORS headers for frontend
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-User-Auth, X-User-Environment');
    
    // Forward the response
    res.status(200).json(data);
    
  } catch (error) {
    console.error('Material Check API error:', error);
    res.header('Access-Control-Allow-Origin', '*');
    
    if (error.response && error.response.status === 401) {
      res.status(401).json({ 
        error: 'Authentication failed',
        message: 'Invalid credentials for SAP system'
      });
    } else if (error.response && error.response.status === 403) {
      res.status(403).json({ 
        error: 'Access forbidden',
        message: 'CSRF token validation failed or insufficient permissions'
      });
    } else {
      res.status(500).json({ 
        error: 'Proxy server error',
        message: error.message 
      });
    }
  }
});

// Handle preflight OPTIONS requests
router.options('/check', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-User-Auth, X-User-Environment');
  res.status(200).send();
});

module.exports = router;
