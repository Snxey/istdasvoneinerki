'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ScriptTab } from '@/components/script-tab';
import { StoryboardTab } from '@/components/storyboard-tab';
import { ExportTab } from '@/components/export-tab';
import { useAppStore } from '@/lib/store';
import {
  getProject,
  saveProject,
  getAllCharacters,
  getSettings,
  seedCharactersIfEmpty,
} from '@/lib/db';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Save, Loader2, FileText, Grid3X3, Download } from 'lucide-react';

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { currentProject, setCurrentProject, setCharacters, setSettings } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    async function load() {
      await seedCharactersIfEmpty();
      const [project, chars, settings] = await Promise.all([
        getProject(id),
        getAllCharacters(),
        getSettings(),
      ]);

      if (!project) {
        toast({ title: 'Projekt nicht gefunden', variant: 'destructive' });
        router.push('/');
        return;
      }

      setCurrentProject(project);
      setCharacters(chars);
      setSettings(settings);
      setLoading(false);
    }
    load();
    return () => setCurrentProject(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSave = useCallback(async () => {
    if (!currentProject) return;
    setSaving(true);
    try {
      await saveProject({ ...currentProject, updatedAt: Date.now() });
    } catch (err) {
      toast({
        title: 'Fehler beim Speichern',
        description: err instanceof Error ? err.message : 'Unbekannter Fehler',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [currentProject, toast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!currentProject) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold truncate max-w-xs sm:max-w-md">{currentProject.name}</h1>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleSave}
          disabled={saving}
          className="gap-2"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Speichern
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="script">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="script" className="gap-2 flex-1 sm:flex-none">
            <FileText className="h-4 w-4" />
            Skript
          </TabsTrigger>
          <TabsTrigger value="storyboard" className="gap-2 flex-1 sm:flex-none">
            <Grid3X3 className="h-4 w-4" />
            Storyboard
          </TabsTrigger>
          <TabsTrigger value="export" className="gap-2 flex-1 sm:flex-none">
            <Download className="h-4 w-4" />
            Export
          </TabsTrigger>
        </TabsList>

        <TabsContent value="script" className="mt-4">
          <ScriptTab onSave={handleSave} />
        </TabsContent>

        <TabsContent value="storyboard" className="mt-4">
          <StoryboardTab onSave={handleSave} />
        </TabsContent>

        <TabsContent value="export" className="mt-4">
          <ExportTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
