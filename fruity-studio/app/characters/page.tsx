'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CharacterCard } from '@/components/character-card';
import { CharacterModal } from '@/components/character-modal';
import { useAppStore } from '@/lib/store';
import { getAllCharacters, saveCharacter, deleteCharacter, seedCharactersIfEmpty } from '@/lib/db';
import { useToast } from '@/hooks/use-toast';
import type { Character } from '@/lib/types';
import { Plus, Search, Users } from 'lucide-react';

export default function CharactersPage() {
  const { characters, setCharacters, upsertCharacter, removeCharacter } = useAppStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Character | null>(null);
  const [search, setSearch] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    async function load() {
      await seedCharactersIfEmpty();
      const chars = await getAllCharacters();
      setCharacters(chars);
    }
    load();
  }, [setCharacters]);

  const filtered = characters.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.tags.some((t) => t.toLowerCase().includes(search.toLowerCase())),
  );

  async function handleSave(character: Character) {
    await saveCharacter(character);
    upsertCharacter(character);
    setModalOpen(false);
    setEditTarget(null);
    toast({ title: character.name, description: 'Charakter gespeichert.' });
  }

  async function handleDelete(id: string) {
    await deleteCharacter(id);
    removeCharacter(id);
    toast({ title: 'Gelöscht', description: 'Charakter wurde entfernt.' });
  }

  function openCreate() {
    setEditTarget(null);
    setModalOpen(true);
  }

  function openEdit(character: Character) {
    setEditTarget(character);
    setModalOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Users className="h-7 w-7 text-primary" />
            Charakter-Bibliothek
          </h1>
          <p className="text-muted-foreground mt-1">
            {characters.length} {characters.length === 1 ? 'Charakter' : 'Charaktere'} gespeichert
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Neuer Charakter
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Suche nach Name oder Tag..."
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <div className="text-5xl mb-4">🍑</div>
          {search ? (
            <p>Keine Charaktere für &quot;{search}&quot; gefunden.</p>
          ) : (
            <p>Noch keine Charaktere. Lege deinen ersten Charakter an!</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((char) => (
            <CharacterCard
              key={char.id}
              character={char}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <CharacterModal
        open={modalOpen}
        character={editTarget}
        onSave={handleSave}
        onClose={() => {
          setModalOpen(false);
          setEditTarget(null);
        }}
      />
    </div>
  );
}
