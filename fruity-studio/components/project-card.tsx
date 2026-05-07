'use client';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Trash2, Images, CheckCircle } from 'lucide-react';
import type { Project } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { useMemo, useEffect, useState } from 'react';

interface ProjectCardProps {
  project: Project;
  onDelete: (id: string) => void;
}

export function ProjectCard({ project, onDelete }: ProjectCardProps) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  const approvedCount = useMemo(
    () => project.slots.filter((s) => s.status === 'approved').length,
    [project.slots],
  );
  const readyCount = useMemo(
    () => project.slots.filter((s) => s.status === 'ready' || s.status === 'approved').length,
    [project.slots],
  );

  useEffect(() => {
    const firstImage = project.slots.find((s) => s.imageBlob)?.imageBlob;
    if (firstImage) {
      const url = URL.createObjectURL(firstImage);
      setThumbUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [project.slots]);

  return (
    <Card className="group overflow-hidden hover:border-primary/40 transition-all">
      <div className="relative aspect-video bg-muted overflow-hidden">
        {thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbUrl} alt={project.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl">🎬</div>
        )}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <Link href={`/projects/${project.id}`}>
            <Button size="sm">Öffnen</Button>
          </Link>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Projekt löschen?</AlertDialogTitle>
                <AlertDialogDescription>
                  &quot;{project.name}&quot; und alle generierten Bilder werden dauerhaft gelöscht.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onDelete(project.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Löschen
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      <CardContent className="pt-3 pb-4">
        <Link href={`/projects/${project.id}`} className="hover:text-primary transition-colors">
          <h3 className="font-semibold truncate">{project.name}</h3>
        </Link>
        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Images className="h-3 w-3" />
            {readyCount}/9 generiert
          </span>
          {approvedCount > 0 && (
            <span className="flex items-center gap-1 text-green-500">
              <CheckCircle className="h-3 w-3" />
              {approvedCount} genehmigt
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{formatDate(project.updatedAt)}</p>
      </CardContent>
    </Card>
  );
}
