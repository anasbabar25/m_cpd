const axios = require("axios");

const sapRequest = async (env, data) => {
  // Use the same base URL as in the Android app
  const baseUrl = env === "dev" 
    ? "https://integration-suite-q07hbh9w.it-cpi026-rt.cfapps.eu10-002.hana.ondemand.com/http"
    : "https://integration-suite-prd-ud55bnea.it-cpi026-rt.cfapps.eu10-002.hana.ondemand.com/http";

  const credentials = env === "dev"
    ? "sb-14500df7-5c11-4f60-a289-951ab9b56e65!b379530|it-rt-integration-suite-q07hbh9w!b410603:e287accb-c183-4b15-abf9-36c43241f016$ftnvyFI2U3mk8bzyWY7vW4ioM2P0DvL8B5ljByzdApU="
    : "sb-f04b92a4-33b7-4e29-892f-fbeaf4016ee9!b504443|it-rt-integration-suite-prd-ud55bnea!b410603:6405857c-575d-4926-aeaf-e4af908ac1a0$UDsL31-M98T2RL8dhZ8gxN-H83axqBqiD83KGmWemTY=";

  try {
    console.log(`Making request to: ${baseUrl}/Login`);
    const response = await axios({
      method: 'POST',
      url: `${baseUrl}/Login`,  // Note: The Android app calls the "Login" endpoint
      data: data,  // This should be a stringified JSON with I_UNAME and I_PWD
      headers: {
        "Authorization": `Basic ${Buffer.from(credentials).toString('base64')}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      timeout: 60000,  // 1 minute timeout to match Android client
      // Don't throw on HTTP error status codes
      validateStatus: function (status) {
        return status >= 200 && status < 600; // Reject only if the status code is greater than or equal to 600
      }
    });

    console.log("Response received:", {
      status: response.status,
      headers: response.headers,
      data: response.data
    });

    // Parse the response to match the Android app's expected format
    if (response.data && typeof response.data === 'string') {
      try {
        return { "ns0:Z_WM_HANDHELD_LOGINResponse": JSON.parse(response.data) };
      } catch (e) {
        // If it's not JSON, return as is
        return { "ns0:Z_WM_HANDHELD_LOGINResponse": response.data };
      }
    }
    return response.data;

  } catch (err) {
    console.error("SAP request error:", {
      url: `${baseUrl}/Login`,
      message: err.message,
      status: err.response?.status,
      statusText: err.response?.statusText,
      data: err.response?.data,
      headers: err.response?.headers
    });
    throw err;
  }
};




module.exports = { sapRequest };