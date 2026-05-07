import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      prompt: string;
      seed?: number;
      model?: string;
      width?: number;
      height?: number;
    };

    const { prompt, seed, model = 'flux', width = 1024, height = 1024 } = body;
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt fehlt' }, { status: 400 });
    }

    const params = new URLSearchParams({
      width: String(width),
      height: String(height),
      model,
      nologo: 'true',
      ...(seed !== undefined ? { seed: String(seed) } : {}),
    });

    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params}`;

    const upstream = await fetch(url, {
      signal: AbortSignal.timeout(60_000),
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Pollinations returned ${upstream.status}` },
        { status: upstream.status },
      );
    }

    const blob = await upstream.blob();
    return new NextResponse(blob, {
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') ?? 'image/jpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
