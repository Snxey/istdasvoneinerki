export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST erlaubt' });

  const token = process.env.HF_TOKEN;
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

    const text = await response.text(); // Wir lesen erst den Text
    
    try {
      const data = JSON.parse(text); // Versuchen JSON zu machen
      return res.status(response.status).json(data);
    } catch (e) {
      // Wenn es kein JSON ist, schicken wir den Text als Fehlermeldung
      return res.status(500).json({ error: "Hugging Face antwortet nicht mit JSON", details: text });
    }
  } catch (error) {
    return res.status(500).json({ error: "Serverfehler", message: error.message });
  }
}
