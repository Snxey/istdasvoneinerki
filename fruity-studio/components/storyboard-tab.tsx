'use client';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { StoryboardTile } from './storyboard-tile';
import { VariationPicker } from './variation-picker';
import { useAppStore } from '@/lib/store';
import { generateImage } from '@/lib/generation';
import { downloadBlob } from '@/lib/export';
import { useToast } from '@/hooks/use-toast';
import type { StoryboardSlot, GenerationStatus } from '@/lib/types';
import { Zap, RefreshCw } from 'lucide-react';
import { runWithConcurrency } from '@/lib/generation';

interface Variation {
  blob: Blob | null;
  seed: number;
  loading: boolean;
  error?: string;
}

interface StoryboardTabProps {
  onSave: () => Promise<void>;
}

export function StoryboardTab({ onSave }: StoryboardTabProps) {
  const { currentProject, settings, updateSlotStatus, updateSlotImage, updateSlot } = useAppStore();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [variationSlotId, setVariationSlotId] = useState<string | null>(null);
  const [variations, setVariations] = useState<Variation[]>([]);
  const { toast } = useToast();

  if (!currentProject) return null;

  const filledSlots = currentProject.slots.filter((s) => s.prompt || s.enhancedPrompt);
  const generatingAny = currentProject.slots.some((s) => s.status === 'generating');

  async function generateSlot(slot: StoryboardSlot, overrideSeed?: number, overridePrompt?: string) {
    const prompt = overridePrompt ?? slot.enhancedPrompt ?? slot.prompt;
    if (!prompt?.trim()) return;

    updateSlotStatus(slot.id, 'generating');
    try {
      const result = await generateImage(
        {
          prompt,
          seed: overrideSeed,
          model: settings.defaultModel,
          provider: settings.defaultProvider,
          ...(settings.defaultDimension === '1024x1792' ? { width: 1024, height: 1792 } : {}),
          ...(settings.defaultDimension === '1792x1024' ? { width: 1792, height: 1024 } : {}),
        },
        settings,
      );
      updateSlotImage(slot.id, result.blob, result.seed);
      updateSlot(slot.id, { model: settings.defaultModel, provider: result.provider });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      updateSlotStatus(slot.id, 'failed', msg);
    }
  }

  async function generateAll() {
    const toGenerate = currentProject!.slots.filter((s) => {
      const prompt = s.enhancedPrompt || s.prompt;
      return prompt?.trim() && s.status !== 'generating';
    });

    if (toGenerate.length === 0) {
      toast({ title: 'Keine Prompts', description: 'Füge zuerst Szenen-Prompts hinzu.' });
      return;
    }

    setProgress({ done: 0, total: toGenerate.length });

    const tasks = toGenerate.map((slot) => async () => {
      await generateSlot(slot);
    });

    await runWithConcurrency(tasks, 3, (done, total) => {
      setProgress({ done, total });
    });

    setProgress(null);
    await onSave();
    toast({ title: 'Fertig!', description: `${toGenerate.length} Bilder generiert.` });
  }

  const handleRegenerate = useCallback(
    async (slotId: string, mode: 'same-seed' | 'new-seed' | 'variations', newPrompt?: string) => {
      const slot = currentProject!.slots.find((s) => s.id === slotId);
      if (!slot) return;

      if (mode === 'same-seed') {
        await generateSlot(slot, slot.seed, newPrompt);
        await onSave();
        return;
      }

      if (mode === 'new-seed') {
        await generateSlot(slot, undefined, newPrompt);
        await onSave();
        return;
      }

      // 4 variations
      setVariationSlotId(slotId);
      const initVars: Variation[] = Array.from({ length: 4 }, () => ({
        blob: null,
        seed: Math.floor(Math.random() * 2_000_000),
        loading: true,
      }));
      setVariations(initVars);

      // Generate all 4 in parallel
      const prompt = newPrompt ?? slot.enhancedPrompt ?? slot.prompt ?? '';
      const tasks = initVars.map((v, i) => async () => {
        try {
          const result = await generateImage({ prompt, seed: v.seed, model: settings.defaultModel }, settings);
          setVariations((prev) => {
            const updated = [...prev];
            updated[i] = { blob: result.blob, seed: result.seed, loading: false };
            return updated;
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Fehler';
          setVariations((prev) => {
            const updated = [...prev];
            updated[i] = { blob: null, seed: v.seed, loading: false, error: msg };
            return updated;
          });
        }
      });

      runWithConcurrency(tasks, 4);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentProject, settings, onSave],
  );

  function handlePickVariation(index: number) {
    const slot = currentProject!.slots.find((s) => s.id === variationSlotId);
    const variation = variations[index];
    if (!slot || !variation.blob) return;

    updateSlotImage(slot.id, variation.blob, variation.seed);
    setVariationSlotId(null);
    setVariations([]);
    onSave();
  }

  function handleApprove(slotId: string) {
    const slot = currentProject!.slots.find((s) => s.id === slotId);
    if (!slot) return;
    const newStatus: GenerationStatus = slot.status === 'approved' ? 'ready' : 'approved';
    updateSlotStatus(slotId, newStatus);
    onSave();
  }

  function handleDownload(slotId: string) {
    const slot = currentProject!.slots.find((s) => s.id === slotId);
    if (!slot?.imageBlob) return;
    downloadBlob(slot.imageBlob, `szene-${slot.sceneIndex + 1}.png`);
  }

  const approvedCount = currentProject.slots.filter((s) => s.status === 'approved').length;
  const readyCount = currentProject.slots.filter(
    (s) => s.status === 'ready' || s.status === 'approved',
  ).length;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm text-muted-foreground">
          {readyCount}/9 generiert
          {approvedCount > 0 && ` · ${approvedCount} genehmigt`}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const failedSlots = currentProject.slots.filter((s) => s.status === 'failed');
              failedSlots.forEach((s) => generateSlot(s));
            }}
            disabled={generatingAny || !currentProject.slots.some((s) => s.status === 'failed')}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Fehlgeschlagene erneut
          </Button>
          <Button
            onClick={generateAll}
            disabled={generatingAny || filledSlots.length === 0}
            className="gap-2"
          >
            <Zap className="h-4 w-4" />
            Alle generieren ({filledSlots.length})
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      {progress && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Generiere Bilder...</span>
            <span>{progress.done}/{progress.total}</span>
          </div>
          <Progress value={(progress.done / progress.total) * 100} className="h-2" />
        </div>
      )}

      {/* 3×3 grid */}
      <div className="grid grid-cols-3 gap-3">
        {currentProject.slots.map((slot) => (
          <StoryboardTile
            key={slot.id}
            slot={slot}
            onRegenerate={handleRegenerate}
            onApprove={handleApprove}
            onDownload={handleDownload}
          />
        ))}
      </div>

      {/* Variation picker */}
      {variationSlotId && (
        <VariationPicker
          open={!!variationSlotId}
          sceneIndex={
            currentProject.slots.find((s) => s.id === variationSlotId)?.sceneIndex ?? 0
          }
          variations={variations}
          onPick={handlePickVariation}
          onClose={() => {
            setVariationSlotId(null);
            setVariations([]);
          }}
        />
      )}
    </div>
  );
}
