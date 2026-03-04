export default async function handler(req, res) {
  // WICHTIG: Erlaube nur POST-Anfragen
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const token = process.env.HF_TOKEN;

  if (!token) {
    return res.status(500).json({ error: "HF_TOKEN fehlt in Vercel-Settings" });
  }

  try {
    // Wir senden das Bild (req.body) direkt an Hugging Face
    const response = await fetch(
      "https://api-inference.huggingface.co/models/umm-maybe/AI-image-detector",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
        },
        method: "POST",
        body: req.body,
      }
    );

    const result = await response.json();

    // Falls das Modell noch lädt
    if (result.error && result.error.includes("loading")) {
      return res.status(503).json(result);
    }

    if (!response.ok) {
      return res.status(response.status).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("API Error:", error.message);
    return res.status(500).json({ error: "Interner Serverfehler", details: error.message });
  }
}
