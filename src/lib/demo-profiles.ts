export interface DemoProfile {
  id: string;
  recipientName: string;
  interests: string[];
  occasion: string;
  budgetMax: number;
  description: string;
  image: string;
}

// These exact profiles have real Qloo recordings in demo-scenarios.json.
export const DEMO_PROFILES: DemoProfile[] = [
  { id: "persona-ghibli", recipientName: "Priya", interests: ["Björk", "Studio Ghibli", "Sally Rooney"], occasion: "Birthday", budgetMax: 80, description: "Art-pop, animated worlds & beautifully told stories.", image: "/images/vespertine.jpg" },
  { id: "persona-scifi", recipientName: "Devon", interests: ["Blade Runner", "Dune", "Frank Ocean"], occasion: "Holidays", budgetMax: 120, description: "Distant futures, cinematic worlds & late-night listening.", image: "/images/async.jpg" },
];
