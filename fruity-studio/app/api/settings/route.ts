import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

const ENV_PATH = path.join(process.cwd(), '.env.local');

async function readEnv(): Promise<Record<string, string>> {
  try {
    const content = await readFile(ENV_PATH, 'utf-8');
    const result: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          result[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
        }
      }
    }
    return result;
  } catch {
    return {};
  }
}

export async function GET() {
  const env = await readEnv();
  return NextResponse.json({
    huggingfaceToken: env['HUGGINGFACE_TOKEN'] ?? '',
    defaultProvider: env['DEFAULT_PROVIDER'] ?? 'pollinations',
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { huggingfaceToken?: string; defaultProvider?: string };
    const env = await readEnv();

    if (body.huggingfaceToken !== undefined) {
      env['HUGGINGFACE_TOKEN'] = body.huggingfaceToken;
    }
    if (body.defaultProvider !== undefined) {
      env['DEFAULT_PROVIDER'] = body.defaultProvider;
    }

    const lines: string[] = [];
    for (const [key, value] of Object.entries(env)) {
      lines.push(`${key}=${value}`);
    }

    await writeFile(ENV_PATH, lines.join('\n') + '\n', 'utf-8');
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Fehler beim Speichern';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
