import axios from "axios";
import { apiEndpoints } from "../config/servers";
import { INVENTORY_REPORT_PLANT } from "../constants/inventoryReport";

/** Only used when REACT_APP_INVENTORY_REPORT_MOCK=true */
export function getMockInventoryReport(materialNumber, sloc) {
  return {
    materialNumber: materialNumber.trim().toUpperCase(),
    plant: INVENTORY_REPORT_PLANT,
    sloc: sloc.trim().toUpperCase(),
    unrestrictedQuantity: 250,
    qualityQuantity: 40,
    reservedQuantity: 15,
    transferSloc: "0002",
  };
}

const useClientMock = process.env.REACT_APP_INVENTORY_REPORT_MOCK === "true";

function getApiBaseUrl(environment) {
  if (process.env.NODE_ENV === "development") {
    return "";
  }
  return apiEndpoints[environment] || apiEndpoints.dev;
}

export async function fetchInventoryReport(materialNumber, sloc, creds) {
  if (useClientMock) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return getMockInventoryReport(materialNumber, sloc);
  }

  const baseUrl = getApiBaseUrl(creds.environment);
  const response = await axios.post(
    `${baseUrl}/api/inventory-report`,
    { materialNumber: materialNumber.trim(), sloc: sloc.trim() },
    {
      headers: {
        "Content-Type": "application/json",
        "X-User-Auth": btoa(`${creds.username}:${creds.password}`),
        "X-User-Environment": creds.environment,
      },
    }
  );
  return response.data;
}

export const isInventoryReportMockEnabled = useClientMock;
