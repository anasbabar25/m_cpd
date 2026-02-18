const express = require('express');
const router = express.Router();
const axios = require('axios');
const https = require('https');

/* =====================================================
   ENV CONFIG
===================================================== */
// Use only the specified API URL
const API_URL = 'https://devspace.test.apimanagement.eu10.hana.ondemand.com/cpd/pc/stg';

/* =====================================================
   HELPERS
===================================================== */
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const normalizeEnvironment = (env) => {
  if (env === '110' || env === 'dev') return 'dev';
  if (env === '300' || env === 'prd') return 'prd';
  return env;
};

const getUserFromHeaders = (req) => {
  const auth = req.headers['x-user-auth'];
  const environment = req.headers['x-user-environment'] || '110';

  if (!auth) throw new Error('User credentials required');

  const decoded = Buffer.from(auth, 'base64').toString();
  const [username, password] = decoded.split(':');

  if (!username || !password) throw new Error('Invalid user credentials');

  return { username, password, environment };
};

/* =====================================================
   DOCUMENT NUMBER EXTRACTION (DO NOT REMOVE)
===================================================== */
const extractDocumentNumber = (sapResponse) => {
  console.log('Extracting document number from:', JSON.stringify(sapResponse, null, 2));
  
  const docNumber = (
    sapResponse?.raw?.d?.Mblnr ||
    sapResponse?.data?.raw?.d?.Mblnr ||
    sapResponse?.data?.Mblnr ||
    sapResponse?.data?.MaterialDocument ||
    sapResponse?.data?.d?.Mblnr ||
    sapResponse?.data?.d?.MaterialDocument ||
    sapResponse?.data?.d?.MatDoc ||
    null
  );
  
  console.log('Extracted document number:', docNumber);
  return docNumber;
};

/* =====================================================
   CONTINUE WITH CHECK (SINGLE SAP FLOW)
===================================================== */
async function continueWithCheck(req, res, { username, password, environment, payload }) {
  try {
    const apiUrl = API_URL;
    
    // Ensure TestRun is 'X' for check operations
    payload.TestRun = 'X';
    
    let response;

    try {
      const csrfResp = await axios.head(apiUrl, {
        httpsAgent,
        auth: { username, password },
        headers: { 'X-CSRF-Token': 'Fetch' }
      });

      const csrfToken = csrfResp.headers['x-csrf-token'];
      const cookies = (csrfResp.headers['set-cookie'] || [])
        .map(c => c.split(';')[0])
        .join('; ');

      response = await axios.post(apiUrl, payload, {
        httpsAgent,
        auth: { username, password },
        headers: {
          'X-CSRF-Token': csrfToken,
          'Cookie': cookies,
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.error('API call failed in continueWithCheck:', error);
      throw error;
    }

    const documentNumber = extractDocumentNumber({ raw: response.data });

    return res.json({
      success: true,
      documentNumber,
      raw: response.data
    });

  } catch (err) {
    console.error('Error in continueWithCheck:', err);
    if (err.response) {
      console.error('Error response data:', err.response.data);
      console.error('Error response status:', err.response.status);
      console.error('Error response headers:', err.response.headers);
    }
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to process request',
      details: err.response?.data
    });
  }
}

/* =====================================================
   CONTINUE WITH POST (NO TEST RUN)
===================================================== */
async function continueWithPost(req, res, { username, password, environment, payload }) {
  try {
    const apiUrl = API_URL;
    
    // Remove TestRun for actual posting
    delete payload.TestRun;
    
    let response;

    try {
      const csrfResp = await axios.head(apiUrl, {
        httpsAgent,
        auth: { username, password },
        headers: { 'X-CSRF-Token': 'Fetch' }
      });

      const csrfToken = csrfResp.headers['x-csrf-token'];
      const cookies = (csrfResp.headers['set-cookie'] || [])
        .map(c => c.split(';')[0])
        .join('; ');

      response = await axios.post(apiUrl, payload, {
        httpsAgent,
        auth: { username, password },
        headers: {
          'X-CSRF-Token': csrfToken,
          'Cookie': cookies,
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.error('API call failed in continueWithPost:', error);
      throw error;
    }

    const documentNumber = extractDocumentNumber({ raw: response.data });

    return res.json({
      success: true,
      documentNumber,
      raw: response.data
    });

  } catch (err) {
    console.error('Error in continueWithPost:', err);
    if (err.response) {
      console.error('Error response data:', err.response.data);
      console.error('Error response status:', err.response.status);
      console.error('Error response headers:', err.response.headers);
    }
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to process request',
      details: err.response?.data
    });
  }
}

/* =====================================================
   CHECK ROUTE (ALL PAYLOAD FORMATS)
===================================================== */
router.post('/check', async (req, res) => {
  try {
    const { username, password, environment } = getUserFromHeaders(req);
    const normalizedEnv = normalizeEnvironment(environment);

    /* ---------- Iv* FORMAT ---------- */
    if (req.body.IvMatnr && req.body.IvWerks) {
      const payload = {
        Bwart: req.body.IvBwart,
        GmCode: req.body.IvGmCode,
        TestRun: req.body.IvTestRun,
        NavItems: [{
          Material: req.body.IvMatnr,
          Plant: req.body.IvWerks,
          StgeLoc: req.body.IvLgortFrom,
          StgeLocTo: req.body.IvLgortTo,
          Batch: req.body.IvCharg,
          Quantity: req.body.IvQty,
          EntryUom: req.body.IvUom,
          MoveType: req.body.IvBwart
        }]
      };

      return continueWithCheck(req, res, {
        username,
        password,
        environment: normalizedEnv,
        payload
      });
    }

    /* ---------- NavItems ---------- */
    if (Array.isArray(req.body.NavItems)) {
      return continueWithCheck(req, res, {
        username,
        password,
        environment: normalizedEnv,
        payload: req.body
      });
    }

    /* ---------- Legacy ---------- */
    const legacyPayload = {
      Bwart: req.body.movementType || '313',
      GmCode: '04',
      TestRun: 'X',
      NavItems: [{
        Material: req.body.MATNR,
        Plant: req.body.Werks,
        StgeLoc: req.body.LGORT,
        StgeLocTo: req.body.storageLocationTo,
        Batch: req.body.Charg,
        Quantity: req.body.QTY,
        EntryUom: req.body.MEINS,
        MoveType: req.body.movementType || '313'
      }]
    };

    return continueWithCheck(req, res, {
      username,
      password,
      environment: normalizedEnv,
      payload: legacyPayload
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/* =====================================================
   POST ROUTE (ACTUAL POSTING - NO TEST RUN)
===================================================== */
router.post('/post', async (req, res) => {
  try {
    const { username, password, environment } = getUserFromHeaders(req);
    const normalizedEnv = normalizeEnvironment(environment);

    /* ---------- Iv* FORMAT ---------- */
    if (req.body.IvMatnr && req.body.IvWerks) {
      const payload = {
        Bwart: req.body.IvBwart,
        GmCode: req.body.IvGmCode,
        TestRun: req.body.IvTestRun,
        NavItems: [{
          Material: req.body.IvMatnr,
          Plant: req.body.IvWerks,
          StgeLoc: req.body.IvLgortFrom,
          StgeLocTo: req.body.IvLgortTo,
          Batch: req.body.IvCharg,
          Quantity: req.body.IvQty,
          EntryUom: req.body.IvUom,
          MoveType: req.body.IvBwart
        }]
      };

      return continueWithPost(req, res, {
        username,
        password,
        environment: normalizedEnv,
        payload
      });
    }

    /* ---------- NavItems ---------- */
    if (Array.isArray(req.body.NavItems)) {
      return continueWithPost(req, res, {
        username,
        password,
        environment: normalizedEnv,
        payload: req.body
      });
    }

    /* ---------- Legacy ---------- */
    const legacyPayload = {
      Bwart: req.body.movementType || '313',
      GmCode: '04',
      TestRun: 'X',
      NavItems: [{
        Material: req.body.MATNR,
        Plant: req.body.Werks,
        StgeLoc: req.body.LGORT,
        StgeLocTo: req.body.storageLocationTo,
        Batch: req.body.Charg,
        Quantity: req.body.QTY,
        EntryUom: req.body.MEINS,
        MoveType: req.body.movementType || '313'
      }]
    };

    return continueWithPost(req, res, {
      username,
      password,
      environment: normalizedEnv,
      payload: legacyPayload
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;
