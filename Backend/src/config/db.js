import mongoose from "mongoose";

const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI?.trim();
    if (!uri) {
      throw new Error("MONGO_URI is missing from .env file");
    }

    const conn = await mongoose.connect(uri);
    console.log(
      `\x1b[36m%s\x1b[0m`,
      `MongoDB Connected: ${conn.connection.host}`,
    );
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;
