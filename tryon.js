export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    const { personImg, clothImg, garment } = req.body;

    const apiKey = process.env.REPLICATE_API_KEY;

    const createRes = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        version: "c871bb9b046607b680449ecbae55fd8c6d945e0a1948644bf2361b3d021d3ff4",
        input: {
          human_img: personImg,
          garm_img: clothImg,
          garment_des: garment?.label || "clothing",
          category: garment?.category || "upper_body",
          is_checked: true,
          is_checked_crop: false,
          denoise_steps: 30,
          seed: 42
        }
      })
    });

    const prediction = await createRes.json();

    if (!createRes.ok) {
      return res.status(400).json({ error: prediction.detail || "Failed" });
    }

    let output = null;

    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 3000));

      const pollRes = await fetch(
        `https://api.replicate.com/v1/predictions/${prediction.id}`,
        {
          headers: {
            "Authorization": `Token ${apiKey}`
          }
        }
      );

      const data = await pollRes.json();

      if (data.status === "succeeded") {
        output = data.output?.[0] || data.output;
        break;
      }

      if (data.status === "failed") {
        return res.status(500).json({ error: data.error });
      }
    }

    if (!output) {
      return res.status(408).json({ error: "Timeout" });
    }

    return res.status(200).json({ result: output });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}