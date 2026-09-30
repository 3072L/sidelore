# First research topic: prize-backed open mathematics

Sources checked: 2026-09-30. Status: topic proposal. No experiment, new theorem,
competition submission, or prize claim has been made.

## Recommendation: P vs NP

**If an answer is easy to verify, must it also be easy to find?**

The goal is to determine whether deterministic polynomial time P equals
nondeterministic polynomial time NP. CMI currently lists the problem as
[unsolved](https://www.claymath.org/millennium/p-vs-np/). Stephen Cook's
[official description](https://www.claymath.org/wp-content/uploads/2022/06/pvsnp.pdf)
defines the mathematical target.

This is a proposed long-term topic because algorithms, lemmas, counterexamples,
and precise proof gaps can be shared across independent research branches. Its
suitability for collaboration does not imply that a solution is within reach.

CMI allocates **USD 1 million per Millennium Problem**. The prize concerns the
full problem; the local milestones below have no automatic prize.
Source: [CMI prize overview](https://www.claymath.org/millennium-problems/).

## Candidates

| Topic | Official status and full-problem prize | Possible contributions |
| --- | --- | --- |
| **P vs NP — recommended** | Unsolved; USD 1 million | Precise computational models, algorithms, circuit lower bounds, independent proof review |
| **Riemann hypothesis** | Unsolved; USD 1 million | Clearly stated lemmas, comparisons of proof approaches, numerical evidence with rigorous error bounds |

The Riemann hypothesis states that every nontrivial zero of the Riemann zeta
function has real part 1/2. Finite numerical checks cannot prove a statement
about all zeros. Source: [CMI problem page](https://www.claymath.org/millennium/riemann-hypothesis/).

## Initial P vs NP branches

1. **Specify a subproblem.** Record the input size, computational model,
   quantifiers, original sources, known results, and the precise connection to
   the main problem. Check the literature before treating a claim as new.
2. **Develop independent approaches.** Explore algorithms or lower bounds.
   Each contribution identifies its assumptions, key lemmas, remaining gaps,
   and next steps. Multiple participants may pursue the same question.
3. **Review independently.** Check arguments, seek counterexamples to intermediate
   claims, and inspect formal statements. Record the assumptions of relevant
   proof barriers; Aaronson and Wigderson's
   [Algebrization](https://www.scottaaronson.com/papers/alg.pdf) and its references
   provide one entry point.

A lower bound for a restricted circuit model must be distinguished from a result
about general computation. Finite benchmarks or the failure of a particular
algorithm cannot decide P vs NP. Any partial result must state what further
steps would be needed to settle the main problem.

The first milestone is a precise subproblem, a map of known results and
assumptions, an inspectable research branch, and an independent review identifying
valid conclusions or concrete gaps. This milestone does not presume a new theorem.

## Evidence and publication

Record the statement, assumptions, sources, argument or experiment, remaining
gaps, review outcome, and contributions. Formal proofs also need the toolchain
version, build result, axioms used, and an explanation of how the formal statement
matches the intended mathematics. A successful build alone does not establish
that correspondence.

Raw runs stay in the ignored `research/runs/` or `research/local/` directories.
The source repository contains this proposal, not research datasets or results.
Sharing research through Sidelore requires a separately reviewed and approved
snapshot. See the [source publication policy](../docs/source-publication.md).

## Prize conditions and changing problem status

CMI does not accept solutions submitted directly to it. Before consideration,
a proposed solution must be published in a qualifying outlet, at least two years
must pass after publication, and the solution must achieve general acceptance
in the global mathematics community. CMI decides eligibility. GitHub and Sidelore
can support collaboration but do not replace these conditions.
Source: [CMI prize rules](https://www.claymath.org/millennium-problems/rules/).

Recheck status before starting work. On 2026-09-11, CMI responded to an apparent
resolution of Navier–Stokes and explained that evaluation and assignment of
credit would follow its rules. This shortlist therefore does not repeat an
outdated assumption that its status is unchanged.
Source: [CMI announcement](https://www.claymath.org/news/navier-stokes-announcement/).

This project creates no new bounty and promises no award or distribution on
behalf of a prize sponsor. Participants can document contribution and ownership
arrangements; timestamps and signatures alone do not establish prize eligibility.
