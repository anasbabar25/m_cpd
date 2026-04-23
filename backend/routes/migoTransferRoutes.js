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

// BSP page GET request
router.get('/transfer', async (req, res) => {
  try {
    console.log('BSP Page GET request received');
    
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

    // Use only specified API URL
    const apiUrl = 'https://devspace.test.apimanagement.eu10.hana.ondemand.com/cpd/pc/stg';

    console.log('Attempting BSP GET request to:', apiUrl);

    // Make GET request to the API
    const response = await axiosInstance.get(apiUrl, {
      auth: { username, password },
      headers: {
        'X-User-Environment': req.headers['x-user-environment']
      }
    });

    const data = response.data;
    
    // Set CORS headers for frontend
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-User-Auth, X-User-Environment');
    
    // Forward response
    res.status(200).json(data);
    
  } catch (error) {
    console.error('BSP GET API error:', error);
    res.header('Access-Control-Allow-Origin', '*');
    
    if (error.response && error.response.status === 401) {
      res.status(401).json({ 
        error: 'Authentication failed',
        message: 'Invalid credentials for SAP system'
      });
    } else {
      res.status(500).json({ 
        error: 'Proxy server error',
        message: error.message 
      });
    }
  }
});


// MIGO transfer POST request (API TransferHeaderSet)
router.post('/transfer', async (req, res) => {
  try {
    console.log('MIGO Transfer API request received:', JSON.stringify(req.body, null, 2));
    
    // Validate request body
    if (!req.body || !req.body.NavItems || !Array.isArray(req.body.NavItems)) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Transfer data with NavItems array is required'
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

    
    // Use the new API endpoint for transfer
   const environmentHeader = req.headers['x-user-environment'] || 'dev';
const env = (environmentHeader === 'prd' || environmentHeader === '300') ? 'prd' : 'dev';
const apiUrl = env === 'prd'
  ? 'https://prdspace.prod01.apimanagement.eu10.hana.ondemand.com:443/plc/stg/TransferHeaderSet'
  : 'https://devspace.test.apimanagement.eu10.hana.ondemand.com/plc/stg/TransferHeaderSet';
    console.log('Attempting transfer to:', apiUrl);

    // Get CSRF token for API call
    let csrfToken;
    let cookies;
    try {
      // Fetch CSRF token from the API service root
      const csrfBaseUrl = env === 'prd'
  ? 'https://prdspace.prod01.apimanagement.eu10.hana.ondemand.com:443/plc/stg'
  : 'https://devspace.test.apimanagement.eu10.hana.ondemand.com/plc/stg';
      const csrfResponse = await axiosInstance.head(`${csrfBaseUrl}/`, {
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

    const headers = {
      'Content-Type': 'application/json'
    };
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    if (cookies) headers['Cookie'] = cookies;

    const response = await axiosInstance.post(apiUrl, req.body, {
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
    console.error('MIGO Transfer API error:', error);
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
router.options('/transfer', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-User-Auth, X-User-Environment');
  res.status(200).send();
});

module.exports = router;
