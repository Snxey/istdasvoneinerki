import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      prompt: string;
      seed?: number;
      token?: string;
    };

    const { prompt, seed, token } = body;
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt fehlt' }, { status: 400 });
    }

    const hfToken = token ?? process.env.HUGGINGFACE_TOKEN ?? '';
    if (!hfToken) {
      return NextResponse.json(
        { error: 'Kein HuggingFace Token konfiguriert. Bitte in den Einstellungen eintragen.' },
        { status: 401 },
      );
    }

    const upstream = await fetch(
      'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${hfToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: { seed },
        }),
        signal: AbortSignal.timeout(90_000),
      },
    );

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      return NextResponse.json(
        { error: `HuggingFace: ${upstream.status} – ${errText.slice(0, 200)}` },
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
