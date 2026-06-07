import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";

const app = express();

app.use(cors({ origin: "*", methods: ["GET", "POST"], allowedHeaders: ["Content-Type"] }));
app.use(express.json({ limit: "50mb" }));

const API_KEY = process.env.REPLICATE_API_KEY;

app.get("/", (req, res) => {
  res.json({ status: "Fashion Try-On Backend is running 🚀", apiKeySet: !!API_KEY });
});

app.post("/tryon", async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(500).json({ success: false, error: "REPLICATE_API_KEY is not set" });
    }

    const { personImg, clothImg, garment } = req.body;

    if (!personImg || !clothImg) {
      return res.status(400).json({ success: false, error: "personImg and clothImg are required" });
    }

    // ── Upload image to Replicate storage ─────────────────────────────────
    const uploadImage = async (dataUrl) => {
      const base64 = dataUrl.split(",")[1];
      const mimeType = dataUrl.split(";")[0].split(":")[1] || "image/jpeg";
      const buffer = Buffer.from(base64, "base64");

      const uploadRes = await fetch("https://api.replicate.com/v1/files", {
        method: "POST",
        headers: {
          Authorization: `Token ${API_KEY}`,
          "Content-Type": mimeType,
          "Content-Length": buffer.length,
        },
        body: buffer,
      });

      if (!uploadRes.ok) {
        console.error("Upload failed, using base64 directly");
        return dataUrl;
      }

      const file = await uploadRes.json();
      const url = file.urls?.get || file.url || dataUrl;
      console.log("Uploaded:", url);
      return url;
    };

    console.log("Uploading images...");
    const personUrl = await uploadImage(personImg);
    const clothUrl  = await uploadImage(clothImg);
    console.log("Both images uploaded!");

    // ── Create prediction ─────────────────────────────────────────────────
    const createRes = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Token ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: "0513734a452173b8173e907e3a59d19a36266e55b48528559432bd21c7d7e985",
        input: {
          human_img:       personUrl,
          garm_img:        clothUrl,
          garment_des:     garment?.label    || "clothing item",
          category:        garment?.category || "upper_body",
          is_checked:      true,
          is_checked_crop: false,
          denoise_steps:   30,
          seed:            42,
        },
      }),
    });

    const prediction = await createRes.json();

    if (!createRes.ok) {
      console.error("Replicate create error:", prediction);
      return res.status(400).json({ success: false, error: prediction.detail || prediction.error || "Failed to start AI generation" });
    }

    console.log(`Prediction created: ${prediction.id}`);

    // ── Poll for result ───────────────────────────────────────────────────
    let imageUrl = null;

    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 3000));

      // ✅ Use Accept: application/json to force plain URL strings not FileOutput objects
      const pollRes = await fetch(
        `https://api.replicate.com/v1/predictions/${prediction.id}`,
        {
          headers: {
            Authorization: `Token ${API_KEY}`,
            "Accept": "application/json",
          }
        }
      );

      const data = await pollRes.json();
      console.log(`Poll ${i + 1}: status = ${data.status}`);

      if (data.status === "succeeded") {
        const raw = data.output;
        console.log("RAW OUTPUT TYPE:", typeof raw);
        console.log("RAW OUTPUT:", JSON.stringify(raw));

        // ✅ Handle every possible format
        if (typeof raw === "string" && raw.startsWith("http")) {
          imageUrl = raw;
        } else if (Array.isArray(raw)) {
          for (const item of raw) {
            if (typeof item === "string" && item.startsWith("http")) {
              imageUrl = item;
              break;
            } else if (item && typeof item === "object") {
              // FileOutput object — get the URL string from it
              const str = item.toString ? item.toString() : JSON.stringify(item);
              if (str.startsWith("http")) { imageUrl = str; break; }
              if (item.url && typeof item.url === "string") { imageUrl = item.url; break; }
              if (item.href && typeof item.href === "string") { imageUrl = item.href; break; }
              // Try all string values
              for (const val of Object.values(item)) {
                if (typeof val === "string" && val.startsWith("http")) {
                  imageUrl = val; break;
                }
              }
            }
          }
        } else if (raw && typeof raw === "object") {
          const str = raw.toString ? raw.toString() : "";
          if (str.startsWith("http")) imageUrl = str;
          else imageUrl = raw.url || raw.href || raw.image || Object.values(raw).find(v => typeof v === "string" && v.startsWith("http"));
        }

        console.log("FINAL IMAGE URL:", imageUrl);
        break;
      }

      if (data.status === "failed") {
        console.error("Failed:", data.error);
        return res.status(500).json({ success: false, error: data.error || "AI model failed" });
      }
    }

    if (!imageUrl) {
      return res.status(408).json({ success: false, error: "Could not get image URL. Please try again." });
    }

    return res.json({ success: true, image: imageUrl });

  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ success: false, error: err.message || "Unexpected server error" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
  console.log(`✅ Replicate API key: ${API_KEY ? "SET ✓" : "NOT SET ✗"}`);
});
