const axios = require("axios");
const https = require("https");

const axiosInstance = axios.create({
  httpsAgent: new https.Agent({ rejectUnauthorized: false })
});

const SAP_CREDENTIALS = {
  dev: 'sb-14500df7-5c11-4f60-a289-951ab9b56e65!b379530|it-rt-integration-suite-q07hbh9w!b410603:e287accb-c183-4b15-abf9-36c43241f016$ftnvyFI2U3mk8bzyWY7vW4ioM2P0DvL8B5ljByzdApU=',
  prd: 'sb-f04b92a4-33b7-4e29-892f-fbeaf4016ee9!b504443|it-rt-integration-suite-prd-ud55bnea!b410603:6405857c-575d-4926-aeaf-e4af908ac1a0$UDsL31-M98T2RL8dhZ8gxN-H83axqBqiD83KGmWemTY='
};

const API_URLS = {
  dev: 'https://integration-suite-q07hbh9w.it-cpi026-rt.cfapps.eu10-002.hana.ondemand.com/http/Login',
  prd: 'https://integration-suite-prd-ud55bnea.it-cpi026-rt.cfapps.eu10-002.hana.ondemand.com/http/Login'
};

const login = async (req, res) => {
  const { username, password, environment } = req.body;

  if (!username || !password || !environment) {
    return res.status(400).json({ error: "All fields are required" });
  }

  const env = (environment === 'prd' || environment === '300') ? 'prd' : 'dev';
  const apiUrl = API_URLS[env];
  const credentials = SAP_CREDENTIALS[env];
  const authHeader = `Basic ${Buffer.from(credentials).toString('base64')}`;

  try {
    const payload = {
      I_UNAME: username,
      I_PWD: password
    };

    const response = await axiosInstance.post(apiUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      timeout: 60000,
      validateStatus: () => true
    });

    const sapResponse = response.data;
    const result = sapResponse["ns0:Z_WM_HANDHELD_LOGINResponse"];

    if (result?.E_TYPE === "S") {
      return res.status(200).json(sapResponse);
    } else {
      return res.status(401).json({
        "ns0:Z_WM_HANDHELD_LOGINResponse": {
          E_TYPE: "E",
          E_MESSAGE: result?.E_MESSAGE || "Authentication failed"
        }
      });
    }
  } catch (err) {
    console.error("Login error:", err.message);
    return res.status(500).json({
      "ns0:Z_WM_HANDHELD_LOGINResponse": {
        E_TYPE: "E",
        E_MESSAGE: "SAP authentication failed: " + (err.message || "Unknown error")
      }
    });
  }
};

module.exports = { login };