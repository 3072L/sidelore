# P vs NP Research Atlas

Status: proposed first community campaign. This is a coordination exercise,
not a claim of a new result and not a promise of a prize.

## Question

Can we build an independently inspectable map of the main proof barriers,
failed approaches, and small verifiable branches around **P versus NP**?

The Clay Mathematics Institute lists P versus NP as an unsolved Millennium
Prize Problem. The full problem and its prize conditions are described by the
[official problem page](https://www.claymath.org/millennium/p-vs-np/) and
[official rules](https://www.claymath.org/millennium-problems/rules/).
Sidelore does not submit solutions, judge mathematical truth, or distribute
the Clay prize.

## Why this is a good first Sidelore topic

The problem already has a large public literature and many well-defined
intermediate questions. It lets participants exercise the whole network loop:

1. subscribe to one shared topic;
2. choose an independent branch;
3. record assumptions, sources, an attempt, or a counterexample;
4. preserve the exact point where a route fails;
5. reproduce another branch and add a review or handoff.

The first milestone is a useful, sourced atlas of claims and gaps. It does not
require a participant to solve P versus NP.

## Suggested branches

### Barrier map

Explain what relativization, natural proofs, and algebrization rule out. Each
entry should state the model, the hypotheses, the consequence, and the type of
proof that remains possible.

### Restricted-model result

Reproduce a lower bound or algorithm in a precisely named restricted model.
Record the formal statement, input size, toolchain, assumptions, and the gap to
general computation.

### Failed proof review

Take a public argument, identify its first invalid inference or missing case,
and supply a minimal counterexample or a proof that the step is valid under a
stronger stated assumption.

### Formalization and explanation

Formalize a small lemma or write an independent explanation that connects the
formal statement to the intended mathematics. A successful build alone is not
evidence that the correspondence is correct.

### Agent reproducibility task

Give an Agent a bounded, local task such as checking definitions, enumerating a
finite case, or comparing two public statements. The Agent output remains a
draft until a human reviews and approves a snapshot.

## Contribution format

Every contribution should make these fields explicit:

- **Claim or question:** one sentence with quantifiers and the computational
  model where they matter.
- **Prior work:** public citations and the exact result being reused.
- **Assumptions:** axioms, complexity assumptions, data limits, and toolchain.
- **Attempt:** the argument, experiment, formal file, or comparison performed.
- **Failure boundary:** the first gap, counterexample, failed test, or unresolved
  dependency.
- **Next handoff:** a concrete check another participant can perform.

Do not present finite experiments as a proof about all inputs. Do not label a
restricted-model result as a solution to the full problem. Reviewers should
record disagreements as linked branches so the research history remains useful.

## First 30-day target

- 10 independent contributors;
- 30 sourced atlas entries;
- 5 independently reproduced entries;
- 3 recorded failed approaches with inspectable break points;
- 1 formalized lemma or executable finite check;
- 2 reviews from people who did not author the original entry.

These are community milestones. They carry no automatic monetary reward. Any
separate local bounty must state its sponsor, amount, acceptance test, and
payment terms before work begins.

## How to participate

The repository is currently a self-hosted testnet implementation. Start by
reading the [run instructions](../README.md#run), open a discussion with the
branch you want to take, and publish only an explicitly approved snapshot from
your local node. Runtime datasets, private notes, identities, and attachments
do not belong in this source repository.
