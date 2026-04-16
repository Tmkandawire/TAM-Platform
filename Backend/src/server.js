import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import xss from "xss-clean";
import mongoSanitize from "express-mongo-sanitize";

import connectDB from "./config/db.js";
import rootRouter from "./routes/index.js";
import errorMiddleware from "./middleware/errorMiddleware.js";

dotenv.config();

const app = express();

// Trust proxy (important for production)
app.set("trust proxy", 1);

// Connect DB
connectDB();

// Security middleware
app.use(helmet());
app.use(xss());
app.use(mongoSanitize());

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  }),
);

// Body parsing with limit
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());

// Logging
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// Routes
app.use("/api/v1", rootRouter);

// Health check
app.get("/", (req, res) => {
  res.send("TAM API is running...");
});

// Error handler
app.use(errorMiddleware);

// Server start
const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(
    `\x1b[35m%s\x1b[0m`,
    `Server running in ${process.env.NODE_ENV} mode on port ${PORT}`,
  );
});

// Handle unhandled rejections
process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err.message);
  server.close(() => process.exit(1));
});
