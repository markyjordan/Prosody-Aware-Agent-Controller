# Data-to-inference pipeline contract

This document reserves stage boundaries without choosing model or target
implementations. Each future stage should consume versioned inputs, write only
to its owned output directory, and record the experiment configuration that
produced those outputs.

## Intended stages

1. **Ingest** copies or references source recordings under `data/raw/` or
   `data/external/` without modifying the originals.
2. **Validate and split** records stable example identifiers, audio metadata,
   target provenance, and train/validation/test membership.
3. **Preprocess** writes deterministic, reproducible audio representations to
   `data/interim/` and finalized dataset material to `data/processed/`.
4. **Train and evaluate** reads only versioned configuration and processed
   data, then writes checkpoints, metrics, and TensorBoard events to their
   generated-output directories.
5. **Export** converts a selected checkpoint into an explicitly documented
   inference artifact under `artifacts/exports/`.
6. **Infer** accepts raw audio under the eventual public contract and returns
   only the target schema selected by the experiment.

The API already reserves `research/artifacts/probe.pt` as an integration
fallback location. Producing that file is a future, explicit export step; it is
not part of this scaffold.

## Dataset contract to decide before implementation

Every example will need a stable identifier and an audio reference. The target
columns, label ontology, continuous features, annotation provenance, speaker or
session identifiers, and missing-target policy remain undecided and must be
specified before code is added.

Source audio remains unchanged. Preprocessing may resample working copies to
mono 16 kHz for integration consistency, but must retain enough metadata to
trace every processed example back to its source.

## Leakage safeguards

- Choose splits before fitting normalizers, feature statistics, vocabularies,
  thresholds, or other learned preprocessing state.
- When recordings share a speaker, session, conversation, or source clip,
  group related examples into a single split.
- Fit data-derived state on the training split only and persist it with the
  experiment artifacts.
- Do not use the test split for architecture, target, threshold, or early-stop
  decisions.
- Record dataset revision, split manifest, random seed, environment, and config
  alongside every reported result.

## Portability boundary

The base environment uses CPU builds on macOS and Linux and may use MPS when
the local PyTorch runtime exposes it. CUDA-specific packages belong in a future
overlay rather than the portable base environment.
