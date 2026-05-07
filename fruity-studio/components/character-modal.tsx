'use client';
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { X, Upload } from 'lucide-react';
import type { Character } from '@/lib/types';
import { generateId } from '@/lib/utils';

interface CharacterModalProps {
  open: boolean;
  character?: Character | null;
  onSave: (character: Character) => void;
  onClose: () => void;
}

export function CharacterModal({ open, character, onSave, onClose }: CharacterModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [referenceImage, setReferenceImage] = useState<string | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (character) {
      setName(character.name);
      setDescription(character.description);
      setTags(character.tags);
      setReferenceImage(character.referenceImage);
    } else {
      setName('');
      setDescription('');
      setTags([]);
      setReferenceImage(undefined);
    }
    setTagInput('');
  }, [character, open]);

  function addTag() {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
    }
    setTagInput('');
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setReferenceImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleSave() {
    if (!name.trim() || !description.trim()) return;
    const now = Date.now();
    onSave({
      id: character?.id ?? `char-${generateId()}`,
      name: name.trim(),
      description: description.trim(),
      tags,
      referenceImage,
      createdAt: character?.createdAt ?? now,
      updatedAt: now,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{character ? 'Charakter bearbeiten' : 'Neuer Charakter'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="char-name">Name</Label>
            <Input
              id="char-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Angelo"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="char-desc">Beschreibung (Prompt-Fragment)</Label>
            <Textarea
              id="char-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A 3D cartoon anthropomorphized..."
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Wird automatisch in Szenen-Prompts eingefügt, wenn der Charakter erwähnt wird.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Tag eingeben, Enter drücken"
                className="flex-1"
              />
              <Button type="button" variant="outline" size="sm" onClick={addTag}>
                Hinzufügen
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button onClick={() => removeTag(tag)} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Referenzbild (optional)</Label>
            <div className="flex items-center gap-3">
              {referenceImage && (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={referenceImage}
                    alt="Referenz"
                    className="h-16 w-16 rounded-md object-cover border border-border"
                  />
                  <button
                    onClick={() => setReferenceImage(undefined)}
                    className="absolute -top-1 -right-1 bg-destructive rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                Bild hochladen
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Nur als visuelle Referenz – wird nicht an Pollinations gesendet.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || !description.trim()}>
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
