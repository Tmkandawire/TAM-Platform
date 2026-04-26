import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import xss from "xss-clean";
import mongoSanitize from "express-mongo-sanitize";

import connectDB from "./config/db.js";
import "./config/redis.js";

import logger from "./utils/logger.js";
import requestLogger from "./middleware/requestLogger.js";
import rootRouter from "./routes/index.js";
import memberRoutes from "./routes/memberRoutes.js";
import documentRoutes from "./routes/documentRoutes.js";

import errorMiddleware from "./middleware/errorMiddleware.js";

dotenv.config();

const app = express();

/* -------------------------
   TRUST PROXY (CRITICAL)
------------------------- */
app.set("trust proxy", 1);

/* -------------------------
   CONNECT DATABASE
------------------------- */
connectDB();

/* -------------------------
   SECURITY MIDDLEWARE
------------------------- */
app.use(helmet());
app.use(xss());
app.use(mongoSanitize());

/* -------------------------
   CORS
------------------------- */
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  }),
);

/* -------------------------
   BODY PARSING
------------------------- */
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));

/* -------------------------
   COOKIES
------------------------- */
app.use(cookieParser());

/* -------------------------
   REQUEST LOGGING (NEW)
------------------------- */
app.use(requestLogger);

/* -------------------------
   ROUTES
------------------------- */
app.use("/api/v1", rootRouter);
app.use("/api/v1/members", memberRoutes);
app.use("/api/v1/documents", documentRoutes);

/* -------------------------
   HEALTH CHECK
------------------------- */
app.get("/", (req, res) => {
  res.send("TAM API is running...");
});

/* -------------------------
   ERROR HANDLER
------------------------- */
app.use(errorMiddleware);

/* -------------------------
   START SERVER
------------------------- */
const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  logger.info(
    `🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`,
  );
});

/* -------------------------
   UNHANDLED PROMISE REJECTIONS
------------------------- */
process.on("unhandledRejection", (err) => {
  logger.error({
    message: "UNHANDLED REJECTION",
    error: err.message,
    stack: err.stack,
  });

  server.close(() => process.exit(1));
});

/* -------------------------
   UNCAUGHT EXCEPTIONS
------------------------- */
process.on("uncaughtException", (err) => {
  logger.error({
    message: "UNCAUGHT EXCEPTION",
    error: err.message,
    stack: err.stack,
  });

  process.exit(1);
});
