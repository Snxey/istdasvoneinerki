'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { StoryboardSlot } from '@/lib/types';
import {
  RefreshCw,
  Pencil,
  CheckCircle,
  Download,
  Eye,
  Loader2,
  Shuffle,
  Grid2X2,
  AlertCircle,
} from 'lucide-react';

type RegenerateMode = 'same-seed' | 'new-seed' | 'variations';

interface StoryboardTileProps {
  slot: StoryboardSlot;
  onRegenerate: (slotId: string, mode: RegenerateMode, newPrompt?: string) => void;
  onApprove: (slotId: string) => void;
  onDownload: (slotId: string) => void;
}

export function StoryboardTile({ slot, onRegenerate, onApprove, onDownload }: StoryboardTileProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [promptDraft, setPromptDraft] = useState('');
  const [viewPromptOpen, setViewPromptOpen] = useState(false);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    if (slot.imageBlob) {
      const url = URL.createObjectURL(slot.imageBlob);
      urlRef.current = url;
      setImageUrl(url);
    } else {
      setImageUrl(null);
    }
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [slot.imageBlob]);

  function openEdit() {
    setPromptDraft(slot.enhancedPrompt || slot.prompt || '');
    setEditOpen(true);
  }

  const statusLabel: Record<string, string> = {
    empty: 'Leer',
    generating: 'Generiert...',
    ready: 'Bereit',
    approved: 'Genehmigt',
    failed: 'Fehlgeschlagen',
  };

  const isGenerating = slot.status === 'generating';
  const hasImage = !!imageUrl && (slot.status === 'ready' || slot.status === 'approved');

  return (
    <>
      <div
        className={cn(
          'storyboard-tile relative overflow-hidden aspect-square',
          slot.status === 'approved' && 'border-green-500/50',
          slot.status === 'failed' && 'border-destructive/50',
          slot.status === 'generating' && 'border-primary/50',
        )}
      >
        {/* Scene number */}
        <div className="absolute top-2 left-2 z-10 text-xs font-bold bg-black/70 text-white rounded px-1.5 py-0.5">
          {slot.sceneIndex + 1}
        </div>

        {/* Status badge */}
        {!hasImage && (
          <div className="absolute top-2 right-2 z-10">
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full',
              slot.status === 'generating' && 'bg-primary/20 text-primary',
              slot.status === 'failed' && 'bg-destructive/20 text-destructive',
              slot.status === 'empty' && 'bg-muted text-muted-foreground',
            )}>
              {statusLabel[slot.status] ?? slot.status}
            </span>
          </div>
        )}

        {/* Approved badge */}
        {slot.status === 'approved' && (
          <div className="absolute top-2 right-2 z-10">
            <CheckCircle className="h-5 w-5 text-green-500 drop-shadow" />
          </div>
        )}

        {/* Image or placeholder */}
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl!} alt={`Szene ${slot.sceneIndex + 1}`} className="w-full h-full object-cover" />
        ) : isGenerating ? (
          <div className="w-full h-full skeleton flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
          </div>
        ) : slot.status === 'failed' ? (
          <div className="w-full h-full bg-destructive/5 flex flex-col items-center justify-center gap-2 p-4">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-xs text-destructive text-center line-clamp-3">
              {slot.errorMessage ?? 'Generierung fehlgeschlagen'}
            </p>
          </div>
        ) : (
          <div className="w-full h-full bg-muted/30 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <div className="text-3xl opacity-30">🖼️</div>
            {slot.prompt ? (
              <p className="text-xs text-center px-2 line-clamp-3 opacity-60">{slot.prompt}</p>
            ) : (
              <p className="text-xs opacity-40">Kein Prompt</p>
            )}
          </div>
        )}

        {/* Hover overlay */}
        {!isGenerating && (
          <div className="absolute inset-0 bg-black/70 opacity-0 hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
            <div className="grid grid-cols-2 gap-1 w-full">
              <Button
                size="sm"
                variant="secondary"
                className="gap-1 text-xs h-8"
                onClick={openEdit}
                title="Prompt bearbeiten und neu generieren"
              >
                <Pencil className="h-3 w-3" />
                Bearbeiten
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="gap-1 text-xs h-8"
                onClick={() => onRegenerate(slot.id, 'new-seed')}
                disabled={!slot.prompt && !slot.enhancedPrompt}
                title="Neuer Seed (Variation)"
              >
                <Shuffle className="h-3 w-3" />
                Variation
              </Button>
              {hasImage && (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="gap-1 text-xs h-8"
                    onClick={() => onRegenerate(slot.id, 'same-seed')}
                    title="Gleicher Seed"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Gleicher Seed
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="gap-1 text-xs h-8"
                    onClick={() => onRegenerate(slot.id, 'variations')}
                    title="4 Variationen generieren"
                  >
                    <Grid2X2 className="h-3 w-3" />
                    4×
                  </Button>
                </>
              )}
            </div>
            {hasImage && (
              <div className="flex gap-1 w-full">
                <Button
                  size="sm"
                  className={cn('gap-1 text-xs h-8 flex-1', slot.status === 'approved' && 'bg-green-600 hover:bg-green-700')}
                  onClick={() => onApprove(slot.id)}
                  title={slot.status === 'approved' ? 'Genehmigung zurückziehen' : 'Genehmigen'}
                >
                  <CheckCircle className="h-3 w-3" />
                  {slot.status === 'approved' ? 'Genehmigt' : 'Genehmigen'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 text-xs h-8"
                  onClick={() => onDownload(slot.id)}
                  title="Bild herunterladen"
                >
                  <Download className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 text-xs h-8"
                  onClick={() => setViewPromptOpen(true)}
                  title="Prompt anzeigen"
                >
                  <Eye className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit prompt dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Szene {slot.sceneIndex + 1} – Prompt bearbeiten</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Erweiterter Prompt</Label>
            <Textarea
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              rows={6}
              className="text-sm font-mono"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Abbrechen</Button>
            <Button
              onClick={() => {
                onRegenerate(slot.id, 'new-seed', promptDraft);
                setEditOpen(false);
              }}
              disabled={!promptDraft.trim()}
            >
              Generieren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View prompt dialog */}
      <Dialog open={viewPromptOpen} onOpenChange={setViewPromptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Szene {slot.sceneIndex + 1} – Gesendeter Prompt</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {slot.prompt && (
              <div>
                <Label className="text-xs text-muted-foreground">Original</Label>
                <p className="mt-1 p-3 bg-muted rounded-md">{slot.prompt}</p>
              </div>
            )}
            {slot.enhancedPrompt && slot.enhancedPrompt !== slot.prompt && (
              <div>
                <Label className="text-xs text-muted-foreground">Erweiterter Prompt (gesendet)</Label>
                <p className="mt-1 p-3 bg-muted rounded-md font-mono text-xs break-all">{slot.enhancedPrompt}</p>
              </div>
            )}
            {slot.seed !== undefined && (
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Seed: <code>{slot.seed}</code></span>
                {slot.provider && <span>Provider: <code>{slot.provider}</code></span>}
                {slot.model && <span>Model: <code>{slot.model}</code></span>}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setViewPromptOpen(false)}>Schließen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
