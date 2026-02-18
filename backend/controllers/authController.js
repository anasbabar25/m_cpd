const axios = require("axios");
const https = require("https");

// Create axios instance that ignores SSL certificate errors
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false // Ignore SSL certificate validation
  })
});

// Use only the specified API URL
const API_URL = "https://devspace.test.apimanagement.eu10.hana.ondemand.com/cpd/pc/stg";

const login = async (req, res) => {
    const { username, password, environment } = req.body;

    if (!username || !password || !environment) {
        return res.status(400).json({ error: "All fields are required" });
    }

    try {
        // Make direct API call to the specified endpoint
        const payload = {
            I_UNAME: username,
            I_PWD: password
        };

        const response = await axiosInstance.post(API_URL, payload, {
            auth: { username, password },
            headers: {
                'Content-Type': 'application/json',
                'X-User-Environment': environment
            }
        });
        
        const sapResponse = response.data;
        
        // Format the response to match what the Android app expects
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
        console.error("Login error:", err);
        return res.status(500).json({
            "ns0:Z_WM_HANDHELD_LOGINResponse": {
                E_TYPE: "E",
                E_MESSAGE: "SAP authentication failed: " + (err.message || "Unknown error")
            }
        });
    }
};

module.exports = { login };