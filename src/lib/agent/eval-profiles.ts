import type { RecommendRequest, SessionConstraints } from "./types";

/**
 * Fixed recipient profiles for the eval harness. Each one probes a different
 * failure mode: tight budgets, single-interest runs, category filters, muted
 * interests, avoided picks, and ambiguity-prone names.
 */
export interface EvalProfile {
  id: string;
  label: string;
  request: RecommendRequest;
  constraints?: Partial<SessionConstraints>;
}

export const EVAL_PROFILES: EvalProfile[] = [
  {
    id: "ghibli-birthday",
    label: "Ghibli + Björk + Sally Rooney, $80 birthday",
    request: {
      recipientName: "Priya",
      interests: ["Björk", "Studio Ghibli", "Sally Rooney"],
      occasion: "Birthday",
      budget: { min: 0, max: 80 },
    },
  },
  {
    id: "scifi-holidays",
    label: "Blade Runner + Dune + Frank Ocean, $120 holidays",
    request: {
      recipientName: "Devon",
      interests: ["Blade Runner", "Dune", "Frank Ocean"],
      occasion: "Holidays",
      budget: { min: 0, max: 120 },
    },
  },
  {
    id: "tight-budget",
    label: "Single interest, $25 ceiling — bundle must shrink or be skipped",
    request: {
      recipientName: "Sam",
      interests: ["Radiohead"],
      occasion: "Just because",
      budget: { min: 0, max: 25 },
    },
  },
  {
    id: "art-print-only",
    label: "Category filter: Art Print only",
    request: {
      recipientName: "Noor",
      interests: ["Radiohead", "Björk"],
      occasion: "Birthday",
      budget: { min: 0, max: 60 },
      categories: ["Art Print"],
    },
  },
  {
    id: "muted-interest",
    label: "Radiohead muted — picks must lean on the other signal",
    request: {
      recipientName: "Alex",
      interests: ["Radiohead", "Studio Ghibli"],
      occasion: "Housewarming",
      budget: { min: 0, max: 100 },
    },
    constraints: { muteInterests: ["Radiohead"], avoidItemIds: [], priorItemIds: [], boostInterests: [] },
  },
  {
    id: "avoid-first-pick",
    label: "Top pick avoided — must not return",
    request: {
      recipientName: "Jo",
      interests: ["Frank Ocean", "SZA"],
      occasion: "Anniversary",
      budget: { min: 0, max: 90 },
    },
    constraints: { avoidItemIds: ["tp-003"], priorItemIds: [], muteInterests: [], boostInterests: [] },
  },
  {
    id: "ambiguous-dune",
    label: "Ambiguous name: Dune (film vs book)",
    request: {
      recipientName: "Kai",
      interests: ["Dune", "Muji"],
      occasion: "Birthday",
      budget: { min: 0, max: 75 },
    },
  },
  {
    id: "grounded-mood",
    label: "Grounded mood — mainstream picks",
    request: {
      recipientName: "Rae",
      interests: ["Tyler, the Creator", "A24"],
      occasion: "Holidays",
      budget: { min: 0, max: 110 },
    },
    constraints: { mood: "grounded", avoidItemIds: [], priorItemIds: [], muteInterests: [], boostInterests: [] },
  },
  {
    id: "adventurous-mood",
    label: "Adventurous mood — bold picks",
    request: {
      recipientName: "Mira",
      interests: ["In the Mood for Love", "Björk"],
      occasion: "Just because",
      budget: { min: 0, max: 130 },
    },
    constraints: { mood: "adventurous", avoidItemIds: [], priorItemIds: [], muteInterests: [], boostInterests: [] },
  },
  {
    id: "two-categories",
    label: "Multi-category filter: Reading + Art Print",
    request: {
      recipientName: "Theo",
      interests: ["Sally Rooney", "Studio Ghibli"],
      occasion: "Birthday",
      budget: { min: 0, max: 95 },
      categories: ["Reading", "Art Print"],
    },
  },
];
