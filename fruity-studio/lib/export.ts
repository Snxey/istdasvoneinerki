import JSZip from 'jszip';
import type { Project } from './types';

export async function exportProjectAsZip(project: Project): Promise<Blob> {
  const zip = new JSZip();

  const approvedSlots = project.slots
    .filter((s) => s.status === 'approved' && s.imageBlob)
    .sort((a, b) => a.sceneIndex - b.sceneIndex);

  // Also include 'ready' slots if no approved ones exist
  const slotsToExport =
    approvedSlots.length > 0
      ? approvedSlots
      : project.slots.filter((s) => s.status === 'ready' && s.imageBlob).sort((a, b) => a.sceneIndex - b.sceneIndex);

  // Add images
  for (let i = 0; i < slotsToExport.length; i++) {
    const slot = slotsToExport[i];
    const filename = `${String(slot.sceneIndex + 1).padStart(2, '0')}.png`;
    zip.file(filename, slot.imageBlob!);
  }

  // Build prompts.txt
  const promptLines: string[] = [
    `${project.name}`,
    `Exportiert: ${new Date().toLocaleString('de-DE')}`,
    '',
    '═══════════════════════════════════════',
    '',
  ];

  for (const slot of slotsToExport) {
    const scenePrompt = project.parsedPrompts.find((p) => p.index === slot.sceneIndex);
    promptLines.push(`SZENE ${slot.sceneIndex + 1}`);
    promptLines.push(`─────────────────`);
    if (scenePrompt?.rawText) {
      promptLines.push(`Original: ${scenePrompt.rawText}`);
    }
    promptLines.push(`Prompt: ${slot.enhancedPrompt || slot.prompt}`);
    if (slot.seed !== undefined) {
      promptLines.push(`Seed: ${slot.seed}`);
    }
    if (slot.provider) {
      promptLines.push(`Provider: ${slot.provider}`);
    }
    promptLines.push('');
  }

  zip.file('prompts.txt', promptLines.join('\n'));

  return zip.generateAsync({ type: 'blob' });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
