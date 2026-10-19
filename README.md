<p align="center">
  <img src="https://img.shields.io/badge/Qloo-Taste_Intelligence-6C63FF?style=for-the-badge" alt="Qloo Taste Intelligence" />
  <img src="https://img.shields.io/badge/Next.js-16-000?style=for-the-badge&logo=nextdotjs" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT License" />
</p>

# 🎁 Tasteprint — Autonomous Gift Discovery Agent

> *"A deterministic pipeline is not an agent. An agent reasons, plans, uses tools, handles surprises, and adapts to the shopper."*  
> **Built for the Qloo AI Agent Hackathon.**

Tasteprint is an autonomous AI gift agent that discovers thoughtful, unexpected gifts by navigating a person's **cultural taste graph**. Instead of rigid keyword matching, an LLM agent uses [Qloo](https://qloo.com)'s cultural intelligence API as discrete tools to reason across music, film, TV, books, and brands — matching recipient taste to real products in a curated catalog.

Every search delivers **three distinct angles** on the same person:

| Lane | What it does |
|------|-------------|
| 🟢 **Safe Bet** | The gift with the strongest affinity to what they already love |
| 🩷 **Wild Card** | A cross-domain discovery from Qloo's graph they'd never find themselves |
| 🟡 **The Bundle** | A multi-item set that tells one taste story across categories, within budget |

---

## 🧠 What Makes Tasteprint an Agent (Not a Pipeline)

Most hackathon projects wrap an API in a fixed sequence: `resolve → expand → score → select`. Tasteprint is fundamentally different:

1. **Autonomous Tool-Calling Loop (`agent.ts`):**  
   The LLM drives the hunt in an open loop up to 8 bounded steps, calling discrete tools:
   - `resolve_entity`: Disambiguates free-text interests across 700M+ entities (e.g. film vs book).
   - `expand_taste`: Explores multi-domain neighbors; decides whether hop-1 affinity density justifies a second-hop bridge.
   - `score_candidates`: Computes statistical affinity vectors between recipient taste graph and real catalog products.
   - `check_budget`: Price-checks proposed combinations against the shopper's budget ceiling before committing.
   - `select_lanes`: Commits the final Safe Bet, Wild Card, and Bundle.
2. **Re-planning on Constraint Violations:**  
   If a proposed bundle blows the budget, the agent receives the error, re-evaluates the candidate pool, and re-plans with cheaper items or a 2-item bundle.
3. **Live Radial Taste Graph (`TasteGraph.tsx`):**  
   Rather than rendering a flat list, Tasteprint draws an interactive SVG radial graph as discoveries stream in over SSE (`Recipient → Direct Seeds → Hop 1 → Hop 2`), showing real affinity percentages and `via` attribution chains.
4. **Fail-Safe Fallback Pipeline (`pipeline.ts`):**  
   If no LLM key is configured, rate limits fire, or the agent loop exhausts its steps, the system transparently falls back to our deterministic pipeline so the demo never dies on stage.
5. **Adversarial Invariant Eval Harness (`npm run eval`):**  
   10 fixed adversarial recipient profiles tested against catalog authenticity, per-lane budget compliance, category divergence (wild card $\neq$ safe category), and zero cross-lane duplication.
6. **Hardened Demo Replay Mode (`TASTEPRINT_REPLAY=1`):**  
   Instant offline playback from recorded golden fixtures (`demo-scenarios.json`) ensuring stage demonstrations never hang under network or rate-limiting delays.

---

## ✨ Key Features

- **LLM Tool Loop** — autonomous reasoning over Qloo tools with real-time SSE progress events
- **Interactive Taste Graph** — radial SVG visualization of two-hop cultural connections
- **Voice Refinement** — Web Speech API integration to refine gifts using your natural shopper voice
- **Real Product Links** — direct product pages and honest store labeling (`Find on Amazon ↗`, `Shop A24 ↗`, `Shop Criterion ↗`)
- **Automated Invariant Eval** — `npm run eval` gates quality across 10 adversarial profiles
- **Stateless Client Architecture** — full session refinement state persists in the browser URL
- **Fail-Safe Fast Path** — seamless fallback to deterministic pipeline if LLM is unavailable

## 🏗️ Architecture

```mermaid
flowchart LR
    subgraph Client["Browser (React)"]
        UI["Gift Finder UI"]
    end

    subgraph Server["Next.js API Routes"]
        STREAM["/api/stream"]
        REC["/api/recommend"]
        SEARCH["/api/search"]
        HEALTH["/api/health"]
    end

    subgraph Agent["Recommendation Agent"]
        PIPE["Pipeline"]
        ACT["Refinement Actions"]
        EXP["Explanation Engine"]
    end

    subgraph External["External APIs"]
        QLOO["Qloo Taste API"]
        LLM["LLM (Optional)"]
    end

    subgraph Data["Data Layer"]
        CAT["Product Catalog\n(171 items)"]
        CACHE["In-Memory Cache"]
    end

    UI -->|SSE| STREAM
    UI -->|POST| REC
    UI -->|GET| SEARCH
    STREAM --> PIPE
    REC --> PIPE
    SEARCH --> QLOO
    PIPE --> ACT
    PIPE --> EXP
    PIPE --> QLOO
    EXP --> LLM
    PIPE --> CAT
    QLOO --> CACHE
```

---

## 🔄 How It Works — The Recommendation Pipeline

```mermaid
flowchart TD
    A["🎯 Taste Intake\nShopper enters interests, budget, occasion"] --> B["🔍 Entity Resolution\nResolve each interest to a Qloo entity via /search\nHandles ambiguity: 'Dune' → film? book? artist?"]
    B --> C["🌐 Taste Expansion (Hop 1)\nExpand across 4 domains:\nArtists · Brands · Books · Movies\nvia /v2/insights with explainability"]
    C --> D["🔗 Second Hop\nTop first-hop discoveries become bridge signals\nExpansion runs again — picks can be\ntwo degrees from the original input"]
    D --> E["📊 Catalog Scoring\nBatch-score catalog items against taste signal\nEach product gets a real affinity score\nwith per-pick contributor shares"]
    E --> F["🎰 Lane Selection\nSafe: popularity + stock weighted\nSurprise: MMR diversification, niche boost\nBundle: budget-constrained combinatorial search"]
    F --> G["✍️ Explanation\nLLM writes copy from structured evidence\n(or built-in templates as fallback)"]
    G --> H["🔁 Refinement Loop\nUser reacts → constraints update → re-score"]
    H -->|"New constraints"| E
```

### Pipeline Stages in Detail

| Stage | Qloo API | What happens |
|-------|----------|-------------|
| **Entity Resolution** | `GET /search` | Each interest → Qloo entity ID. Ambiguous names show alternatives with "did you mean?" |
| **Taste Expansion** | `GET /v2/insights` | Resolved entities used as `signal.interests.entities` across 4 discovery domains. `feature.explainability=true` enables contributor tracking |
| **Second Hop** | `GET /v2/insights` | Top first-hop discoveries added to signal mix → expansion runs again. "Via" chains retained for explanation |
| **Catalog Scoring** | `GET /v2/insights` | Candidate entity IDs batch-scored with `filter.results.entities` so each product gets a real affinity score |
| **Lane Selection** | — | Safe lane: popularity + stock tilt. Wild card: MMR diversification against safe pick (niche affinity boosted). Bundle: budget-truncated search with category/type/brand diversity bonuses. Optional category filter (`categories`) constrains the pool to chosen product categories |
| **Explanation** | — | LLM (optional) writes copy from structured evidence. Without an LLM key, built-in templates are used |

---

## 🔁 Refinement Loop

Every pick can be reacted to — the agent re-scores with updated constraints while the server stays fully stateless:

```mermaid
flowchart LR
    A["User Reaction"] --> B{"Action Type"}
    B --> C["👎 Not for them\n→ permanent avoid"]
    B --> D["🔄 Another like this\n→ lane rotation"]
    B --> E["⬆️⬇️ Boost / Mute\n→ re-weight interests"]
    B --> F["🎨 Mood shift\n→ adventurous / grounded"]
    B --> G["💬 Free-text note\n→ parsed for budget,\nmoods, interest changes"]
    B --> H["💰 Budget change\n→ re-run with new range"]
    C & D & E & F & G & H --> I["Updated Constraints"]
    I --> J["🔄 Re-score & Select"]
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | [Next.js 16](https://nextjs.org) (App Router) |
| **Language** | TypeScript 5 |
| **UI** | React 19 + Tailwind CSS 4 |
| **Taste Intelligence** | [Qloo API](https://qloo.com) (`hackathon.api.qloo.com`) |
| **Explanation Copy** | Any OpenAI-compatible LLM (optional) |
| **Deployment** | Vercel / any Node.js host |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ 
- **Qloo API Key** — get one from the [Qloo Developer Guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide#getting-your-api-key)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/tasteprint.git
cd tasteprint

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local and add your QLOO_API_KEY

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) 🎉

### Verify Qloo Connectivity

```bash
curl http://localhost:3000/api/health
```

A successful response confirms the API key is valid and the Qloo API is reachable.

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `QLOO_API_KEY` | ✅ Yes | — | Hackathon API key from the [Qloo Developer Guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide#getting-your-api-key) |
| `QLOO_BASE_URL` | No | `https://hackathon.api.qloo.com` | Qloo API base URL |
| `LLM_API_KEY` | No | — | Any OpenAI-compatible key for richer explanation copy |
| `LLM_BASE_URL` | No | `https://api.openai.com/v1` | LLM endpoint (works with Groq, Together, etc.) |
| `LLM_MODEL` | No | `gpt-4o-mini` | Model to use for explanations |

---

## 📡 API Reference

### `POST /api/recommend`

Synchronous recommendation — returns the full result in one JSON response.

```json
{
  "recipientName": "Maya",
  "interests": ["Radiohead", "Studio Ghibli", "In the Mood for Love"],
  "budget": { "min": 0, "max": 120 },
  "occasion": "Birthday"
}
```

**Response** includes:
- Resolved interests with alternates and candidates
- Discovered taste map (1-hop and 2-hop entries)
- Taste connections (`from → to at X%, via Y`)
- Three gift picks with per-item affinity scores, contributor breakdowns, reasons, and buy links

---

### `POST /api/stream`

The same agent over **Server-Sent Events** — streams real-time progress events.

**Initial recommendation:**

```json
{ "kind": "recommend", "request": { "interests": ["Radiohead"] } }
```

**Refinement (with constraint state from the client):**

```json
{
  "kind": "refine",
  "request": { "interests": ["Radiohead"] },
  "action": { "kind": "note", "text": "under $60, less Radiohead, bolder" },
  "constraints": {
    "avoidItemIds": ["tp-014"],
    "muteInterests": ["Radiohead"],
    "mood": "adventurous"
  }
}
```

**SSE Event Types:**

| Event | Description |
|-------|-------------|
| `stage` | Pipeline stage update (resolve, expand, hop2, score, select, explain) |
| `interest` | An interest resolved to a Qloo entity |
| `expansion` | A taste discovery from the expansion phase |
| `agent-step` | A tool decision made by the LLM agent |
| `warning` | Non-fatal issue (e.g., a domain failed) |
| `agent-note` | Internal agent observation |
| `selection` | Lane selection summary |
| `result` | Final payload with picks + merged constraints |

**Refinement Actions:**

| Action | Description |
|--------|-------------|
| `budget` | Set `newMin` / `newMax` |
| `avoid` | Permanently exclude items by ID |
| `more` | Rotate a lane's pick (keep exploring) |
| `reset-picks` | Clear prior-item memory |
| `mood` | `adventurous` · `grounded` · `clear` |
| `boost` | Boost / mute / clear an interest's weight |
| `note` | Free text — auto-parsed for budget, moods, interest changes |

---

### `GET /api/search?q=radiohead`

Entity search endpoint — returns Qloo entities matching the query with name, type, and popularity. Used by the interest picker in the UI for typeahead disambiguation.

---

### `GET /api/health`

Returns Qloo API connectivity status and key validity.

---

### `GET /api/eval`

Runs fixed recipient profiles through the recommendation engine and checks catalog, budget, category, duplication, and evidence invariants. Add `?engine=pipeline` to force the deterministic engine or `?only=ghibli-birthday` to run one profile.

```bash
npm run eval
npm run eval -- --engine=pipeline
```

---

## 🗂️ Project Structure

```
tasteprint/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Main gift finder UI (React client component)
│   │   ├── layout.tsx            # Root layout
│   │   └── api/
│   │       ├── health/route.ts   # Health check endpoint
│   │       ├── recommend/route.ts # Sync recommendation endpoint
│   │       ├── stream/route.ts   # SSE streaming endpoint
│   │       ├── eval/route.ts     # Recommendation eval endpoint
│   │       └── search/route.ts   # Entity search for typeahead
│   ├── lib/
│   │   ├── agent/
│   │   │   ├── pipeline.ts       # Core recommendation pipeline (~1100 lines)
│   │   │   ├── agent.ts          # LLM-directed Qloo tool loop
│   │   │   ├── tools.ts          # Guarded agent tool implementations
│   │   │   ├── invariants.ts     # Engine-independent result checks
│   │   │   ├── types.ts          # TypeScript types for the agent
│   │   │   ├── actions.ts        # Refinement action handlers + note parser
│   │   │   ├── explain.ts        # LLM / template explanation generator
│   │   │   └── llm-note.ts       # LLM-driven note interpretation
│   │   ├── qloo/
│   │   │   ├── client.ts         # Qloo API client (retry, rate-limit, cache)
│   │   │   └── types.ts          # Qloo API type definitions
│   │   └── catalog.ts            # Catalog loader
│   ├── data/
│   │   └── catalog.json          # 171 curated products mapped to Qloo entities
│   └── instrumentation.ts       # Server startup (catalog warm-up)
├── .env.example
├── package.json
├── tsconfig.json
└── LICENSE
```

---

## 🛒 Catalog

The demo catalog (`src/data/catalog.json`) contains **171 curated products** across 16 categories:

| Category | Count | Examples |
|----------|-------|---------|
| Music | 44 | Vinyl LPs (Radiohead, Frank Ocean, Björk, Miles Davis, Beyoncé…) |
| Reading | 30 | Books, hardcovers, e-readers |
| Film | 32 | Criterion Collection, 4K UHD, box sets, TV series |
| Art Print | 9 | Posters, art prints |
| Stationery | 5 | Journals, notebooks |
| Gaming | 12 | Switch/PS5 games, controllers, consoles |
| Photography | 4 | Cameras, film |
| Gift | 4 | Memberships, gadgets |
| Apparel | 7 | Sneakers, fleece, beanies |
| Home | 5 | Lamps, candles, décor |
| Coffee | 3 | Grinders, brewers |
| Collectible | 4 | LEGO, figures, plush |
| Music Tech | 7 | Turntables, headphones, speakers |
| Beauty | 3 | Fragrance, skincare |
| Outdoors | 1 | Drinkware |
| Tea | 1 | Tea collections |

**Price range:** $9 – $199

Each product maps to a Qloo entity by name and type. Product artwork is the mapped entity's own image from Qloo's graph (album art, posters, covers, brand marks); items without entity artwork render an initial tile instead of a stock photo. Entity IDs are pre-resolved at build time (`npm run catalog:resolve` writes `src/data/catalog-entities.json`, which is checked in) so a cold start doesn't pay ~170 entity searches; unmapped items fall back to runtime resolution with a server-memory cache. **No bulk Qloo response data is stored in this repository.**

---

## 🚢 Deploying

### Vercel (Recommended)

1. Import the repository on [Vercel](https://vercel.com)
2. Add the environment variables (`QLOO_API_KEY` at minimum)
3. Deploy

### Self-hosted

```bash
npm run build
npm start
```

Works on any Node.js 18+ host.

---

## 📐 Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Stateless server** | All constraint state lives on the client — the server can be horizontally scaled or replaced without session affinity |
| **Two-hop expansion** | A single hop stays too close to stated interests. The second hop through bridge entities surfaces genuinely surprising connections |
| **Three lanes** | Safe / Surprise / Bundle covers the full confidence spectrum — from "can't go wrong" to "I had no idea" |
| **MMR diversification** | The wild-card pick uses Maximal Marginal Relevance against the safe pick to guarantee it feels different |
| **Optional LLM** | The app is fully functional without an LLM key. Templates and regex parsing handle the common cases; the LLM adds polish |
| **SSE streaming** | The pipeline takes 3–8 seconds. Streaming keeps the user engaged with real-time stage updates and discoveries |

---

## 🏆 Built For

**Qloo LLM Hackathon** — showcasing Qloo's taste intelligence API for cross-domain cultural discovery.

## 📄 License

MIT — see [LICENSE](LICENSE).
