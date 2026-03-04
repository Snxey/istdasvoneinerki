export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const token = process.env.HF_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'HF_TOKEN fehlt in Vercel' });
  }

  try {
    // Das Bild von der Website empfangen
    const response = await fetch(
      "https://api-inference.huggingface.co/models/umm-maybe/AI-image-detector",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
        },
        method: "POST",
        body: req.body, // Vercel leitet den Body automatisch korrekt weiter
      }
    );

    const data = await response.json();

    // Falls Hugging Face einen Fehler liefert (z.B. 503)
    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error("API Error Details:", error.message);
    return res.status(500).json({ error: "Server-Fehler", message: error.message });
  }
}
