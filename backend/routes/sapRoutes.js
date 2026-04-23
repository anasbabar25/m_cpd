const express = require("express");
const axios = require("axios");
const https = require("https");
 
const router = express.Router();
 
/* =====================================================
   CONFIG
===================================================== */
 
// Use only the specified API URL
const API_URL_DEV = "https://devspace.test.apimanagement.eu10.hana.ondemand.com/cpd/pc/stg";
const API_URL_PRD = "https://prdspace.prod01.apimanagement.eu10.hana.ondemand.com:443/grp/batch";
 
const SAP_USER = process.env.SAP_USER;
const SAP_PASS = process.env.SAP_PASS;
 
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
 
const SAP_ACCEPT_ENCODING = "identity";
 
/* =====================================================
   CORS (EXPRESS 5 SAFE)
===================================================== */
 
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-CSRF-Token, X-User-Auth, X-User-Environment",
};
 
router.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    res.set(corsHeaders).sendStatus(200);
  } else {
    next();
  }
});
 
/* =====================================================
   HELPERS
===================================================== */
 
function decodeBasicAuth(encoded) {
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const [username, password] = decoded.split(":");
  if (!username || !password) {
    throw new Error("Invalid Authorization header");
  }
  return { username, password };
}
 
/* =====================================================
   RMV (110/DEV) - CHECK NAME / REMOVE API
===================================================== */
 
router.post("/rmv", async (req, res) => {
  try {
    const environment = req.headers["x-user-environment"];
    if (!environment) {
      return res
        .status(400)
        .json({ error: "X-User-Environment header required (dev, 110, prd, or 300)" });
    }
 
    if (!["dev", "110"].includes(environment)) {
      return res
        .status(400)
        .json({ error: "RMV endpoint is only configured for dev/110" });
    }
 
    const authHeader = req.headers["x-user-auth"];
    if (!authHeader) {
      return res.status(401).json({
        error: "X-User-Auth header required - must be base64 encoded username:password",
      });
    }
 
    const { username, password } = decodeBasicAuth(authHeader);
 
    const response = await axios.post(API_URL_DEV, req.body, {
      auth: { username, password },
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "Accept-Encoding": SAP_ACCEPT_ENCODING,
      },
      httpsAgent,
      timeout: 30000,
      validateStatus: () => true,
    });
 
    res.set(corsHeaders);
    return res.status(response.status).json(response.data);
  } catch (err) {
    console.error("RMV error:", err.message);
    res.set(corsHeaders);
    return res.status(500).json({ error: "RMV request failed" });
  }
});
 
/* =====================================================
   300 LEVEL DIRECT API
===================================================== */
 
router.get("/batch/300/:batchNumber", async (req, res) => {
  try {
    const { batchNumber } = req.params;
    const authHeader = req.headers["x-user-auth"];
 
    if (!authHeader) {
      return res.status(401).json({ error: "User credentials required" });
    }
 
    const url = `${API_URL_DEV}?$filter=BatchNumber eq '${batchNumber}'`;
 
    const response = await axios.get(url, {
      headers: {
        Authorization: `Basic ${authHeader}`,
        Accept: "application/json",
        "Accept-Encoding": SAP_ACCEPT_ENCODING,
      },
      httpsAgent,
      validateStatus: () => true,
    });
 
    return res.status(response.status).json(response.data);
  } catch (err) {
    console.error("300 batch fetch error:", err.message);
    return res.status(500).json({ error: "Failed to fetch batch" });
  }
});
 
/* =====================================================
   MAIN BATCH INFO (BTP / API MGMT)
===================================================== */
 
router.get("/BatchInfo/:batchNumber", async (req, res) => {
  try {
    const { batchNumber } = req.params;
    const { werks = "1134" } = req.query;
 
    const authHeader = req.headers["x-user-auth"];
    const environment = req.headers["x-user-environment"] || "dev";
 
    if (!authHeader) {
      return res.status(401).json({ error: "User credentials required" });
    }
 
    const { username, password } = decodeBasicAuth(authHeader);
    const sapClient = environment === "prd" ? "300" : "110";
 
    const filter = `Charg eq '${batchNumber}' and Werks eq '${werks}'`;
 
    const isPrd = environment === "prd" || environment === "300";
    const baseUrl = isPrd ? API_URL_PRD : API_URL_DEV;
 
    const url = isPrd
      ? `${baseUrl}/BatchInfoSet?$filter=${encodeURIComponent(filter)}&$format=json`
      : `${baseUrl}/BatchInfoSet?$filter=${encodeURIComponent(filter)}&$format=json&sap-client=${sapClient}`;
 
    const response = await axios.get(url, {
      auth: { username, password },
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "Accept-Encoding": SAP_ACCEPT_ENCODING,
      },
      httpsAgent,
      timeout: 30000,
      validateStatus: () => true,
    });
 
    if (response.status >= 400) {
      return res.status(response.status).json({
        error: "SAP API error",
        status: response.status,
        data: response.data,
      });
    }
 
    const results = response.data?.d?.results;
    if (!results || !results.length) {
      return res.status(404).json({ error: "Batch not found" });
    }
 
    res.set(corsHeaders).json(results[0]);
  } catch (err) {
    console.error("BatchInfo error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});
 
/* =====================================================
   API MGMT GATEWAY (PRD ONLY)
===================================================== */
 
router.get("/BatchInfoGateway/:batchNumber", async (req, res) => {
  try {
    const { batchNumber } = req.params;
    const environment = req.headers["x-user-environment"];
 
    if (!environment) {
      return res
        .status(400)
        .json({ error: "X-User-Environment header required (dev, 110, prd, or 300)" });
    }
 
    if (!["dev", "110", "prd", "300"].includes(environment)) {
      return res
        .status(400)
        .json({ error: "X-User-Environment must be 'dev', '110', 'prd', or '300'" });
    }
 
    const authHeader = req.headers["x-user-auth"];
    if (!authHeader) {
      return res.status(401).json({
        error: "X-User-Auth header required - must be base64 encoded username:password"
      });
    }
 
    const { username, password } = decodeBasicAuth(authHeader);
   
    // Use appropriate URL based on environment
    let url;
    if (environment === "dev" || environment === "110") {
      const filter = `Charg eq '${batchNumber}' and Werks eq '1134'`;
      url = `${API_URL_DEV}/BatchInfoSet?$filter=${encodeURIComponent(filter)}&$format=json&sap-client=110`;
    } else {
      const filter = `Charg eq '${batchNumber}' and Werks eq '1134'`;
      url = `${API_URL_PRD}/BatchInfoSet?$filter=${encodeURIComponent(filter)}&$format=json&sap-client=300`;
    }
 
    const response = await axios.get(url, {
      auth: { username, password },
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "Accept-Encoding": SAP_ACCEPT_ENCODING,
      },
      httpsAgent,
      timeout: 30000,
      validateStatus: () => true,
    });
 
    if (response.status >= 400) {
      return res.status(response.status).json(response.data);
    }
 
    const results = response.data?.d?.results;
    if (!results || !results.length) {
      return res.status(404).json({ error: "Batch not found" });
    }
 
    return res.json(results[0]);
  } catch (err) {
    console.error("Gateway error:", err.message);
    return res.status(500).json({ error: "Gateway failure" });
  }
});
 
module.exports = router;
 