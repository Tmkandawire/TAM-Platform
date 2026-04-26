import mongoose from "mongoose";
import logger from "../utils/logger.js";

let isConnected = false;

/* -------------------------
   MONGODB CONNECTION
------------------------- */
const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI?.trim();

    if (!uri) {
      logger.error("❌ MONGO_URI is missing");
      process.exit(1);
    }

    if (isConnected) {
      logger.info("ℹ️ MongoDB already connected");
      return;
    }

    const options = {
      autoIndex: process.env.NODE_ENV !== "production",
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4, // IPv4 only
    };

    const conn = await mongoose.connect(uri, options);

    isConnected = true;

    logger.info("✅ MongoDB Connected", {
      host: conn.connection.host,
      db: conn.connection.name,
      env: process.env.NODE_ENV,
    });

    /* -------------------------
       EVENT MONITORING
    ------------------------- */
    mongoose.connection.on("error", (err) => {
      logger.error("❌ MongoDB error", { error: err.message });
    });

    mongoose.connection.on("disconnected", () => {
      isConnected = false;
      logger.warn("⚠️ MongoDB disconnected");
    });

    mongoose.connection.on("reconnected", () => {
      isConnected = true;
      logger.info("🔄 MongoDB reconnected");
    });
  } catch (error) {
    logger.error("❌ MongoDB connection failed", {
      error: error.message,
    });

    process.exit(1);
  }
};

/* -------------------------
   GRACEFUL SHUTDOWN
------------------------- */
const shutdown = async (signal) => {
  try {
    await mongoose.connection.close(false);
    logger.info(`🛑 MongoDB closed via ${signal}`);
    process.exit(0);
  } catch (err) {
    logger.error("❌ Error during DB shutdown", {
      error: err.message,
    });
    process.exit(1);
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

/* -------------------------
   HEALTH CHECK HELPER
------------------------- */
export const isDBConnected = () => mongoose.connection.readyState === 1;

export default connectDB;
