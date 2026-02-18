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


// Get materials by document number (via API RefHeaderSet)
router.post('/fetch', async (req, res) => {
  try {
    console.log('Material Doc API request received:', JSON.stringify(req.body, null, 2));
    
    // Validate request body
    // Accept either the generic "materialNumber" field or the SAP-style "Mblnr" (material document number)
    const body = req.body || {};
    const hasMaterialNumber = !!body.materialNumber;
    const hasSapDocNumber = !!body.Mblnr;

    if (!hasMaterialNumber && !hasSapDocNumber) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Document number is required'
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

    
    // Build OData key: Mblnr (required) + year (Mjahr) - both are key fields
    const mblnr = body.Mblnr || body.materialNumber;
    const mjahr = body.Mjahr || body.MJAHR || new Date().getFullYear().toString();

    // Use the new API endpoint for fetching document data
    const apiUrl = `https://devspace.test.apimanagement.eu10.hana.ondemand.com/plc/stg/RefHeaderSet(Mblnr='${encodeURIComponent(mblnr)}',Mjahr='${encodeURIComponent(mjahr)}')?$expand=RefItemSet`;

    console.log('Material Doc API URL:', apiUrl);

    // Get CSRF token for API call
    let csrfToken;
    let cookies;
    try {
      // Fetch CSRF token from the API service root
      const csrfResponse = await axiosInstance.head('https://devspace.test.apimanagement.eu10.hana.ondemand.com/plc/stg/', {
        headers: {
          'X-CSRF-Token': 'Fetch',
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

    const headers = {};
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    if (cookies) headers['Cookie'] = cookies;

    const response = await axiosInstance.get(apiUrl, {
      headers,
      auth: { username, password },
      timeout: 30000,
      validateStatus: () => true
    });

    const data = response.data;
    
    // Set CORS headers for frontend
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-User-Auth, X-User-Environment');
    
    // Forward the response
    res.status(200).json(data);
    
  } catch (error) {
    console.error('Material Doc API error:', error);
    res.header('Access-Control-Allow-Origin', '*');

    if (error.response) {
      console.error('Upstream status:', error.response.status);
      console.error('Upstream headers:', JSON.stringify(error.response.headers, null, 2));
      console.error('Upstream body:', JSON.stringify(error.response.data, null, 2));
    }
    
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
    } else if (error.response && error.response.status === 400) {
      // Log the actual error response from the API
      console.error('API 400 Error Response:', JSON.stringify(error.response.data, null, 2));
      console.error('API 400 Error Status:', error.response.status);
      console.error('API 400 Error Headers:', JSON.stringify(error.response.headers, null, 2));
      
      res.status(400).json({ 
        error: 'Bad request',
        message: 'Invalid request format or parameters',
        details: error.response.data
      });
    } else if (error.response && error.response.status === 501) {
      res.status(501).json({
        error: 'Not implemented',
        message: 'APIM endpoint does not implement this request type (method/path/payload) for this URL',
        details: error.response.data
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
router.options('/fetch', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-User-Auth, X-User-Environment');
  res.status(200).send();
});

module.exports = router;
