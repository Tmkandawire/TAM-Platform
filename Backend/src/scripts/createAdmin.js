import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/User.js";

await mongoose.connect(process.env.MONGO_URI);

const admin = await User.create({
  email: "admin@tam.mw",
  password: "Admin@123456",
  role: "admin",
  status: "active",
});

console.log("Admin created:", admin.email);
await mongoose.disconnect();
