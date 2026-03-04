export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const response = await fetch("https://api-inference.huggingface.co/models/umm-maybe/AI-image-detector", {
      headers: { 
        Authorization: `Bearer ${process.env.HF_TOKEN}`,
        "Content-Type": "application/octet-stream"
      },
      method: "POST",
      body: req.body,
    });

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: "Fehler bei der Analyse" });
  }
}
