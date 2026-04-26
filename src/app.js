import express from "express";
import cors from "cors";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import { specs } from "./swagger.js";

import usersRouter from "./routes/users.js";
import authRouter from "./routes/auth.js";
// import imagesRouter from "./routes/images.js";

const app = express();

app.use(express.json());
app.use(cors());
app.use(morgan("dev"));

app.use("/users", usersRouter);
app.use("/auth", authRouter);
// app.use("/images", imagesRouter);

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));

export default app;