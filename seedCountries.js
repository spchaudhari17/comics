const mongoose = require('mongoose');
const axios = require('axios');
const Country = require('./app/models/Country');

const MONGO_URI = 'mongodb+srv://shubham:shubham@cluster0.e5aknxd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function seedCountries() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB connected");

    const { data } = await axios.get("https://valid.layercode.workers.dev/list/countries?format=select&flags=true&value=code");

    if (!data.countries || !Array.isArray(data.countries)) {
      throw new Error("Invalid response structure from API");
    }

    await Country.deleteMany({});
    await Country.insertMany(data.countries);

    console.log(`✅ Inserted ${data.countries.length} countries successfully.`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding countries:", error.message);
    process.exit(1);
  }
}

seedCountries();
