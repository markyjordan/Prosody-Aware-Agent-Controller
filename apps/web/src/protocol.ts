import { z } from "zod";

export const prosodyFeaturesSchema = z.object({
  f0Mean: z.number().nullable().optional(),
  f0Range: z.number().nullable().optional(),
  energy: z.number().nullable().optional(),
  speechRate: z.number().nullable().optional(),
});

export const prosodySchema = z.object({
  labels: z.array(z.string()),
  features: prosodyFeaturesSchema.optional(),
  confidence: z.number().nullable().optional(),
});

export type ProsodyFeatures = z.infer<typeof prosodyFeaturesSchema>;
export type Prosody = z.infer<typeof prosodySchema>;

const branchSchema = z.enum(["baseline", "prosodic"]);

export type Branch = z.infer<typeof branchSchema>;

export const clientEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("session.init"),
    sampleRate: z.number(),
    codec: z.literal("pcm16"),
    scenario: z.string().optional(),
  }),
  z.object({ type: z.literal("utterance.begin") }),
  z.object({ type: z.literal("audio.delta"), data: z.string() }),
  z.object({ type: z.literal("utterance.end") }),
]);

export type ClientEvent = z.infer<typeof clientEventSchema>;

export const serverEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("asr.partial"), text: z.string() }),
  z.object({ type: z.literal("prosody.update"), prosody: prosodySchema }),
  z.object({
    type: z.literal("asr.final"),
    text: z.string(),
    prosody: prosodySchema,
  }),
  z.object({
    type: z.literal("response.delta"),
    branch: branchSchema,
    text: z.string(),
  }),
  z.object({ type: z.literal("response.done"), branch: branchSchema }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
]);

export type ServerEvent = z.infer<typeof serverEventSchema>;

// ---- v2 condition-endpoint types ----

export interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export const conditionRequestSchema = z.object({
  history: z.array(
    z.object({ id: z.string(), role: z.enum(["user", "assistant"]), content: z.string() }),
  ),
  turn: z.object({
    transcript: z.string(),
    prosody: prosodySchema.optional(),
  }),
  scenario: z.string().optional(),
});

export type ConditionRequest = z.infer<typeof conditionRequestSchema>;
