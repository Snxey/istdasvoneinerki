'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/store';
import { exportProjectAsZip, downloadBlob } from '@/lib/export';
import { useToast } from '@/hooks/use-toast';
import { Download, Archive, CheckCircle, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useRef } from 'react';

export function ExportTab() {
  const { currentProject } = useAppStore();
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  if (!currentProject) return null;

  const approvedSlots = currentProject.slots.filter((s) => s.status === 'approved' && s.imageBlob);
  const readySlots = currentProject.slots.filter((s) => s.status === 'ready' && s.imageBlob);
  const exportableCount = approvedSlots.length > 0 ? approvedSlots.length : readySlots.length;

  async function handleExport() {
    if (!currentProject) return;
    setExporting(true);
    try {
      const zip = await exportProjectAsZip(currentProject);
      const safeName = currentProject.name.replace(/[^a-z0-9äöüß\-_]/gi, '_').slice(0, 50);
      downloadBlob(zip, `${safeName}.zip`);
      toast({ title: 'Export erfolgreich', description: `${exportableCount} Bilder + prompts.txt` });
    } catch (err) {
      toast({
        title: 'Export fehlgeschlagen',
        description: err instanceof Error ? err.message : 'Unbekannter Fehler',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Archive className="h-5 w-5 text-primary" />
          <div>
            <h3 className="font-semibold">ZIP-Export</h3>
            <p className="text-sm text-muted-foreground">
              Enthält alle Bilder nummeriert (01.png – 09.png) + prompts.txt
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="text-center p-3 rounded-md bg-muted">
            <div className="text-2xl font-bold text-primary">{approvedSlots.length}</div>
            <div className="text-muted-foreground text-xs mt-1">Genehmigt</div>
          </div>
          <div className="text-center p-3 rounded-md bg-muted">
            <div className="text-2xl font-bold">{readySlots.length}</div>
            <div className="text-muted-foreground text-xs mt-1">Bereit</div>
          </div>
          <div className="text-center p-3 rounded-md bg-muted">
            <div className="text-2xl font-bold">{exportableCount}</div>
            <div className="text-muted-foreground text-xs mt-1">Exportiert</div>
          </div>
        </div>

        {approvedSlots.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Es werden nur genehmigte Bilder exportiert. Nicht genehmigte Bilder werden übersprungen.
          </p>
        )}
        {approvedSlots.length === 0 && readySlots.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Keine Bilder genehmigt – alle fertigen Bilder werden exportiert.
          </p>
        )}

        <Button
          onClick={handleExport}
          disabled={exportableCount === 0 || exporting}
          className="w-full gap-2"
          size="lg"
        >
          <Download className="h-4 w-4" />
          {exporting ? 'Wird exportiert...' : `${exportableCount} Bilder als ZIP herunterladen`}
        </Button>
      </div>

      {/* Image gallery */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-muted-foreground flex items-center gap-2">
          <ImageIcon className="h-4 w-4" />
          Alle Bilder
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {currentProject.slots.map((slot) => (
            <SlotPreview key={slot.id} slot={slot} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SlotPreview({ slot }: { slot: import('@/lib/types').StoryboardSlot }) {
  const [url, setUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    if (slot.imageBlob) {
      const u = URL.createObjectURL(slot.imageBlob);
      urlRef.current = u;
      setUrl(u);
    } else {
      urlRef.current = null;
      setUrl(null);
    }
    return () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); };
  }, [slot.imageBlob]);

  return (
    <div className={cn(
      'relative aspect-square rounded-lg overflow-hidden border border-border',
      slot.status === 'approved' && 'border-green-500/50',
    )}>
      <div className="absolute top-1 left-1 z-10 text-xs font-bold bg-black/70 text-white rounded px-1.5 py-0.5">
        {slot.sceneIndex + 1}
      </div>
      {slot.status === 'approved' && (
        <div className="absolute top-1 right-1 z-10">
          <CheckCircle className="h-4 w-4 text-green-500" />
        </div>
      )}
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={`Szene ${slot.sceneIndex + 1}`} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-muted/30 flex items-center justify-center text-muted-foreground text-xs">
          {slot.status === 'empty' ? '–' : slot.status}
        </div>
      )}
    </div>
  );
}
