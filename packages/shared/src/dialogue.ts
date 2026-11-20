import { z } from 'zod';

export const EMOTIONS = ['neutral', 'happy', 'angry', 'scared', 'smug', 'surprised'] as const;

export const DialogueLineSchema = z.object({
  id: z.string(),
  speaker: z.string(),
  situation: z.string(),
  emotion: z.enum(EMOTIONS).default('neutral'),
  bn: z.string().min(1),
  en: z.string(),
  /** Recorded voice file (e.g. /assets/voice/hero.greet.1.ogg). Null = subtitle only. */
  audio: z.string().nullable().optional(),
  weight: z.number().positive().optional(),
});

export const DialogueFileSchema = z.object({
  speakers: z.record(
    z.string(),
    z.object({ name: z.string(), nameEn: z.string(), color: z.string() }),
  ),
  lines: z.array(DialogueLineSchema),
});

export type DialogueLine = z.infer<typeof DialogueLineSchema>;
export type DialogueFile = z.infer<typeof DialogueFileSchema>;
