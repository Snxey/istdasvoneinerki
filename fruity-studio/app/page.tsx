'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProjectCard } from '@/components/project-card';
import { getAllProjects, saveProject, deleteProject, seedCharactersIfEmpty } from '@/lib/db';
import { useToast } from '@/hooks/use-toast';
import type { Project } from '@/lib/types';
import { generateId } from '@/lib/utils';
import { Plus, FolderOpen } from 'lucide-react';

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    async function load() {
      await seedCharactersIfEmpty();
      const projs = await getAllProjects();
      setProjects(projs);
      setLoading(false);
    }
    load();
  }, []);

  async function createProject() {
    if (!projectName.trim()) return;
    const now = Date.now();
    const project: Project = {
      id: `proj-${generateId()}`,
      name: projectName.trim(),
      script: '',
      parsedPrompts: Array.from({ length: 9 }, (_, i) => ({
        id: `scene-${i}`,
        index: i,
        rawText: '',
        enhancedPrompt: '',
        attachedCharacterIds: [],
      })),
      slots: Array.from({ length: 9 }, (_, i) => ({
        id: `slot-${generateId()}`,
        sceneIndex: i,
        prompt: '',
        enhancedPrompt: '',
        status: 'empty' as const,
      })),
      characterSnapshot: [],
      createdAt: now,
      updatedAt: now,
    };
    await saveProject(project);
    router.push(`/projects/${project.id}`);
  }

  async function handleDeleteProject(id: string) {
    await deleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    toast({ title: 'Gelöscht', description: 'Projekt wurde entfernt.' });
  }

  const recentProjects = projects.slice(0, 6);

  return (
    <div className="space-y-10">
      {/* Hero */}
      <div className="text-center py-8 space-y-4">
        <div className="text-6xl">🍊</div>
        <h1 className="text-5xl font-bold fruit-gradient bg-clip-text text-transparent">
          Fruity Studio
        </h1>
        <p className="text-muted-foreground text-lg max-w-md mx-auto">
          Lokales KI-Tool für TikTok Cartoon Content im Angelo-Stil
        </p>
        <div className="flex gap-4 justify-center pt-2">
          <Button
            size="lg"
            className="gap-2 font-semibold"
            onClick={() => setNewProjectOpen(true)}
          >
            <Plus className="h-5 w-5" />
            Neues Projekt
          </Button>
          <Button size="lg" variant="outline" className="gap-2" onClick={() => router.push('/characters')}>
            <span>🎭</span>
            Charakter-Bibliothek
          </Button>
        </div>
      </div>

      {/* Recent Projects */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <FolderOpen className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Letzte Projekte</h2>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border bg-card h-48 skeleton" />
            ))}
          </div>
        ) : recentProjects.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg">
            <div className="text-4xl mb-3">🎬</div>
            <p>Noch keine Projekte. Erstelle dein erstes Storyboard!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onDelete={handleDeleteProject}
              />
            ))}
          </div>
        )}
      </div>

      {/* New Project Dialog */}
      <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neues Projekt erstellen</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="proj-name">Projektname</Label>
            <Input
              id="proj-name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createProject()}
              placeholder="z.B. Angelo vs Sherwood – Küchen-Drama"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewProjectOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={createProject} disabled={!projectName.trim()}>
              Erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
