export default async function handler(req, res) {
  // CORS & Method Check
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const token = process.env.HF_TOKEN;
    if (!token) throw new Error("HF_TOKEN fehlt in Vercel");

    // Wir senden den Request direkt weiter
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

    // WICHTIG: Prüfen ob die Antwort von HF wirklich JSON ist
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const data = await response.json();
      return res.status(response.status).json(data);
    } else {
      const errorText = await response.text();
      return res.status(500).json({ error: "KI-Modell liefert kein JSON", details: errorText });
    }
  } catch (error) {
    // Dieser Block verhindert, dass eine HTML-Seite gesendet wird
    return res.status(500).json({ error: "Server-Fehler", message: error.message });
  }
}
