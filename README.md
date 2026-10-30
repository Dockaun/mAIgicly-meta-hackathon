# mAIgicly
### Where Imagination Becomes Invention

**Imagine. Explore. Experiment. Build. Discover.**

**Try it:** https://maigicly.com
**Demo video:** https://youtu.be/2_1XPJYBXdE
**Meta Global AI Developer Hackathon, Indie track. Problem statement: Build for Your World.**

## The Problem

In twenty years of working with K–12 students in underserved schools in the Bronx, New York, I have seen extraordinary imagination and ingenuity. What those young people often lack is access: to the tools, equipment, expertise, and pathways that let people turn what they imagine into something real.

AI can close part of that gap. But an AI that designs the invention for someone takes away the very work that makes inventing valuable: investigating possibilities, making choices, experimenting, failing, and discovering.

The problem is not a shortage of human imagination. It is how to make invention accessible without taking the inventing away from the inventor.

**How can AI widen access to invention without replacing human ingenuity?**

## Our Approach

mAIgicly is an imagination-to-invention environment for people of all ages. Its first world draws on quantum superposition: the idea that many possibilities can coexist before an outcome emerges. Superposition offers a metaphor for imagination: before an idea takes form, multiple possibilities remain open. Invention is the process of exploring those possibilities and giving one of them form.

In mAIgicly, those possibilities become **Qbits**. *Qbit* is a term I invented for mAIgicly, not the scientific *qubit*. Qbits are fictional, quantum-inspired building blocks whose capabilities depend on how people construct them.

People restore a broken quantum computer, learn the capabilities of its Guardian Qbits, and invent their own Qbits in the Quantum Forge. When the computer is restored, it awakens as **the Continuum**, and a new relationship between human and artificial intelligence begins.

mAIgicly does not simulate a real quantum computer. Quantum mechanics is the inspiration; the Qbits, Guardians, and awakened computer are an imaginative setting for experimentation and invention.

## Built During the Hackathon: Meta Proposes. The Solver Proves. The Human Invents.

For this hackathon, the Continuum was given a generative intelligence powered by **Meta Muse Spark** (`muse-spark-1.3`) through the **Meta Model API**. The hackathon code was written with **Muse Code**, Meta's coding agent. Muse Code was the development tool; Muse Spark is the intelligence inside the running Continuum.

1. **Meta writes the challenge, and shows its thinking.** Muse Spark composes a new engineering problem in the voice of the awakened computer, grounded in the real capabilities of Qbits that people actually forged. Before the mission appears, the Continuum shows its work: a scan of the network's capabilities, a random sample of Qbits, Meta's reason for choosing this challenge for the person's level, and the solver's verification. "How I chose this challenge" replays it.
2. **A deterministic solver proves it is fair.** Before anyone sees a challenge, the deterministic solver verifies that it has a solution. At the Apprentice and Engineer levels, the required Qbits must already exist in the shared pool. At the Inventor level, the solver verifies that the missing capability can be created from available Forge ingredients. Challenges that fail are rejected.
3. **The human does the reasoning.** Each role in a challenge describes what must happen, such as "link distant quantum states so their outcomes are correlated." Qbit cards show their recipes. People connect what they learned in the Chambers to a new problem. A hint costs points.
4. **Rules decide the result, not the AI.** Pass, fail, and points come from deterministic rules. Meta then interprets the person's choice and explains why it worked or what was missing.
5. **The Continuum adapts.** Results recorded by the server move each person between Apprentice, Engineer, and Inventor, and the challenges change with them.
6. **Some challenges require a new invention.** At the Inventor level, the Continuum can ask for a capability no Qbit in the network has, after the solver proves it can be forged. A Continuum Request card appears in the Forge, stating what is needed but not how. The person builds it, tests it, and brings it back to the same challenge. The new invention joins the shared pool as a **Continuum Qbit**, recording the challenge it answered.

Meta also supports the rest of the journey:

- **In the Chambers,** a Socratic guide answers the person's own questions without giving away the answer.
- **In the Quantum Forge,** The Machine sees the current build and explains, in terms of principles, what is still missing.
- **In the Resonance hub,** the broken Machine answers newcomers' questions (where am I, what are Qbits, what do I do next) from their real progress. It never chooses a Guardian for them, and its voice grows clearer as it is restored.

### Guardrails

- Meta never decides correctness. The solver and rules do.
- Challenges are held on the server. The browser never receives the answer, and role identifiers are anonymized.
- Each Qbit capability maps to one canonical function (for example, Entangle correlates outcomes; it is never described as communication), so Meta's science stays consistent with the original Qbit design.
- Without a Meta key, mAIgicly still runs fully, with clearly labeled offline challenges and helpers.

## Before and During the Hackathon

| Original mAIgicly (before the hackathon) | Added during the hackathon |
|---|---|
| Four Guardian Chambers and restoration activities | Meta-generated engineering challenges from real, player-made Qbits |
| Quantum Forge with parts, fixes, boosts, and Qbit creation | Deterministic solver that proves every challenge is solvable |
| Qbit saving and retrieval | Canonical capability vocabulary aligned with the original Qbit design |
| Continuum interface with two predefined missions | Adaptive levels from verified results (Apprentice, Engineer, Inventor) |
| Existing scoring and validation | Invent mode and Continuum Qbits |
| Operator Codes and the comic | Meta-powered guides in the Chambers, the Forge, and the Resonance hub |
| | Operator Code confirmation and full progress restore |

[`PRE_EXISTING_WORK.md`](PRE_EXISTING_WORK.md) identifies the original mAIgicly environment and every hackathon addition. [`docs/HACKATHON_LOG.md`](docs/HACKATHON_LOG.md) lists each development commit with its date. Development took place in a private repository; this public repository contains the final, cleaned source as a single snapshot.

## The Journey

**Chambers → Quantum Forge → Continuum**

### 1. Explore the Four Chambers

A powerful quantum computer has broken down. Four Guardian Qbits inhabit four Chambers, each representing a different functional part of the machine. Through interactive challenges, people discover how each Guardian's powers work and use what they learn to repair the first four parts of the machine. They choose which Guardian to help first.

### 2. Invent in the Quantum Forge

Further systems remain broken. In the Quantum Forge, people draw on their discoveries and enlist the Guardians' help to create their own Qbits: choosing components, combining properties, applying fixes and boosts, testing, and saving. Each Qbit is a functional invention whose capabilities may prove useful far beyond the problem it was made for.

### 3. Enter the Continuum

Restored, the computer awakens. In mAIgicly's universe it can contemplate problems throughout the cosmos, but instead of delivering answers, it challenges people to discover and invent solutions. People bring their own Qbits and can draw on Qbits forged by others. Solving a challenge may require combining inventions in ways their creators never anticipated.

### Shared Invention, Not Social Networking

People share the Qbits they create, not conversations with strangers. There is no live multiplayer, direct messaging, or player-to-player chat, and shared Qbits are anonymized.

There are no accounts either. Each person receives an **Operator Code**, confirms it once by typing it back, and uses it to restore their inventions on any device. Players are not required to provide names, email addresses, or ages.

## Run Locally

**Requirements:** Node.js 22 and npm.

```bash
git clone https://github.com/Dockaun/mAIgicly-meta-hackathon.git
cd mAIgicly-meta-hackathon
npm ci
mkdir -p .data
USE_LOCAL_DB=1 PGLITE_DATA_DIR=./.data/pglite PORT=5000 node server.js
```

Open `http://127.0.0.1:5000/` in your browser.

The local database initializes from `db/schema.sql`. To enable Meta Muse Spark:

```bash
export MODEL_API_KEY=your_meta_model_api_key
export CONTINUUM_AI_ENABLED=1
```

To load the community Qbit pool (anonymized Qbits forged by people who used the original mAIgicly), run this once with the server stopped:

```bash
USE_LOCAL_DB=1 PGLITE_DATA_DIR=./.data/pglite node db/seed/load-community-qbits.js
```

Run the tests:

```bash
npm test
```

## Where Things Are

| Path | Purpose |
|---|---|
| `server/continuum-rules.js` | Capability vocabulary, challenge validation, solvability proof |
| `server/continuum-meta.js` | Meta Muse Spark challenge generation |
| `server/continuum-routes.js` | Challenges, interpretation, levels, Continuum Qbits |
| `server/continuum-interpret.js` | Meta feedback on the person's choice (the rules decide the result) |
| `server/meta-chat.js` | Shared Meta Model API client |
| `server/guide.js`, `public/js/machine-guide.js` | The Machine on the Resonance hub |
| `server/chamber-followup.js`, `server/machine-context.js` | Chamber and Forge guides |
| `public/js/continuum-request.js` | Continuum Request card for Invent challenges |
| `server/player-progress.js`, `server/restore-migrate.js` | Progress and Qbits restored with an Operator Code |
| `public/continuum.html` | The Continuum |
| `public/chambers/`, `public/forge*.html` | Guardian Chambers and Quantum Forge |
| `db/schema.sql`, `db/seed/` | Schema and community Qbit seed |
| `tests/` | Test suite |

The original mAIgicly comic is not included in this repository; it remains on [maigicly.com](https://maigicly.com) and is all rights reserved.

## Beyond the Quantum World

Although mAIgicly began in K–12 education, it is designed for everyone. Imagination, curiosity, and the desire to invent do not end with childhood.

In this world, the building blocks are Qbits. In other worlds, they might be mechanical components, electronic systems, biological structures, or entirely new materials. The idea stays the same:

**Imagine → Explore → Build → Test → Share → Discover → Invent Again**

**AI should not replace human imagination, effort, or ingenuity. It should help those qualities flourish.** mAIgicly exists to help people move from *What if?* to **What can I make?**

---

Created by **Karen Kaun, Ed.D., Makeosity, Inc.**

**License:** the source code is released under the MIT License ([`LICENSE`](LICENSE)). The mAIgicly story, characters, Guardian names and lore, artwork, comic, audio, and video are original creative works, all rights reserved ([`CREATIVE_ASSETS.md`](CREATIVE_ASSETS.md)).
