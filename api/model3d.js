// api/model3d.js
//
// Two actions, both via POST, selected by body.action:
//
//   { action: "start", imageUrl: "data:image/png;base64,..." }
//     -> kicks off a Meshy image-to-3d task, returns { taskId }
//
//   { action: "status", taskId: "..." }
//     -> checks progress, returns Meshy's task object
//        (status: PENDING | IN_PROGRESS | SUCCEEDED | FAILED | CANCELED)
//        on SUCCEEDED, includes model_urls.glb
//
// The frontend calls "start" once, then polls "status" every few seconds
// until status is SUCCEEDED or FAILED.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { action } = req.body;

  if (action === "start") {
    const { imageUrl } = req.body;
    if (!imageUrl) return res.status(400).json({ error: "Missing imageUrl" });

    const response = await fetch("https://api.meshy.ai/openapi/v1/image-to-3d", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MESHY_API_KEY}`,
      },
      body: JSON.stringify({
        image_url: imageUrl,
        should_remesh: true,
        target_polycount: 30000,
        topology: "triangle",
        enable_pbr: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }

    const data = await response.json();
    const taskId = data.result;
    if (!taskId) return res.status(500).json({ error: "No task id returned" });

    return res.status(200).json({ taskId });
  }

  if (action === "status") {
    const { taskId } = req.body;
    if (!taskId) return res.status(400).json({ error: "Missing taskId" });

    const response = await fetch(`https://api.meshy.ai/openapi/v1/image-to-3d/${taskId}`, {
      headers: {
        Authorization: `Bearer ${process.env.MESHY_API_KEY}`,
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }

    const data = await response.json();
    return res.status(200).json({
      status: data.status,
      progress: data.progress,
      glbUrl: data.model_urls?.glb ?? null,
      taskError: data.task_error ?? null,
    });
  }

  return res.status(400).json({ error: "Unknown action" });
}
