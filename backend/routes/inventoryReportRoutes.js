const express = require("express");
const axios = require("axios");
const https = require("https");

const router = express.Router();

console.log("Inventory report routes loaded");

const PLANT = "1134";

const STOCK_CONFIG = {
  dev: {
    integrationUrl:
      process.env.SAP_STOCK_INTEGRATION_URL_DEV ||
      "https://devspace.test.apimanagement.eu10.hana.ondemand.com/cpd/stock110",

    odataBaseUrl:
      process.env.SAP_STOCK_ODATA_BASE_URL_DEV ||
      process.env.SAP_STOCK_ODATA_BASE_URL ||
      "",

    sapClient: process.env.SAP_STOCK_CLIENT_DEV || "110",
  },

  prd: {
    integrationUrl:
      process.env.SAP_STOCK_INTEGRATION_URL_PRD ||
      "https://prdspace.prod01.apimanagement.eu10.hana.ondemand.com/cpd/stock300",

    odataBaseUrl:
      process.env.SAP_STOCK_ODATA_BASE_URL_PRD || "",

    sapClient: process.env.SAP_STOCK_CLIENT_PRD || "300",
  },
};

function normalizeEnvironment(env) {
  const value = String(env || "dev").toLowerCase();

  if (value === "110" || value === "dev") return "dev";
  if (value === "300" || value === "prd") return "prd";

  return "dev";
}

function getStockConfig(environment) {
  return STOCK_CONFIG[normalizeEnvironment(environment)] || STOCK_CONFIG.dev;
}

const sapHttp = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false,
  }),

  headers: {
    Accept: "application/json",
    "Accept-Encoding": "identity",
  },

  timeout: 60000,
});

function getUserFromHeaders(req) {
  const auth = req.headers["x-user-auth"];

  if (!auth) return null;

  try {
    const decoded = Buffer.from(auth, "base64").toString("utf-8");

    const idx = decoded.indexOf(":");

    if (idx <= 0) return null;

    return {
      username: decoded.slice(0, idx),
      password: decoded.slice(idx + 1),
      environment: req.headers["x-user-environment"] || "dev",
    };
  } catch {
    return null;
  }
}

function escapeODataString(value) {
  return String(value).replace(/'/g, "''");
}

function buildStockODataUrl(materialNumber, sloc, odataConfig) {
  const filter = [
    `Material eq '${escapeODataString(materialNumber)}'`,
    `Plant eq '${PLANT}'`,
    `StorageLocation eq '${escapeODataString(sloc)}'`,
  ].join(" and ");

  return `${odataConfig.odataBaseUrl}/C_STOCKQUANTITYVALUEBYTYPE?sap-client=${odataConfig.sapClient}&$filter=${encodeURIComponent(filter)}`;
}

const INVENTORY_STOCK_TYPE = {
  UNRESTRICTED: "01",
  QUALITY: "02",
  RESERVED: "03",
  TRANSFER: "04",
};

function findRowByStockType(rows, stockType) {
  return rows.find(
    (row) => String(row.InventoryStockType) === stockType
  );
}

function pickQty(row) {
  if (!row) return 0;

  return Number(row.MatlWrhsStkQtyInMatlBaseUnit ?? 0);
}

function mapSapResultsToReport(materialNumber, sloc, results) {
  const rows = Array.isArray(results) ? results : [];

  const first = rows[0] || {};

  const unrestrictedRow = findRowByStockType(
    rows,
    INVENTORY_STOCK_TYPE.UNRESTRICTED
  );

  const qualityRow = findRowByStockType(
    rows,
    INVENTORY_STOCK_TYPE.QUALITY
  );

  const reservedRow = findRowByStockType(
    rows,
    INVENTORY_STOCK_TYPE.RESERVED
  );

  const transferRow = findRowByStockType(
    rows,
    INVENTORY_STOCK_TYPE.TRANSFER
  );

  const transferQty = pickQty(transferRow);

  return {
    materialNumber: first.Material || materialNumber,
    plant: PLANT,
    sloc: first.StorageLocation || sloc,

    unrestrictedQuantity: pickQty(unrestrictedRow),

    qualityQuantity: pickQty(qualityRow),

    reservedQuantity: pickQty(reservedRow),

    transferSloc:
      transferRow && transferQty > 0
        ? transferRow.StorageLocation || ""
        : "",
  };
}

function parseStockResponse(data, materialNumber, sloc) {
  if (
    data &&
    typeof data === "object" &&
    data.materialNumber != null &&
    data.unrestrictedQuantity != null
  ) {
    return {
      materialNumber: data.materialNumber,
      plant: data.plant || PLANT,
      sloc: data.sloc || sloc,

      unrestrictedQuantity: Number(
        data.unrestrictedQuantity ?? 0
      ),

      qualityQuantity: Number(
        data.qualityQuantity ?? 0
      ),

      reservedQuantity: Number(
        data.reservedQuantity ?? 0
      ),

      transferSloc: data.transferSloc ?? "",
    };
  }

  const results = data?.d?.results ?? data?.value ?? [];

  if (results.length) {
    return mapSapResultsToReport(
      materialNumber,
      sloc,
      results
    );
  }

  const err = new Error(
    "Unexpected or empty stock API response."
  );

  err.status = 502;

  throw err;
}

function throwSapHttpError(response) {
  const err = new Error(
    response.data?.message ||
      response.data?.error?.message?.value ||
      response.data?.error ||
      `Stock API returned status ${response.status}`
  );

  err.status = response.status;

  throw err;
}

async function fetchFromIntegrationSuite(
  integrationUrl,
  materialNumber,
  sloc,
  username,
  password
) {
  const response = await sapHttp.post(
    integrationUrl,
    {
      materialNumber,
      sloc,
      plant: PLANT,
    },
    {
      auth: {
        username,
        password,
      },

      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },

      validateStatus: () => true,
    }
  );

  if (response.status >= 400) {
    throwSapHttpError(response);
  }

  return parseStockResponse(
    response.data,
    materialNumber,
    sloc
  );
}

async function fetchStock(
  materialNumber,
  sloc,
  username,
  password,
  environment
) {
  const stockConfig = getStockConfig(environment);

  return fetchFromIntegrationSuite(
    stockConfig.integrationUrl,
    materialNumber,
    sloc,
    username,
    password
  );
}

/**
 * GET /api/inventory-report
 */
router.get("/inventory-report", async (req, res) => {
  try {
    console.log("Inventory report endpoint hit");

    const materialNumber = (
      req.query.materialNumber || ""
    ).trim();

    const sloc = (
      req.query.sloc || ""
    ).trim();

    if (!materialNumber) {
      return res.status(400).json({
        error: "Validation error",
        message: "Material Number is required",
      });
    }

    if (!sloc) {
      return res.status(400).json({
        error: "Validation error",
        message: "SLOC is required",
      });
    }

    const user = getUserFromHeaders(req);

    if (!user) {
      return res.status(401).json({
        error: "Authentication required",
        message:
          "X-User-Auth header is required",
      });
    }

    const report = await fetchStock(
      materialNumber,
      sloc,
      user.username,
      user.password,
      user.environment
    );

    return res.json(report);

  } catch (err) {
    console.error("Inventory report error:", err);

    return res.status(
      err.status || 500
    ).json({
      error: "Server error",
      message:
        err.message ||
        "Failed to fetch inventory report",
    });
  }
});

module.exports = router;