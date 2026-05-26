import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { getCarHistory } from "./routes/getCarHistory";

const app = express();

app.get("/api/carHistory", getCarHistory);

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
