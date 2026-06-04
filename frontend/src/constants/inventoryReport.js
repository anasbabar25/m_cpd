import { getUserCredentials } from "../api";

/** Plant from login (user-entered at login page). */
export function getInventoryReportPlant() {
  const creds = getUserCredentials();
  return creds?.plant?.trim() || "";
}
