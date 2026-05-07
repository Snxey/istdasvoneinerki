import { openDB, IDBPDatabase, DBSchema } from 'idb';
import type { Character, Project, AppSettings, StoryboardSlot } from './types';
import { DEFAULT_SETTINGS } from './types';

interface FruityStudioDB extends DBSchema {
  characters: {
    key: string;
    value: Character;
    indexes: { 'by-name': string; 'by-createdAt': number };
  };
  projects: {
    key: string;
    value: Omit<Project, 'slots'> & { slots: Omit<StoryboardSlot, 'imageBlob'>[] };
    indexes: { 'by-updatedAt': number };
  };
  images: {
    key: string; // `${projectId}:${slotId}`
    value: { key: string; blob: Blob; projectId: string; slotId: string };
    indexes: { 'by-projectId': string };
  };
  settings: {
    key: 'app';
    value: AppSettings & { key: 'app' };
  };
}

const DB_NAME = 'fruity-studio';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<FruityStudioDB>> | null = null;

function getDB(): Promise<IDBPDatabase<FruityStudioDB>> {
  if (!dbPromise) {
    dbPromise = openDB<FruityStudioDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const charStore = db.createObjectStore('characters', { keyPath: 'id' });
        charStore.createIndex('by-name', 'name');
        charStore.createIndex('by-createdAt', 'createdAt');

        const projStore = db.createObjectStore('projects', { keyPath: 'id' });
        projStore.createIndex('by-updatedAt', 'updatedAt');

        const imgStore = db.createObjectStore('images', { keyPath: 'key' });
        imgStore.createIndex('by-projectId', 'projectId');

        db.createObjectStore('settings', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

// ─── Characters ────────────────────────────────────────────────────────────────

export async function getAllCharacters(): Promise<Character[]> {
  const db = await getDB();
  return db.getAll('characters');
}

export async function getCharacter(id: string): Promise<Character | undefined> {
  const db = await getDB();
  return db.get('characters', id);
}

export async function saveCharacter(character: Character): Promise<void> {
  const db = await getDB();
  await db.put('characters', character);
}

export async function deleteCharacter(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('characters', id);
}

// ─── Projects ──────────────────────────────────────────────────────────────────

export async function getAllProjects(): Promise<Project[]> {
  const db = await getDB();
  const rawProjects = await db.getAllFromIndex('projects', 'by-updatedAt');
  rawProjects.reverse();

  const projects: Project[] = [];
  for (const raw of rawProjects) {
    const slotsWithBlobs = await hydrateSlots(raw.id, raw.slots);
    projects.push({ ...raw, slots: slotsWithBlobs });
  }
  return projects;
}

export async function getProject(id: string): Promise<Project | undefined> {
  const db = await getDB();
  const raw = await db.get('projects', id);
  if (!raw) return undefined;
  const slots = await hydrateSlots(id, raw.slots);
  return { ...raw, slots };
}

async function hydrateSlots(
  projectId: string,
  slots: Omit<StoryboardSlot, 'imageBlob'>[],
): Promise<StoryboardSlot[]> {
  const db = await getDB();
  const result: StoryboardSlot[] = [];
  for (const slot of slots) {
    const imgRecord = await db.get('images', `${projectId}:${slot.id}`);
    result.push({ ...slot, imageBlob: imgRecord?.blob });
  }
  return result;
}

export async function saveProject(project: Project): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['projects', 'images'], 'readwrite');

  const { slots, ...rest } = project;
  const slotsWithoutBlobs = slots.map(({ imageBlob: _, ...s }) => s);

  await tx.objectStore('projects').put({ ...rest, slots: slotsWithoutBlobs });

  for (const slot of slots) {
    const imgKey = `${project.id}:${slot.id}`;
    if (slot.imageBlob) {
      await tx.objectStore('images').put({
        key: imgKey,
        blob: slot.imageBlob,
        projectId: project.id,
        slotId: slot.id,
      });
    }
  }

  await tx.done;
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['projects', 'images'], 'readwrite');
  await tx.objectStore('projects').delete(id);

  const imgKeys = await tx.objectStore('images').index('by-projectId').getAllKeys(id);
  for (const key of imgKeys) {
    await tx.objectStore('images').delete(key);
  }
  await tx.done;
}

// ─── Settings ──────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<AppSettings> {
  const db = await getDB();
  const record = await db.get('settings', 'app');
  if (!record) return { ...DEFAULT_SETTINGS };
  const { key: _key, ...settings } = record;
  return settings;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await getDB();
  await db.put('settings', { key: 'app', ...settings });
}

// ─── Seed Characters ───────────────────────────────────────────────────────────

const SEED_CHARACTERS: Omit<Character, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'char-angelo',
    name: 'Angelo',
    description:
      'A 3D cartoon anthropomorphized orange fruit character. Round orange body with leaf on top, expressive cartoon eyes, small arms and legs, Pixar/Dreamworks animation style, vibrant colors, soft studio lighting.',
    tags: ['main', 'orange', 'protagonist'],
  },
  {
    id: 'char-sherwood',
    name: 'Sherwood',
    description:
      'A 3D cartoon anthropomorphized green apple character. Green apple body with brown stem, mischievous expression, cartoon eyes with eyebrows, Pixar/Dreamworks animation style.',
    tags: ['apple', 'side-character'],
  },
  {
    id: 'char-lola',
    name: 'Lola',
    description:
      'A 3D cartoon anthropomorphized strawberry character. Red strawberry body with green leaves on top, long eyelashes, feminine appearance, glossy 3D render, Pixar/Dreamworks animation style.',
    tags: ['strawberry', 'side-character', 'female'],
  },
];

export async function seedCharactersIfEmpty(): Promise<void> {
  const existing = await getAllCharacters();
  if (existing.length > 0) return;

  const now = Date.now();
  for (const char of SEED_CHARACTERS) {
    await saveCharacter({ ...char, createdAt: now, updatedAt: now });
  }
}

// ─── Cleanup ───────────────────────────────────────────────────────────────────

export async function cleanupOldProjects(olderThanDays = 30): Promise<number> {
  const db = await getDB();
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  const all = await db.getAllFromIndex('projects', 'by-updatedAt');
  const old = all.filter((p) => p.updatedAt < cutoff);

  for (const p of old) {
    await deleteProject(p.id);
  }
  return old.length;
}
