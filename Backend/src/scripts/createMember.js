import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/User.js";

await mongoose.connect(process.env.MONGO_URI);

const member = await User.create({
  email: "member@tam.mw",
  password: "Member@123456",
  role: "member",
  status: "active",
});

console.log("Member created:", member.email);
await mongoose.disconnect();
