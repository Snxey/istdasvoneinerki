'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Variation {
  blob: Blob | null;
  seed: number;
  loading: boolean;
  error?: string;
}

interface VariationPickerProps {
  open: boolean;
  sceneIndex: number;
  variations: Variation[];
  onPick: (index: number) => void;
  onClose: () => void;
}

export function VariationPicker({ open, sceneIndex, variations, onPick, onClose }: VariationPickerProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [urls, setUrls] = useState<(string | null)[]>([null, null, null, null]);
  const urlsRef = useRef<(string | null)[]>([null, null, null, null]);

  useEffect(() => {
    const newUrls = variations.map((v, i) => {
      if (v.blob && !urlsRef.current[i]) {
        const url = URL.createObjectURL(v.blob);
        urlsRef.current[i] = url;
        return url;
      }
      return urlsRef.current[i];
    });
    setUrls([...newUrls]);
  }, [variations]);

  useEffect(() => {
    return () => {
      urlsRef.current.forEach((u) => u && URL.revokeObjectURL(u));
    };
  }, []);

  useEffect(() => {
    if (!open) setSelected(null);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Szene {sceneIndex + 1} – Variante auswählen</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {variations.map((v, i) => (
            <button
              key={i}
              onClick={() => setSelected(i)}
              className={cn(
                'relative aspect-square rounded-lg overflow-hidden border-2 transition-all',
                selected === i ? 'border-primary shadow-primary/20 shadow-lg' : 'border-border hover:border-primary/40',
              )}
            >
              {v.loading ? (
                <div className="w-full h-full skeleton flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
                </div>
              ) : urls[i] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urls[i]!} alt={`Variante ${i + 1}`} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-destructive/10 flex items-center justify-center text-xs text-destructive p-2">
                  {v.error ?? 'Fehler'}
                </div>
              )}
              <div className="absolute bottom-1 left-1 text-xs bg-black/70 text-white rounded px-1.5 py-0.5">
                {i + 1}
              </div>
              {selected === i && (
                <div className="absolute top-1 right-1">
                  <CheckCircle className="h-5 w-5 text-primary drop-shadow" />
                </div>
              )}
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button
            disabled={selected === null}
            onClick={() => selected !== null && onPick(selected)}
          >
            Variante {selected !== null ? selected + 1 : ''} verwenden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
