# 🎬 Tasteprint — 3-Minute Demo Video Script

> **Judged Track:** AI Agent Hackathon / Qloo Taste Intelligence  
> **Production Target:** 2m 50s – 3m 00s (Hard stop at 3:00)  
> **Environment:** Deployed production URL on Vercel (clean browser window, no devtools)  
> **Audio:** Clear voiceover with subtle lo-fi background music ducked during speech

---

## ⏱️ Video Timeline Overview

| Timestamp | Duration | Section | On-Screen Action | Voiceover Focus |
|---|---|---|---|---|
| **0:00 – 0:10** | 10s | **The Problem** | Opening hook on Tasteprint landing page | Why keyword matching fails at gifting |
| **0:10 – 0:25** | 15s | **Recipient Persona** | Entering Priya: Björk, Studio Ghibli, Sally Rooney | Cultural seeds instead of gift categories |
| **0:25 – 0:50** | 25s | **Agentic Reasoning** | Live SSE transcript & tool calls unfolding | LLM driving Qloo tools in an open loop |
| **0:50 – 1:15** | 25s | **The Three Angles & Surprise Pick** | Safe Bet, Wild Card, The Bundle | Cross-domain "via" attribution chain |
| **1:15 – 1:35** | 20s | **Shopper Refinement** | Natural text / Voice note refinement | Interactive re-planning & budget adjustments |
| **1:35 – 1:55** | 20s | **The Taste Graph** | Full radial graph visualization | Visual proof of 2-hop cultural intelligence |
| **1:55 – 2:15** | 20s | **Architecture & "Why Two Hops"** | Single slide diagram + eval harness | Why 2 hops beats 1; guardrails & eval |
| **2:15 – 2:30** | 15s | **Call to Action & Close** | Live Vercel URL & GitHub repo | Try it live |

---

## 🎙️ Shot-by-Shot Script & Cues

### Beat 1: The Problem (0:00 – 0:10 | 10 seconds)
* **Visual:** Browser showing Tasteprint clean homepage with tagline: *"Tell us what they love. We'll find what they didn't know they wanted."* Cursor hovers over search form.
* **Voiceover:**
  > *"Buying a gift for someone with distinct taste is hard. Traditional search engines just match keywords—if your friend loves Studio Ghibli, you get a generic Totoro mug. Tasteprint is different: it's an autonomous AI gift agent that navigates cultural taste space."*

---

### Beat 2: Three Real Interests Entered (0:10 – 0:25 | 15 seconds)
* **Visual:** Click persona shortcut pill or quickly type:
  * Recipient: **Priya**
  * Occasion: **Birthday**
  * Interests: **Björk**, **Studio Ghibli**, **Sally Rooney**
  * Budget: **$80**
  * Click: **Find Gifts**
* **Voiceover:**
  > *"Let's buy a birthday gift for Priya. Her interests span art-pop music, Japanese animation, and contemporary Irish literature. Notice we don't give the agent product keywords—we give it her cultural fingerprint."*

---

### Beat 3: Agent Visibly Thinking with Tool Calls (0:25 – 0:50 | 25 seconds)
* **Visual:** The live SSE transcript panel streams down with mechanical badge icons:
  * `⚙ resolve "Björk" as artist`
  * `⚙ resolve "Studio Ghibli" as brand`
  * `⚙ resolve "Sally Rooney" as book`
  * `⚙ first-hop taste expansion` (entities popping up live)
  * `⚙ second hop through bridge entities`
  * `⚙ score catalog candidates`
  * `⚙ check budget for bundle feasibility`
  * `⚙ commit the three lanes`
* **Voiceover:**
  > *"Tasteprint doesn't run a hardcoded pipeline. An LLM agent reasons over Qloo's cultural knowledge graph as callable tools. It resolves each interest into verified entities, analyzes affinity clusters, tests a second-hop bridge across unexpected domains, verifies pricing against her budget ceiling, and commits the recommendation lanes."*

---

### Beat 4: The Three Lanes & Surprise Pick with "Via" Chain (0:50 – 1:15 | 25 seconds)
* **Visual:** Results populate smoothly into three distinct cards:
  1. **Safe Bet (Green):** *Homogenic Vinyl LP* (94% affinity to Björk).
  2. **Wild Card (Pink):** *In the Mood for Love — Criterion Collection* (88% affinity, via Studio Ghibli & Wong Kar-wai cross-medium bridge).
  3. **The Bundle (Yellow):** *Normal People paperback + Wall-Mounted CD Player* ($72 total, under $80 budget).
  * Zoom in on the Wild Card's **evidence bar** and **"via" chain**.
* **Voiceover:**
  > *"Every run produces three distinct angles: a Safe Bet with maximum direct affinity, a Bundle that tells a cohesive cross-category story within budget, and our Wild Card. Look at this pick: Wong Kar-wai's 'In the Mood for Love' on Criterion. She didn't ask for cinema, but Qloo discovered the shared aesthetic sensibilities between Ghibli's visual nostalgia and classic cinematography."*

---

### Beat 5: Shopper Refinement & Voice Note (1:15 – 1:35 | 20 seconds)
* **Visual:** Scroll down to the Shopper Refinement section. Click the **Microphone icon** or type into the note box:
  > *"Keep it under $60 and lean away from music."*
  * Agent immediately updates constraints: marks music as muted, updates budget ceiling to $60, and re-evaluates candidates.
* **Voiceover:**
  > *"Shoppers can refine in their own words or via voice. Watch what happens when I say: 'Keep it under $60 and lean away from music.' The agent interprets the nuance, mutes music signals, recalculates budget feasibility, and instantly pivots the candidate set."*

---

### Beat 6: The Taste Graph (1:35 – 1:55 | 20 seconds)
* **Visual:** Full view of the interactive SVG Taste Graph:
  * Center node: **Priya**
  * Inner ring: Direct seed interests (Björk, Studio Ghibli, Sally Rooney)
  * Middle ring: Hop-1 cross-domain entities
  * Outer ring: Hop-2 bridge entities
  * Cursor hovers over connecting lines showing affinity percentages and attribution links.
* **Voiceover:**
  > *"Underneath every recommendation is this: the Taste Graph. It visualizes the multi-hop cultural graph that connects Priya to her discoveries. A competitor can prompt an LLM to guess gifts; only Qloo's graph provides statistically grounded cultural affinity vectors across 700 million entities."*

---

### Beat 7: Architecture & "Why Two Hops Beats One" (1:55 – 2:15 | 20 seconds)
* **Visual:** Split screen: Clean architecture graphic on left, and terminal running `npm run eval` passing all 10 invariant profiles on right.
* **Voiceover:**
  > *"Architecturally, why two hops? One hop only finds direct peers—recommending another indie record. Two hops crosses cultural domains—from music to books to film. And we don't guess: our test harness tests 10 adversarial profiles, strictly verifying budget invariants, category divergence, and zero cross-lane duplication."*

---

### Beat 8: Call to Action (2:15 – 2:30 | 15 seconds)
* **Visual:** Browser showing the deployed Vercel URL on mobile and desktop viewports, with GitHub link visible.
* **Voiceover:**
  > *"Tasteprint is open source, built on Next.js 16, and deployed live on Vercel right now. Try your own cultural fingerprint, and find the gifts they didn't know they wanted. Thank you."*

---

## 📋 Pre-Recording Checklist
- [ ] Deployed Vercel URL loaded in clean Chrome profile (1920x1080 resolution, 100% zoom).
- [ ] Golden replay mode available (`TASTEPRINT_REPLAY=1`) as an instant emergency backup.
- [ ] Microphone configured and background noise suppressed.
- [ ] 3-minute stopwatch running during recording.
