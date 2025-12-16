const axios = require("axios");
const { GoogleAuth } = require("google-auth-library");
const path = require("path");

const PROJECT_ID = "gen-lang-client-0464958475";
const LOCATION = "us-central1";
const KEY_FILE = path.join(__dirname, "../gen-lang-client-0464958475-d0be335fab7d.json");

const auth = new GoogleAuth({
  keyFile: KEY_FILE,
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

async function generateImagenImage(prompt) {
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/imagegeneration@006:predict`;

  const body = {
    instances: [{ prompt }],
    parameters: {
      numberOfImages: 1,
      aspectRatio: "3:4",
    },
  };

  const response = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${token.token}`,
      "Content-Type": "application/json",
    },
  });

  const base64 = response.data.predictions?.[0]?.bytesBase64Encoded;

  if (!base64) {
    throw new Error("Imagen returned no image");
  }

  return Buffer.from(base64, "base64");
}

module.exports = { generateImagenImage };
