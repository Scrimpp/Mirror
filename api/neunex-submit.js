function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseNeunexResponse(rawText) {
  if (!rawText) return null;
  try {
    return JSON.parse(rawText);
  } catch {
    return { raw: rawText };
  }
}

function normalizeSubmission(asset, submission = {}, session = {}) {
  return {
    title: (submission.title || asset.prompt || "mirror portrait").trim(),
    worldId: (submission.worldId || process.env.NEUNEX_WORLD_ID || "").trim(),
    objectType: submission.objectType || "billboard",
    materialStyle: (submission.materialStyle || "portrait").trim(),
    scale: toNumber(submission.scale, 1),
    position: {
      x: toNumber(submission.position?.x, 0),
      y: toNumber(submission.position?.y, 0),
      z: toNumber(submission.position?.z, 0),
    },
    rotation: {
      x: toNumber(submission.rotation?.x, 0),
      y: toNumber(submission.rotation?.y, 0),
      z: toNumber(submission.rotation?.z, 0),
    },
    session: {
      id: session.id || asset.id,
      mode: session.mode || "garden",
      messageCount: toNumber(session.messageCount, 0),
    },
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.NEUNEX_API_URL) {
    return res.status(503).json({
      error: "Missing NEUNEX_API_URL",
      hint: "Set NEUNEX_API_URL (and optionally NEUNEX_API_KEY / NEUNEX_WORLD_ID) to enable submissions.",
    });
  }

  const { asset, submission, session } = req.body || {};
  if (!asset?.id || !asset?.url || !asset?.prompt) {
    return res.status(400).json({ error: "Missing asset record" });
  }

  const normalizedSubmission = normalizeSubmission(asset, submission, session);

  const payload = {
    source: "mirror",
    submittedAt: new Date().toISOString(),
    asset: {
      id: asset.id,
      url: asset.url,
      prompt: asset.prompt,
      mimeType: asset.mimeType || "image/png",
      createdAt: asset.createdAt,
      metadata: asset.metadata || {},
    },
    target: {
      worldId: normalizedSubmission.worldId,
      objectType: normalizedSubmission.objectType,
      materialStyle: normalizedSubmission.materialStyle,
      scale: normalizedSubmission.scale,
      position: normalizedSubmission.position,
      rotation: normalizedSubmission.rotation,
    },
    session: normalizedSubmission.session,
    title: normalizedSubmission.title,
  };

  const headers = {
    "Content-Type": "application/json",
  };

  if (process.env.NEUNEX_API_KEY) {
    headers.Authorization = "Bearer " + process.env.NEUNEX_API_KEY;
  }

  const neunexResponse = await fetch(process.env.NEUNEX_API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const rawText = await neunexResponse.text();
  const parsedBody = parseNeunexResponse(rawText);

  if (!neunexResponse.ok) {
    return res.status(neunexResponse.status).json({
      error: "Neunex submission failed",
      detail: parsedBody,
    });
  }

  const submissionRecord = {
    id:
      parsedBody?.id ||
      parsedBody?.submissionId ||
      parsedBody?.objectId ||
      parsedBody?.worldObjectId ||
      asset.id,
    assetId: asset.id,
    title: normalizedSubmission.title,
    worldId: normalizedSubmission.worldId,
    objectType: normalizedSubmission.objectType,
    materialStyle: normalizedSubmission.materialStyle,
    scale: normalizedSubmission.scale,
    position: normalizedSubmission.position,
    rotation: normalizedSubmission.rotation,
    submittedAt: payload.submittedAt,
    status: "submitted",
    neunex: parsedBody,
  };

  return res.status(200).json({ submission: submissionRecord });
}
