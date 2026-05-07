import type { Character, ScenePrompt } from './types';

// Patterns that signal the start of a scene
const SCENE_HEADER_PATTERNS = [
  /^(?:SCENE|SZENE)\s*\d+[:\s\-–—]/i,
  /^\d+\.\s+/,
  /^\[(?:VISUAL|BILD|SCENE|SZENE):/i,
];

// Patterns to extract visual description from bracketed markers
const VISUAL_PATTERNS = [
  /\[(?:VISUAL|BILD):\s*(.*?)\]/gi,
  /\((?:VISUAL|BILD):\s*(.*?)\)/gi,
];

function extractVisualText(text: string): string | null {
  for (const pattern of VISUAL_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) return match[1].trim();
  }
  return null;
}

function stripSceneHeader(line: string): string {
  return line
    .replace(/^(?:SCENE|SZENE)\s*\d+[:\s\-–—]+/i, '')
    .replace(/^\d+\.\s+/, '')
    .trim();
}

function detectCharacters(text: string, characters: Character[]): string[] {
  const lower = text.toLowerCase();
  return characters
    .filter((c) => lower.includes(c.name.toLowerCase()))
    .map((c) => c.id);
}

function buildEnhancedPrompt(rawText: string, characters: Character[], charIds: string[]): string {
  const charDescs = charIds
    .map((id) => characters.find((c) => c.id === id))
    .filter(Boolean)
    .map((c) => `[${c!.name}: ${c!.description}]`)
    .join(' ');

  // Strip German dialogue (lines that don't look like visual descriptions)
  const visual = extractVisualText(rawText) ?? stripSceneHeader(rawText);

  const parts: string[] = [];
  if (charDescs) parts.push(charDescs);
  parts.push(visual);

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

interface ParsedScript {
  scenes: ScenePrompt[];
}

export function parseScript(script: string, characters: Character[]): ParsedScript {
  const lines = script.split('\n');
  const scenes: { lines: string[] }[] = [];
  let currentScene: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const isSceneHeader = SCENE_HEADER_PATTERNS.some((p) => p.test(trimmed));
    if (isSceneHeader) {
      if (currentScene.length > 0) {
        scenes.push({ lines: currentScene });
      }
      currentScene = [trimmed];
    } else {
      currentScene.push(trimmed);
    }
  }
  if (currentScene.length > 0) {
    scenes.push({ lines: currentScene });
  }

  // Cap at 9 scenes for the storyboard grid
  const cappedScenes = scenes.slice(0, 9);

  const scenePrompts: ScenePrompt[] = cappedScenes.map((scene, i) => {
    const fullText = scene.lines.join(' ');
    const charIds = detectCharacters(fullText, characters);
    const rawText = stripSceneHeader(scene.lines[0]) + (scene.lines.length > 1 ? ' ' + scene.lines.slice(1).join(' ') : '');

    return {
      id: `scene-${i}`,
      index: i,
      rawText: rawText.trim(),
      enhancedPrompt: buildEnhancedPrompt(fullText, characters, charIds),
      attachedCharacterIds: charIds,
    };
  });

  // Pad to 9 slots if fewer scenes were found
  while (scenePrompts.length < 9) {
    const i = scenePrompts.length;
    scenePrompts.push({
      id: `scene-${i}`,
      index: i,
      rawText: '',
      enhancedPrompt: '',
      attachedCharacterIds: [],
    });
  }

  return { scenes: scenePrompts };
}

export function rebuildEnhancedPrompt(
  rawText: string,
  charIds: string[],
  characters: Character[],
): string {
  return buildEnhancedPrompt(rawText, characters, charIds);
}
