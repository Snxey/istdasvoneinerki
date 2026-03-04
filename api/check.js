export default async function handler(req, res) {
  // Nur POST erlauben
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const token = process.env.HF_TOKEN;

  if (!token) {
    console.error("FEHLER: HF_TOKEN ist nicht in Vercel konfiguriert!");
    return res.status(500).json({ error: "Server-Konfigurationsfehler (Token fehlt)" });
  }

  try {
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

    if (!response.ok) {
      console.error("Hugging Face API Fehler:", result);
      return res.status(response.status).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Interner API Fehler:", error.message);
    return res.status(500).json({ error: "Interner Serverfehler", details: error.message });
  }
}
