export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Nur POST erlaubt' });
  }

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

    const result = await response.json();
    return res.status(response.status).json(result);
  } catch (error) {
    return res.status(500).json({ error: "Server-Fehler", details: error.message });
  }
}
