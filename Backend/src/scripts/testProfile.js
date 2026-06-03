import "dotenv/config";
import mongoose from "mongoose";
import Profile from "../models/Profile.js";

await mongoose.connect(process.env.MONGO_URI);

try {
  const result = await Profile.findOne({ user: "6a045ace4eaceeccd245f0e2" })
    .populate("user", "email role status")
    .lean();
  console.log("Result:", result);
} catch (err) {
  console.error("Real error:", err.message);
  console.error(err);
}

await mongoose.disconnect();
