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
    protocolVersion: z.literal(1),
    sampleRate: z.number(),
    codec: z.literal("pcm16"),
    scenario: z.string().optional(),
  }),
  z.object({ type: z.literal("utterance.begin"), turnId: z.string() }),
  z.object({
    type: z.literal("audio.delta"),
    turnId: z.string(),
    sequence: z.number().int().nonnegative(),
    data: z.string(),
  }),
  z.object({ type: z.literal("utterance.end"), turnId: z.string() }),
]);

export type ClientEvent = z.infer<typeof clientEventSchema>;

export const serverEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("session.ready"),
    sessionId: z.string(),
    protocolVersion: z.literal(1),
  }),
  z.object({ type: z.literal("asr.partial"), turnId: z.string(), text: z.string() }),
  z.object({
    type: z.literal("prosody.update"),
    turnId: z.string(),
    prosody: prosodySchema,
  }),
  z.object({
    type: z.literal("asr.final"),
    turnId: z.string(),
    text: z.string(),
    prosody: prosodySchema.optional(),
  }),
  z.object({
    type: z.literal("response.delta"),
    turnId: z.string(),
    branch: branchSchema,
    text: z.string(),
  }),
  z.object({ type: z.literal("response.done"), turnId: z.string(), branch: branchSchema }),
  z.object({
    type: z.literal("turn.profile"),
    turnId: z.string(),
    profile: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal("error"),
    code: z.string(),
    message: z.string(),
    turnId: z.string().optional(),
    stage: z.string().optional(),
    branch: branchSchema.optional(),
    retryable: z.boolean().optional(),
  }),
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
