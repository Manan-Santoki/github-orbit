# Recommendation ranking

Orbit's first ranker is deterministic, inspectable, and versioned as `ranker-v1`. It does not ask a language model to decide whom a user should follow.

## Candidate generation

Candidates include follower-only accounts plus accounts followed by people the viewer follows, excluding the viewer, bots, unavailable profiles, and accounts the viewer already follows. Candidate generation currently keeps the top 2,000 by common-neighbor count before scoring.

## Feature weights

| Feature                  | Weight | Meaning                                                              |
| ------------------------ | -----: | -------------------------------------------------------------------- |
| Network centrality proxy |   0.30 | Strength of the candidate inside the loaded neighborhood             |
| Common neighbors         |   0.20 | Number of direct network paths to the candidate                      |
| Embedding similarity     |   0.20 | Cosine similarity of public-profile and repository text              |
| Topic similarity         |   0.10 | Jaccard overlap of public repository topics                          |
| Language similarity      |   0.08 | Jaccard overlap of observed repository languages                     |
| Recent activity          |   0.07 | Exponential decay from the last observed public activity             |
| Exploration              |   0.05 | A bounded diversity signal for discoveries outside the usual cluster |

Every feature is clamped to `[0, 1]`; weights sum to one. Scores are therefore comparable and bounded. The three largest non-zero contributions become the explanation shown in the product.

## Embeddings and privacy

When an OpenRouter key is configured, Orbit creates a deterministic text template from public bio, company, location, and up to ten public non-fork repositories. The text and template version are hashed so unchanged profiles do not need conceptual reprocessing. Embeddings use `openai/text-embedding-3-large` at 1,024 dimensions, with OpenRouter provider data collection denied where the routing API supports that preference.

No private repositories, email addresses, OAuth tokens, collection notes, or user feedback are placed in embedding input.

## Feedback

Open, save, follow, dismiss, and “less like this” events are stored separately from the ranked result. A recent dismissal suppresses that candidate for 90 days. The current ranker does not silently retrain on individual users; feedback is retained as explicit product input for a future versioned ranker.
