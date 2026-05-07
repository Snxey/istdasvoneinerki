'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAppStore } from '@/lib/store';
import { getSettings, saveSettings, cleanupOldProjects } from '@/lib/db';
import { useToast } from '@/hooks/use-toast';
import type { AppSettings, ImageDimension, PollinationsModel } from '@/lib/types';
import { Settings, Trash2, Eye, EyeOff, Loader2 } from 'lucide-react';

export default function SettingsPage() {
  const { settings, setSettings } = useAppStore();
  const [local, setLocal] = useState<AppSettings>(settings);
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    getSettings().then((s) => {
      setLocal(s);
      setSettings(s);
    });
  }, [setSettings]);

  async function handleSave() {
    setSaving(true);
    try {
      await saveSettings(local);
      setSettings(local);

      // Also persist token to .env.local via API
      if (local.huggingfaceToken !== settings.huggingfaceToken) {
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            huggingfaceToken: local.huggingfaceToken,
            defaultProvider: local.defaultProvider,
          }),
        });
      }

      toast({ title: 'Einstellungen gespeichert.' });
    } catch (err) {
      toast({
        title: 'Fehler',
        description: err instanceof Error ? err.message : 'Unbekannter Fehler',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleCleanup() {
    setCleaning(true);
    try {
      const count = await cleanupOldProjects(30);
      toast({
        title: 'Bereinigung abgeschlossen',
        description: count > 0 ? `${count} alte Projekte gelöscht.` : 'Keine alten Projekte gefunden.',
      });
    } finally {
      setCleaning(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Settings className="h-7 w-7 text-primary" />
          Einstellungen
        </h1>
        <p className="text-muted-foreground mt-1">Bildgenerierung und Speicheroptionen</p>
      </div>

      {/* Generation settings */}
      <Card>
        <CardHeader>
          <CardTitle>Bildgenerierung</CardTitle>
          <CardDescription>Standard-Provider und Bildformat</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">HuggingFace als Standard</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Standard ist Pollinations.ai (kein Token benötigt)
              </p>
            </div>
            <Switch
              checked={local.defaultProvider === 'huggingface'}
              onCheckedChange={(checked) =>
                setLocal((p) => ({ ...p, defaultProvider: checked ? 'huggingface' : 'pollinations' }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Standard-Modell (Pollinations)</Label>
            <Select
              value={local.defaultModel}
              onValueChange={(v) => setLocal((p) => ({ ...p, defaultModel: v as PollinationsModel }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="flux">FLUX (Standard)</SelectItem>
                <SelectItem value="flux-realism">FLUX Realism</SelectItem>
                <SelectItem value="turbo">Turbo (schneller)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Standard-Bildgröße</Label>
            <Select
              value={local.defaultDimension}
              onValueChange={(v) => setLocal((p) => ({ ...p, defaultDimension: v as ImageDimension }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1024x1024">1024×1024 (Quadrat, Standard)</SelectItem>
                <SelectItem value="1024x1792">1024×1792 (Hochformat / TikTok)</SelectItem>
                <SelectItem value="1792x1024">1792×1024 (Querformat)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* HuggingFace token */}
      <Card>
        <CardHeader>
          <CardTitle>HuggingFace Token</CardTitle>
          <CardDescription>
            Für den FLUX.1-schnell Fallback. Kostenloser Account ausreichend.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="hf-token">API Token</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="hf-token"
                  type={showToken ? 'text' : 'password'}
                  value={local.huggingfaceToken}
                  onChange={(e) => setLocal((p) => ({ ...p, huggingfaceToken: e.target.value }))}
                  placeholder="hf_..."
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Token wird lokal gespeichert (IndexedDB + .env.local). Nicht an externe Dienste gesendet.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Storage */}
      <Card>
        <CardHeader>
          <CardTitle>Speicher</CardTitle>
          <CardDescription>Lokale Daten verwalten</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Alte Projekte bereinigen</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Löscht Projekte, die älter als 30 Tage sind
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCleanup}
              disabled={cleaning}
              className="gap-2"
            >
              {cleaning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Bereinigen
            </Button>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Einstellungen speichern
      </Button>
    </div>
  );
}
