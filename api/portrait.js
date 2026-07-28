export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    return res.status(response.status).json({ error: errText });
  }

  const data = await response.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) return res.status(500).json({ error: "No image returned" });

  return res.status(200).json({ url: `data:image/png;base64,${b64}` });
}
