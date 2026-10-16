# Tasteprint — AI Gift Discovery Through Cultural Taste

Tasteprint is an AI gift agent that finds thoughtful, unexpected gifts by reading a person's cultural taste print. It uses [Qloo](https://qloo.com)'s taste intelligence to connect interests across music, film, TV, books, and brands, then matches them to real products in a curated catalog.

Every search returns three angles on the same person:

- **Safe pick** — the gift with the strongest affinity to what they already love.
- **Surprising find** — a cross-domain discovery from Qloo's graph that they would never find by searching themselves.
- **Curated bundle** — a multi-item set that tells one taste story across categories, within budget.

Each pick comes with an explanation grounded in the recipient's taste signals.

## How it works

1. **Taste intake** — the shopper adds the recipient's interests (artists, movies, shows, books, brands), a budget, and an occasion.
2. **Entity resolution** — each interest is resolved to a Qloo entity via `GET /search`. As you type, a picker (`GET /api/search`) shows the matching Qloo nodes — name, type, popularity — so ambiguous names ("Dune" is a film, a book, an artist, an album…) can be pinned to the exact node. If a match was fuzzy, the result offers "did you mean" candidates to correct it in one click.
3. **Taste expansion** — the resolved entities are used as `signal.interests.entities` on `GET /v2/insights` to expand taste across four discovery domains (artists, brands, books, movies), with `feature.explainability=true`.
4. **Second hop** — the top first-hop discoveries are added to the signal mix and expansion runs again, so picks can be two degrees away from what the shopper typed, with the "via" chain retained for explanation.
5. **Catalog scoring** — every catalog item maps to a Qloo entity; candidate entity IDs are batch-scored with `filter.results.entities` so each product gets a real affinity score against the recipient's taste. Per-pick contributor shares come from Qloo's explainability payload.
6. **Lane selection** — safe / surprise / bundle picks are selected from the scored, budget-filtered pool: the safe lane tilts toward popularity + stock, the wild-card lane uses MMR diversification against the safe pick (niche affinity gets a boost), and the bundle is a budget-truncated search over high-affinity combinations with category/type/brand diversity bonuses.
7. **Explanation** — an LLM (optional) writes the copy from the structured evidence and interprets free-text refinement notes into structured actions; without an LLM key, built-in templates and regex note parsing are used instead.
8. **Refinement loop** — every pick can be reacted to: "not for them" (permanent avoid), "another like this" (lane rotation), boost/mute any interest (re-weights `signal.interests.entities.weight` and re-scores), bolder/grounded mood (biases `bias.trends`), free-text notes (budget regexes, keyword boosts), and budget re-runs. Constraint state lives on the client; the server stays stateless.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- Qloo API (`hackathon.api.qloo.com` during the hackathon)
- Optional OpenAI-compatible LLM for explanation copy

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in QLOO_API_KEY
npm run dev
```

Open http://localhost:3000.

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `QLOO_API_KEY` | yes | Hackathon API key from the [Qloo developer guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide#getting-your-api-key) |
| `QLOO_BASE_URL` | no | Defaults to `https://hackathon.api.qloo.com` |
| `LLM_API_KEY` | no | Any OpenAI-compatible key for richer explanation copy |
| `LLM_BASE_URL` | no | Defaults to `https://api.openai.com/v1` |
| `LLM_MODEL` | no | Defaults to `gpt-4o-mini` |

### Verify Qloo connectivity

```bash
curl http://localhost:3000/api/health
```

## API

`POST /api/recommend`

```json
{
  "recipientName": "Maya",
  "interests": ["Radiohead", "Studio Ghibli", "In the Mood for Love"],
  "budget": { "min": 0, "max": 120 },
  "occasion": "Birthday"
}
```

Returns resolved interests, the discovered taste map (1-hop and 2-hop entries), taste connections (`from → to at X%, via Y`), and the three picks with per-item affinity scores, contributor breakdowns (which of the shopper's interests drove the pick, with shares and "via" chains), reasons, and buy links.

`POST /api/stream` — the same agent over Server-Sent Events. Body:

```json
{ "kind": "recommend", "request": { "interests": ["Radiohead"] } }
```

or, to re-run with feedback (all constraint state is supplied by the caller):

```json
{
  "kind": "refine",
  "request": { "interests": ["Radiohead"] },
  "action": { "kind": "note", "text": "under $60, less Radiohead, bolder" },
  "constraints": { "avoidItemIds": ["tp-014"], "muteInterests": ["Radiohead"], "mood": "adventurous" }
}
```

Actions: `budget` (newMin/newMax), `avoid` (itemIds), `more` (lane + itemIds to rotate), `reset-picks`, `mood` (`adventurous` | `grounded` | `clear`), `boost` (interest, op = boost | mute | clear), `note` (free text — parsed for budget ranges, moods, and interest boosts/mutes).

The response is an SSE stream of transcript events (`stage`, `interest`, `expansion`, `warning`, `agent-note`, `selection`) terminated by a `result` event carrying the full result and the merged constraints (echo them back on the next refine call).

## Catalog

The demo catalog (`src/data/catalog.json`) is a curated set of products mapped to Qloo entities by name and type. Resolution to Qloo entity IDs happens at runtime and is cached in server memory. No Qloo response data is stored in this repository.

## Deploying

The app is built for Vercel: import the repo, add the environment variables, and deploy. Any Node.js host works with `npm run build && npm start`.

## License

MIT — see [LICENSE](LICENSE).
