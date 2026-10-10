const mongoose = require("mongoose");

const connectDB = async (customUri) => {
  const uri = customUri || process.env.MONGO_URI || "mongodb://127.0.0.1:27017/campus_election";
  try {
    const conn = await mongoose.connect(uri);
    console.log(`[Database] MongoDB Connected: ${conn.connection.host} / ${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.error(`[Database Error] Connection failed: ${error.message}`);
    if (process.env.NODE_ENV !== "test") {
      process.exit(1);
    }
    throw error;
  }
};

const disconnectDB = async () => {
  try {
    await mongoose.connection.close();
  } catch (error) {
    console.error(`[Database Error] Disconnect failed: ${error.message}`);
  }
};

module.exports = { connectDB, disconnectDB };
