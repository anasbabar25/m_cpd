const express = require('express');
const axios = require('axios');
const https = require('https');

const axiosInstance = axios.create({
  httpsAgent: new https.Agent({ rejectUnauthorized: false })
});

const router = express.Router();

const BASE_URLS = {
  dev: 'https://devspace.test.apimanagement.eu10.hana.ondemand.com/plc/stg',
  prd: 'https://prdspace.prod01.apimanagement.eu10.hana.ondemand.com:443/1/rmv/stg'
};

router.post('/fetch', async (req, res) => {
  try {
    console.log('Material Doc API request received:', JSON.stringify(req.body, null, 2));

    const body = req.body || {};
    const hasMaterialNumber = !!body.materialNumber;
    const hasSapDocNumber = !!body.Mblnr;

    if (!hasMaterialNumber && !hasSapDocNumber) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Document number is required'
      });
    }

    const authHeader = req.headers['x-user-auth'];
    const environmentHeader = req.headers['x-user-environment'] || 'dev';
    const env = (environmentHeader === 'prd' || environmentHeader === '300') ? 'prd' : 'dev';

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

    const mblnr = body.Mblnr || body.materialNumber;
    const mjahr = body.Mjahr || body.MJAHR || new Date().getFullYear().toString();

    const baseUrl = BASE_URLS[env];
    const apiUrl = `${baseUrl}/RefHeaderSet(Mblnr='${encodeURIComponent(mblnr)}',Mjahr='${encodeURIComponent(mjahr)}')?$expand=RefItemSet`;

    console.log(`[${env.toUpperCase()}] Material Doc API URL:`, apiUrl);

    let csrfToken, cookies;
    try {
      const csrfResponse = await axiosInstance.head(`${baseUrl}/`, {
        headers: { 'X-CSRF-Token': 'Fetch' },
        auth: { username, password }
      });
      csrfToken = csrfResponse.headers['x-csrf-token'];
      cookies = (csrfResponse.headers['set-cookie'] || [])
        .map(c => c.split(';')[0])
        .join('; ');
      console.log('CSRF token obtained:', csrfToken);
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

    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-User-Auth, X-User-Environment');

    res.status(200).json(response.data);

  } catch (error) {
    console.error('Material Doc API error:', error);
    res.header('Access-Control-Allow-Origin', '*');

    if (error.response?.status === 401) {
      res.status(401).json({ error: 'Authentication failed', message: 'Invalid credentials for SAP system' });
    } else if (error.response?.status === 403) {
      res.status(403).json({ error: 'Access forbidden', message: 'CSRF token validation failed or insufficient permissions' });
    } else if (error.response?.status === 400) {
      res.status(400).json({ error: 'Bad request', message: 'Invalid request format or parameters', details: error.response.data });
    } else {
      res.status(500).json({ error: 'Proxy server error', message: error.message });
    }
  }
});

router.options('/fetch', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-User-Auth, X-User-Environment');
  res.status(200).send();
});

module.exports = router;