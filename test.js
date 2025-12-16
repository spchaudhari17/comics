const axios = require("axios");
const { GoogleAuth } = require("google-auth-library");
const path = require("path");


const PROJECT_ID = "gen-lang-client-0464958475";
const LOCATION = "us-central1";
const KEY_FILE_PATH = path.join(
    __dirname,
    "gen-lang-client-0464958475-d0be335fab7d.json"
);



async function run() {
    console.log("Starting Imagen 3.0 (Vertex AI) generation...");


    const auth = new GoogleAuth({
        keyFile: KEY_FILE_PATH,
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });

    const client = await auth.getClient();
    const token = await client.getAccessToken();


    const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/imagegeneration@006:predict`;


    const body = {

        instances: [
            {
                prompt: "A cute educational comic illustration for kids, colorful, friendly, simple style, flat vector art",
            },
        ],

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


    const predictions = response.data.predictions;

    if (!predictions || predictions.length === 0 || !predictions[0].bytesBase64Encoded) {
        throw new Error("Image generation failed: No image data received from Vertex AI.");
    }

    const base64Image = predictions[0].bytesBase64Encoded;

    console.log("\n✅ Imagen working successfully!");
    console.log(`Image received. Base64 bytes length: ${base64Image.length}`);
    console.log("Now you can use this base64 data to save or upload the image.");
}

run().catch((err) => {
    console.error("\n❌ Imagen error:", err.response?.data?.error || err.message);


    if (err.response?.status) {
        console.error(`HTTP Status Code: ${err.response.status}`);
    }
    if (err.response?.data?.error?.message) {
        console.error(`Error Message from API: ${err.response.data.error.message}`);
    }
});