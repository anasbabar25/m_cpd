const express = require('express');
const router = express.Router();
const axios = require('axios');
const https = require('https');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// Axios instance for DEV/110 only: prevent Brotli/compression negotiation.
const sapAxiosDev = axios.create({
  httpsAgent,
  headers: { 'User-Agent': 'SAP-Integration-Backend' },
  decompress: false,
  maxContentLength: 50 * 1024 * 1024,
  maxBodyLength: 50 * 1024 * 1024
});

// Defensive (DEV only): ensure we never forward any compression negotiation/encodings (e.g. br)
sapAxiosDev.interceptors.request.use((config) => {
  config.headers = config.headers || {};
  // Some upstream proxies treat Accept-Encoding values as "unsupported encodings".
  // Force identity regardless of axios/node defaults.
  config.headers['Accept-Encoding'] = 'identity';
  config.headers['accept-encoding'] = 'identity';

  delete config.headers['Content-Encoding'];
  delete config.headers['content-encoding'];
  return config;
});

// PRD/300: keep behavior unchanged (no header forcing)
const sapAxiosPrd = axios.create({
  httpsAgent,
  headers: { 'User-Agent': 'SAP-Integration-Backend' },
  maxContentLength: 50 * 1024 * 1024,
  maxBodyLength: 50 * 1024 * 1024
});

const SAP_ODATA = {
  dev: {
    baseUrl: 'https://devspace.test.apimanagement.eu10.hana.ondemand.com/plc/stg',
    transferPath: '/TransferHeaderSet'
  },
  prd: {
    baseUrl: 'https://prdspace.prod01.apimanagement.eu10.hana.ondemand.com:443/plc/stg',
    transferPath: '/TransferHeaderSet'
  }
};

const normalizeEnvironment = (env) => {
  if (env === '110' || env === 'dev') return 'dev';
  if (env === '300' || env === 'prd') return 'prd';
  return 'dev';
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

const extractDocumentNumber = (sapResponse) => {
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

async function callSapApi(env, payload, username, password) {
  const { baseUrl, transferPath } = SAP_ODATA[env] || SAP_ODATA.dev;
  const transferUrl = `${baseUrl}${transferPath}`;
  const sapClient = env === 'prd' ? '300' : '110';
  const http = env === 'prd' ? sapAxiosPrd : sapAxiosDev;

  // Fetch CSRF token from service root to avoid 4xx on entity set
  const csrfResp = await http.head(`${baseUrl}/`, {
    auth: { username, password },
    params: { 'sap-client': sapClient },
    headers: { 
      'X-CSRF-Token': 'Fetch',
    }
  });

  const csrfToken = csrfResp.headers['x-csrf-token'];
  const cookies = (csrfResp.headers['set-cookie'] || [])
    .map(c => c.split(';')[0])
    .join('; ');

  const response = await http.post(transferUrl, payload, {
    auth: { username, password },
    params: { 'sap-client': sapClient },
    headers: {
      'X-CSRF-Token': csrfToken,
      'Cookie': cookies,
      'Content-Type': 'application/json',
    }
  });

  return response;
}

async function continueWithCheck(req, res, { username, password, environment, payload }) {
  try {
    console.log(`[${environment.toUpperCase()}] Check URL:`, `${SAP_ODATA[environment]?.baseUrl || SAP_ODATA.dev.baseUrl}${SAP_ODATA[environment]?.transferPath || SAP_ODATA.dev.transferPath}`);
    payload.TestRun = 'X';
    const response = await callSapApi(environment, payload, username, password);
    const documentNumber = extractDocumentNumber({ raw: response.data });
    return res.json({ success: true, documentNumber, raw: response.data });
  } catch (err) {
    console.error('Error in continueWithCheck:', err.response?.data || err.message);
    return res.status(500).json({ success: false, error: err.message, details: err.response?.data });
  }
}

async function continueWithPost(req, res, { username, password, environment, payload }) {
  try {
    console.log(`[${environment.toUpperCase()}] Post URL:`, `${SAP_ODATA[environment]?.baseUrl || SAP_ODATA.dev.baseUrl}${SAP_ODATA[environment]?.transferPath || SAP_ODATA.dev.transferPath}`);
    delete payload.TestRun;
    const response = await callSapApi(environment, payload, username, password);
    const documentNumber = extractDocumentNumber({ raw: response.data });
    return res.json({ success: true, documentNumber, raw: response.data });
  } catch (err) {
    console.error('Error in continueWithPost:', err.response?.data || err.message);
    return res.status(500).json({ success: false, error: err.message, details: err.response?.data });
  }
}

const buildPayload = (body) => {
  const docHeaderText =
    typeof body?.DocHeaderText === 'string' && body.DocHeaderText.trim()
      ? body.DocHeaderText.trim().slice(0, 25)
      : undefined;

  // If the frontend sends the new format with NavItems array, use it directly
  if (Array.isArray(body.NavItems) && body.NavItems.length > 0) {
    return {
      Bwart: body.Bwart || '313',
      GmCode: body.GmCode || '04',
      TestRun: body.TestRun || '',
      ...(docHeaderText ? { DocHeaderText: docHeaderText } : {}),
      NavItems: body.NavItems
    };
  }
  
  // Legacy support for single item format
  if (body.IvMatnr && body.IvWerks) {
    return {
      Bwart: body.IvBwart || '313',
      GmCode: body.IvGmCode || '04',
      TestRun: body.IvTestRun || '',
      ...(docHeaderText ? { DocHeaderText: docHeaderText } : {}),
      NavItems: [{
        Material: body.IvMatnr,
        Plant: body.IvWerks,
        StgeLoc: body.IvLgortFrom,
        StgeLocTo: body.IvLgortTo,
        Batch: body.IvCharg,
        Quantity: body.IvQty,
        EntryUom: body.IvUom,
        MoveType: body.IvBwart || '313'
      }]
    };
  }
  
  // Fallback for old format
  return {
    Bwart: body.movementType || '313',
    GmCode: '04',
    TestRun: 'X',
    ...(docHeaderText ? { DocHeaderText: docHeaderText } : {}),
    NavItems: [{
      Material: body.MATNR,
      Plant: body.Werks,
      StgeLoc: body.LGORT,
      StgeLocTo: body.storageLocationTo,
      Batch: body.Charg,
      Quantity: body.QTY,
      EntryUom: body.MEINS,
      MoveType: body.movementType || '313'
    }]
  };
};

router.post('/check', async (req, res) => {
  try {
    const { username, password, environment } = getUserFromHeaders(req);
    const normalizedEnv = normalizeEnvironment(environment);
    const payload = buildPayload(req.body);
    return continueWithCheck(req, res, { username, password, environment: normalizedEnv, payload });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/post', async (req, res) => {
  try {
    const { username, password, environment } = getUserFromHeaders(req);
    const normalizedEnv = normalizeEnvironment(environment);
    const payload = buildPayload(req.body);
    return continueWithPost(req, res, { username, password, environment: normalizedEnv, payload });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;