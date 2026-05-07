'use client';
import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/lib/store';
import { parseScript, rebuildEnhancedPrompt } from '@/lib/script-parser';
import { Wand2, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScriptTabProps {
  onSave: () => Promise<void>;
}

export function ScriptTab({ onSave }: ScriptTabProps) {
  const { currentProject, setCurrentProject, characters } = useAppStore();
  const [showEnhanced, setShowEnhanced] = useState(false);

  if (!currentProject) return null;

  function updateScript(script: string) {
    if (!currentProject) return;
    setCurrentProject({ ...currentProject, script, updatedAt: Date.now() });
  }

  function parseCurrentScript() {
    if (!currentProject) return;
    const result = parseScript(currentProject.script, characters);

    // Merge parsed prompts into existing slots
    const updatedSlots = currentProject.slots.map((slot) => {
      const parsed = result.scenes[slot.sceneIndex];
      if (!parsed) return slot;
      return {
        ...slot,
        prompt: parsed.rawText,
        enhancedPrompt: parsed.enhancedPrompt,
      };
    });

    setCurrentProject({
      ...currentProject,
      parsedPrompts: result.scenes,
      slots: updatedSlots,
      updatedAt: Date.now(),
    });
  }

  function updatePromptText(index: number, value: string) {
    if (!currentProject) return;
    const parsed = currentProject.parsedPrompts.map((p) =>
      p.index === index
        ? {
            ...p,
            rawText: value,
            enhancedPrompt: rebuildEnhancedPrompt(value, p.attachedCharacterIds, characters),
          }
        : p,
    );
    const slots = currentProject.slots.map((s) => {
      if (s.sceneIndex !== index) return s;
      const p = parsed[index];
      return { ...s, prompt: p.rawText, enhancedPrompt: p.enhancedPrompt };
    });
    setCurrentProject({ ...currentProject, parsedPrompts: parsed, slots, updatedAt: Date.now() });
  }

  const handleSave = useCallback(async () => {
    await onSave();
  }, [onSave]);

  const filledScenes = currentProject.parsedPrompts.filter((p) => p.rawText.trim()).length;

  return (
    <div className="space-y-6">
      {/* Script input */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Skript einfügen</Label>
          <Button
            size="sm"
            onClick={parseCurrentScript}
            disabled={!currentProject.script.trim()}
            className="gap-2"
          >
            <Wand2 className="h-4 w-4" />
            Szenen extrahieren
          </Button>
        </div>
        <Textarea
          value={currentProject.script}
          onChange={(e) => updateScript(e.target.value)}
          placeholder={`SCENE 1: Angelo steht in der Küche...\n[VISUAL: Wide shot of Angelo, angry expression, kitchen background]\n\nSZENE 2 — Lola weint am Tisch\n[Bild: Close-up von Lola, Tränen, dramatic lighting]`}
          rows={10}
          className="font-mono text-sm"
        />
      </div>

      {/* Parsed prompts */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Label className="text-base font-semibold">
              Szenen-Prompts
              {filledScenes > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {filledScenes}/9
                </Badge>
              )}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowEnhanced((v) => !v)}
              className="gap-2"
            >
              {showEnhanced ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showEnhanced ? 'Original' : 'Erweiterter Prompt'}
            </Button>
            <Button size="sm" variant="outline" onClick={handleSave} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Speichern
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {currentProject.parsedPrompts.map((scene) => {
            const attachedChars = characters.filter((c) =>
              scene.attachedCharacterIds.includes(c.id),
            );
            return (
              <div
                key={scene.id}
                className={cn(
                  'rounded-lg border border-border p-4 space-y-2',
                  scene.rawText.trim() ? 'bg-card' : 'bg-muted/30 opacity-60',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-primary bg-primary/20 rounded px-2 py-0.5">
                    {scene.index + 1}
                  </span>
                  {attachedChars.map((c) => (
                    <Badge key={c.id} variant="outline" className="text-xs">
                      {c.name}
                    </Badge>
                  ))}
                </div>
                <Input
                  value={showEnhanced ? scene.enhancedPrompt : scene.rawText}
                  onChange={(e) => {
                    if (!showEnhanced) updatePromptText(scene.index, e.target.value);
                  }}
                  readOnly={showEnhanced}
                  placeholder={`Beschreibung für Szene ${scene.index + 1}...`}
                  className={cn('text-sm', showEnhanced && 'text-muted-foreground cursor-default')}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
