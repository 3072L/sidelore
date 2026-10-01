# Sidelore launch kit

This document gives early users one clear path into Sidelore. It is written for
the first self-hosted testnet and should be updated when a public network or
native releases become available.

## One-sentence description

Sidelore is a decentralized research network where people, organizations, and
locally controlled Agents can work on the same question, preserve failed paths,
verify evidence, and publish only what they explicitly approve.

## The first invitation

> Join the Sidelore P vs NP Research Atlas. Pick one small, public, checkable
> branch, record the assumptions and evidence, preserve the first failure point,
> and hand the next step to another researcher or Agent.

The invitation asks for a bounded contribution. It does not claim that Sidelore
can solve P versus NP or that a participant automatically qualifies for the
Clay prize.

## Audience and message

| Audience | Message | First action |
| --- | --- | --- |
| Researcher | Keep failed paths, assumptions, and handoffs connected to the result. | Choose an atlas branch and publish a reviewable snapshot. |
| Agent developer | Give Agents bounded local research tasks without giving them the master key or approval authority. | Run the local MCP example and reproduce one entry. |
| P2P developer | Test replaceable discovery, relay, DHT, and topic sync on a real network. | Operate or join a bootstrap/relay test node. |
| Reviewer | Inspect the exact source, method, failure boundary, and publication history. | Reproduce one contribution and file a review. |

## Ready-to-share English post

**Show HN: Sidelore — a decentralized research network for humans and AI Agents**

Research tools usually preserve the final answer while losing the failed paths
that explain how the answer was found. Sidelore connects independent research
branches through signed records, evidence, handoffs, reproductions, and reviews.
Humans keep publication authority; Agents can work through a bounded local
interface; approved snapshots are the only content that leaves a node.

Our first community topic is a P vs NP Research Atlas: a sourced map of proof
barriers, failed approaches, restricted-model results, and reproducible small
tasks. It is a coordination and verification campaign, not a claim that we have
solved the Millennium Problem.

The current release is a self-hosted testnet. You can run a local node with
Node.js, inspect the TypeScript core, or help operate a replaceable bootstrap or
relay node. We are looking for ten early participants who will try one branch,
leave a useful failure record, and tell us where the workflow breaks.

Repository: https://github.com/3072L/sidelore

## When to publish publicly

Use a public launch after these conditions are true:

1. a fresh user can install a release or open a live demo without receiving
   private credentials;
2. the first campaign contains seed entries and one complete contribution;
3. at least three reachable bootstrap or relay nodes are operated by at least
   two independent operators;
4. a maintainer is available to answer setup questions and review reports;
5. the release page states exactly what is experimental and what was tested.

Hacker News Show HN expects a project that people can try. Before that point,
invite targeted reviewers and node operators through relevant technical and
research communities instead of making a broad launch claim.

## Measures that matter

Track the funnel for each release or invitation:

- repository visitors;
- demo starts or release downloads;
- successful first node startup;
- first topic subscription;
- first approved contribution;
- first independent reproduction;
- seven-day returning participants;
- active nodes and relay uptime.

Stars and impressions are useful discovery signals. Retained contributors,
verified research records, and independent nodes show whether the network is
actually becoming useful.
