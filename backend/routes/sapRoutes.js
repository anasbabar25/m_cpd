const express = require("express");
const axios = require("axios");
const https = require("https");
 
const router = express.Router();
 
/* =====================================================
   CONFIG
===================================================== */
 
// 110/dev batch info (plant from X-User-Plant)
const API_URL_DEV = "https://devspace.test.apimanagement.eu10.hana.ondemand.com/bsp/mh/batch";
// 300/prd batch info (plant from X-User-Plant)
const API_URL_PRD = "https://prdspace.prod01.apimanagement.eu10.hana.ondemand.com/grp/batch";
 
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
    "Content-Type, Authorization, X-CSRF-Token, X-User-Auth, X-User-Environment, X-User-Plant",
};
 
router.use((req, res, next) => {
  res.set(corsHeaders);
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
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

function getPlantFromRequest(req) {
  return String(
    req.headers["x-user-plant"] || req.query.plant || req.query.werks || ""
  ).trim();
}

function normalizeBatchEnvironment(raw) {
  const value = String(raw || "dev").toLowerCase();
  if (["dev", "development", "110"].includes(value)) {
    return { environment: "dev", sapClient: "110", isDev: true };
  }
  if (["prd", "production", "300"].includes(value)) {
    return { environment: "prd", sapClient: "300", isDev: false };
  }
  return null;
}

function extractSapErrorMessage(data) {
  if (!data) return null;
  if (typeof data === "string") return data;
  return (
    data?.error?.message?.value ||
    data?.error?.message ||
    data?.message ||
    null
  );
}

function matchesBatchRecord(record, batchNumber, plant) {
  if (!record) return false;
  const charg = String(record.Charg || record.Batch || record.BatchNumber || "")
    .trim()
    .toUpperCase();
  const werks = String(record.Werks || record.Plant || record.WERKS || "").trim();
  const targetBatch = String(batchNumber).trim().toUpperCase();
  const targetPlant = String(plant).trim();
  return charg === targetBatch && werks === targetPlant;
}

function buildBatchLookupUrls(baseUrl, batchNumber, plant, sapClient, isDev) {
  const formatQs = "$format=json";
  const clientQs = `sap-client=${sapClient}`;

  if (isDev) {
    const chargFilter = `Charg eq '${batchNumber}' and Werks eq '${plant}'`;
    return [
      `${baseUrl}/BatchInfoSet?$filter=${encodeURIComponent(
        chargFilter
      )}&${formatQs}&${clientQs}`,
      `${baseUrl}/BatchInfoSet?$filter=${encodeURIComponent(chargFilter)}&${formatQs}`,
    ];
  }

  // PRD grp/batch: OData $filter is not allowed — use entity key or full read + local match.
  const safeBatch = batchNumber.replace(/'/g, "''");
  const safePlant = plant.replace(/'/g, "''");
  return [
    `${baseUrl}/BatchInfoSet(Charg='${safeBatch}',Werks='${safePlant}')?${formatQs}&${clientQs}`,
    `${baseUrl}/BatchInfoSet('${safeBatch}')?${formatQs}&${clientQs}`,
    `${baseUrl}/BatchInfoSet?${formatQs}&${clientQs}`,
  ];
}

function parseBatchResults(data) {
  if (!data) return [];
  if (Array.isArray(data.value)) return data.value;
  if (Array.isArray(data.d?.results)) return data.d.results;
  if (data.d && typeof data.d === "object" && !Array.isArray(data.d.results)) {
    return [data.d];
  }
  if (data.Charg || data.Batch || data.BatchNumber) return [data];
  return [];
}

function normalizeBatchRecord(record) {
  if (!record) return null;
  const qty = record.QTY ?? record.Qty ?? record.Quantity ?? 0;
  return {
    ...record,
    Charg: record.Charg || record.Batch || record.BatchNumber || "",
    Werks: record.Werks || record.Plant || record.WERKS || "",
    QTY: qty,
    Qty: qty,
  };
}

async function requestBatchInfo(url, username, password, batchNumber, plant) {
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

  console.log("Batch API request:", url);
  console.log("Batch API status:", response.status);

  if (response.status >= 400) {
    const sapMsg = extractSapErrorMessage(response.data);
    return {
      error: sapMsg || response.data,
      status: response.status,
      data: response.data,
    };
  }

  const results = parseBatchResults(response.data);
  if (!results.length) {
    return { error: "No batch records in response", status: 404, data: response.data };
  }

  let match = results.find((r) => matchesBatchRecord(r, batchNumber, plant));
  if (!match && results.length === 1) {
    const single = results[0];
    const charg = String(
      single.Charg || single.Batch || single.BatchNumber || ""
    )
      .trim()
      .toUpperCase();
    if (charg === String(batchNumber).trim().toUpperCase()) {
      match = single;
    }
  }

  if (!match) {
    return { error: "No matching batch in response", status: 404, data: response.data };
  }

  return { batch: normalizeBatchRecord(match) };
}

async function fetchBatchFromGateway({
  baseUrl,
  batchNumber,
  plant,
  sapClient,
  isDev,
  username,
  password,
}) {
  const urls = buildBatchLookupUrls(baseUrl, batchNumber, plant, sapClient, isDev);

  let lastError = { error: "Batch not found", status: 404 };

  for (const url of urls) {
    const result = await requestBatchInfo(
      url,
      username,
      password,
      batchNumber,
      plant
    );
    if (result.batch) return result.batch;
    lastError = result;
    // Do not stop on SAP 400 — try remaining URL patterns (e.g. prd needs sap-client=300).
    if (result.status === 401 || result.status === 403) break;
  }

  const sapMsg = extractSapErrorMessage(lastError.error);
  throw Object.assign(new Error(sapMsg || "Batch not found"), lastError);
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
    const plant = getPlantFromRequest(req);

    if (!authHeader) {
      return res.status(401).json({ error: "User credentials required" });
    }
    if (!plant) {
      return res.status(400).json({ error: "Plant is required (X-User-Plant or ?plant=)" });
    }

    const { username, password } = decodeBasicAuth(authHeader);
    const batch = await fetchBatchFromGateway({
      baseUrl: API_URL_PRD,
      batchNumber,
      plant,
      sapClient: "300",
      isDev: false,
      username,
      password,
    });

    res.set(corsHeaders);
    return res.json(batch);
  } catch (err) {
    console.error("300 batch fetch error:", err.message);
    res.set(corsHeaders);
    if (err.status && err.status >= 400 && err.status < 500) {
      return res.status(err.status).json({
        error: err.message || "Batch not found",
        details: err.error,
      });
    }
    return res.status(500).json({ error: "Failed to fetch batch" });
  }
});
 
/* =====================================================
   MAIN BATCH INFO (BTP / API MGMT)
===================================================== */
 
router.get("/BatchInfo/:batchNumber", async (req, res) => {
  try {
    const { batchNumber } = req.params;
    const plant = getPlantFromRequest(req);

    const authHeader = req.headers["x-user-auth"];
    const environment = req.headers["x-user-environment"] || "dev";

    if (!authHeader) {
      return res.status(401).json({ error: "User credentials required" });
    }
    if (!plant) {
      return res.status(400).json({ error: "X-User-Plant header required" });
    }

    const { username, password } = decodeBasicAuth(authHeader);
    const isPrd = environment === "prd" || environment === "300";
    const sapClient = isPrd ? "300" : "110";

    const baseUrl = isPrd ? API_URL_PRD : API_URL_DEV;
    const batch = await fetchBatchFromGateway({
      baseUrl,
      batchNumber,
      plant,
      sapClient,
      isDev: !isPrd,
      username,
      password,
    });

    res.set(corsHeaders).json(batch);
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
    const envConfig = normalizeBatchEnvironment(req.headers["x-user-environment"]);

    if (!envConfig) {
      return res.status(400).json({
        error: "Invalid X-User-Environment",
        message: "Use dev, 110, prd, or 300",
      });
    }

    const authHeader = req.headers["x-user-auth"];
    if (!authHeader) {
      return res.status(401).json({
        error: "X-User-Auth header required - must be base64 encoded username:password",
      });
    }

    const { username, password } = decodeBasicAuth(authHeader);
    const plant = getPlantFromRequest(req);
    if (!plant) {
      return res.status(400).json({
        error: "Plant is required",
        message: "Send X-User-Plant header or ?plant= query (from login)",
      });
    }

    const baseUrl = envConfig.isDev ? API_URL_DEV : API_URL_PRD;

    console.log("BatchInfoGateway:", {
      batchNumber,
      plant,
      environment: envConfig.environment,
      baseUrl,
    });

    const batch = await fetchBatchFromGateway({
      baseUrl,
      batchNumber,
      plant,
      sapClient: envConfig.sapClient,
      isDev: envConfig.isDev,
      username,
      password,
    });

    return res.set(corsHeaders).json(batch);
  } catch (err) {
    console.error("Gateway error:", err.message, err.status, err.error);
    if (err.status === 401) {
      return res.status(401).json({ error: "Authentication failed" });
    }
    if (err.status && err.status >= 400 && err.status < 500) {
      return res.status(err.status).json({
        error: err.message || "Batch not found",
        details: err.error,
      });
    }
    return res.status(500).json({ error: "Gateway failure" });
  }
});
 
module.exports = router;
 