import type { GenerationRequest, GenerationResult, AppSettings } from './types';

const STYLE_SUFFIX =
  '3D cartoon style, Pixar/Dreamworks animation, vibrant colors, soft studio lighting, high detail, cinematic';

export function buildFinalPrompt(prompt: string): string {
  if (prompt.toLowerCase().includes('3d cartoon')) return prompt;
  return `${prompt}, ${STYLE_SUFFIX}`;
}

// ─── Pollinations ──────────────────────────────────────────────────────────────

export async function generateWithPollinations(req: GenerationRequest): Promise<GenerationResult> {
  const finalPrompt = buildFinalPrompt(req.prompt);
  const seed = req.seed ?? Math.floor(Math.random() * 2_000_000);
  const model = req.model ?? 'flux';
  const width = req.width ?? 1024;
  const height = req.height ?? 1024;

  const response = await fetch('/api/generate/pollinations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: finalPrompt, seed, model, width, height }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => 'Unbekannter Fehler');
    throw new Error(`Bildgenerierung fehlgeschlagen: ${err}`);
  }

  const blob = await response.blob();
  return { blob, seed, provider: 'pollinations' };
}

// ─── HuggingFace ───────────────────────────────────────────────────────────────

export async function generateWithHuggingFace(req: GenerationRequest, token: string): Promise<GenerationResult> {
  const finalPrompt = buildFinalPrompt(req.prompt);
  const seed = req.seed ?? Math.floor(Math.random() * 2_000_000);

  const response = await fetch('/api/generate/huggingface', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: finalPrompt, seed, token }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => 'Unbekannter Fehler');
    throw new Error(`HuggingFace Fehler: ${err}`);
  }

  const blob = await response.blob();
  return { blob, seed, provider: 'huggingface' };
}

// ─── Unified generate with retry ───────────────────────────────────────────────

export async function generateImage(
  req: GenerationRequest,
  settings: AppSettings,
): Promise<GenerationResult> {
  const provider = req.provider ?? settings.defaultProvider;

  const attempt = async () => {
    if (provider === 'huggingface') {
      return generateWithHuggingFace(req, settings.huggingfaceToken);
    }
    return generateWithPollinations(req);
  };

  try {
    return await attempt();
  } catch (firstErr) {
    // Single retry
    await new Promise((r) => setTimeout(r, 1000));
    try {
      return await attempt();
    } catch {
      throw firstErr;
    }
  }
}

// ─── Concurrency helper ────────────────────────────────────────────────────────

export async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
  onProgress?: (done: number, total: number) => void,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let index = 0;
  let done = 0;

  async function worker() {
    while (index < tasks.length) {
      const taskIndex = index++;
      try {
        results[taskIndex] = { status: 'fulfilled', value: await tasks[taskIndex]() };
      } catch (e) {
        results[taskIndex] = { status: 'rejected', reason: e };
      }
      done++;
      onProgress?.(done, tasks.length);
      // Polite delay between starting new requests
      if (index < tasks.length) await new Promise((r) => setTimeout(r, 500));
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}
