const express = require('express');

const router = express.Router();

const axios = require('axios');

const https = require('https');



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



const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const sapHttp = axios.create({

  httpsAgent,

  headers: {

    'User-Agent': 'SAP-Integration-Backend'

  },

  maxContentLength: 50 * 1024 * 1024,

  maxBodyLength: 50 * 1024 * 1024

});

sapHttp.interceptors.request.use((config) => {

  config.headers = config.headers || {};

  config.headers['Accept-Encoding'] = 'identity';

  config.headers['accept-encoding'] = 'identity';

  delete config.headers['Content-Encoding'];

  delete config.headers['content-encoding'];

  return config;

});



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



async function callSapApi(environment, payload, username, password) {

  const cfg = SAP_ODATA[environment] || SAP_ODATA.dev;

  const sapClient = environment === 'prd' ? '300' : '110';

  const transferUrl = `${cfg.baseUrl}${cfg.transferPath}`;

  const csrfResp = await sapHttp.head(`${cfg.baseUrl}/`, {

    auth: { username, password },

    params: { 'sap-client': sapClient },

    headers: { 'X-CSRF-Token': 'Fetch' }

  });

  const csrfToken = csrfResp.headers['x-csrf-token'];

  const cookies = (csrfResp.headers['set-cookie'] || [])

    .map(c => c.split(';')[0])

    .join('; ');

  const response = await sapHttp.post(transferUrl, payload, {

    auth: { username, password },

    params: { 'sap-client': sapClient },

    headers: {

      'X-CSRF-Token': csrfToken,

      'Cookie': cookies,

      'Content-Type': 'application/json'

    }

  });

  return response;

}



async function continueWithCheck(req, res, { username, password, environment, payload }) {

  try {

    const cfg = SAP_ODATA[environment] || SAP_ODATA.dev;

    console.log(`[${environment.toUpperCase()}] Check URL:`, `${cfg.baseUrl}${cfg.transferPath}`);

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

    const cfg = SAP_ODATA[environment] || SAP_ODATA.dev;

    console.log(`[${environment.toUpperCase()}] Post URL:`, `${cfg.baseUrl}${cfg.transferPath}`);

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

  if (body.IvMatnr && body.IvWerks) {

    return {

      Bwart: body.IvBwart,

      GmCode: body.IvGmCode,

      TestRun: body.IvTestRun,

      NavItems: [{

        Material: body.IvMatnr,

        Plant: body.IvWerks,

        StgeLoc: body.IvLgortFrom,

        StgeLocTo: body.IvLgortTo,

        Batch: body.IvCharg,

        Quantity: body.IvQty,

        EntryUom: body.IvUom,

        MoveType: body.IvBwart

      }]

    };

  }

  if (Array.isArray(body.NavItems)) return body;

  return {

    Bwart: body.movementType || '313',

    GmCode: '04',

    TestRun: 'X',

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