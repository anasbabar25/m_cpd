export const servers = [
  { label: "Development", value: "dev" },
  { label: "Production", value: "prd" },
];

export const CF_BACKEND_URL = 'https://sap-app-cpd.cfapps.eu10-004.hana.ondemand.com';

export const apiEndpoints = {
  dev: CF_BACKEND_URL,
  dev2: CF_BACKEND_URL,
  prd: CF_BACKEND_URL,
};

export const localBackendUrl = process.env.REACT_APP_API_URL ?? CF_BACKEND_URL;