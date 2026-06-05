import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ✅ HOME ROUTE (FIX for "Cannot GET /")
app.get("/", (req, res) => {
  res.send("🚀 Backend is LIVE and working!");
});

// ✅ TEST ROUTE
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// ✅ MAIN API
app.post("/tryon", async (req, res) => {
  try {
    const { personImg, clothImg, garment } = req.body;

    if (!process.env.REPLICATE_API_KEY) {
      return res.status(500).json({ error: "Missing API key" });
    }

    if (!personImg || !clothImg) {
      return res.status(400).json({ error: "Images missing" });
    }

    // dummy response first (to test Render)
    return res.json({
      success: true,
      message: "Backend working on Render ✔",
      received: { garment }
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("Server running on", PORT);
});
