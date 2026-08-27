export const scenarios = [
  {
    id: "uncertain-yes",
    utterance: "Sure.",
    labels: ["uncertain", "low-confidence"],
    confidence: 0.42,
    features: { f0Mean: 181.2, f0Range: 38.5, energy: -31.4, speechRate: 3.9 },
    baseline: "Great, I'll go ahead and implement the plan.",
    prosodic:
      "We can explore another option if you're not certain about this one.",
  },
  {
    id: "confident-yes",
    utterance: "Yeah, go ahead.",
    labels: ["confident", "positive-valence"],
    confidence: 0.93,
    features: { f0Mean: 196.8, f0Range: 52.1, energy: -18.2, speechRate: 5.6 },
    baseline: "On it — kicking off the implementation now.",
    prosodic: "Love the enthusiasm — starting right away.",
  },
  {
    id: "hesitant-stop",
    utterance: "Stop... wait.",
    labels: ["hesitant", "interrupt"],
    confidence: 0.78,
    features: { f0Mean: 172.4, f0Range: 71.3, energy: -24.7, speechRate: 2.8 },
    baseline: "Paused. What would you like to do next?",
    prosodic:
      "Stopping mid-track — it sounds like you changed your mind halfway through, so let's regroup before I touch anything.",
  },
  {
    id: "sarcastic-frustration",
    utterance: "Oh great, it broke again.",
    labels: ["sarcastic", "negative-valence", "frustrated"],
    confidence: 0.86,
    features: { f0Mean: 205.3, f0Range: 84.6, energy: -16.9, speechRate: 4.4 },
    baseline: "Wonderful! Anything else going well today?",
    prosodic:
      "That sounds genuinely frustrating, not fine at all — let's figure out what broke and get it stable again.",
  },
];

export function scenarioById(id) {
  return scenarios.find((s) => s.id === id) ?? scenarios[0];
}
