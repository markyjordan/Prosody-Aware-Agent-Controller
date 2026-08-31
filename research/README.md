# Prosody Research

This directory is the research scaffold for experiments that infer prosodic
information from raw audio. It provides a reproducible Mamba environment, data
and artifact boundaries, corpus acquisition, empty Model A and Model B pipeline
modules, configuration placeholders, and local JupyterLab and TensorBoard
workflows. It does not yet define model behavior, training behavior, notebooks,
targets, losses, metrics, or an inference schema.

## Quickstart

Install [Miniforge](https://github.com/conda-forge/miniforge) and
[just](https://just.systems/), then run:

```sh
cd research
just bootstrap
just env-check
just jupyter-lab
```

`environment.yml` is the sole dependency owner. `pyproject.toml` configures
future quality tools only; it does not declare a package, build backend, or
dependencies. This research environment does not use `uv`.

The default environment name is `prosody-controller`. Override it or the Conda
configuration path when needed:

```sh
PROSODY_RESEARCH_ENV_NAME=my-prosody-env just bootstrap
PROSODY_RESEARCH_CONDARC=/path/to/.condarc just update-env
```

Run `just` to list every workflow. `just activate` prints activation commands;
recipes themselves use `mamba run`, so activation is optional.

## Directory ownership

- `configs/` contains reproducible experiment inputs, beginning with an
  intentionally unbound template.
- `data/` owns raw, external, interim, and processed local data. Its contents
  are ignored by Git.
- `notebooks/` is for future exploration notebooks. No notebook is provided by
  this scaffold.
- `src/prosody_classifier/data/` acquires immutable source-corpus snapshots.
- `src/prosody_classifier/model_a/` reserves the interpretable acoustic-feature
  classifier pipeline.
- `src/prosody_classifier/model_b/` reserves the frozen speech encoder and
  linear-probe pipeline.
- `tests/` owns unit and integration checks for implemented research behavior.
- `artifacts/` owns generated checkpoints and exports. `artifacts/probe.pt` is
  reserved as the future API integration export and remains untracked.
- `reports/` owns generated figures, metrics, and TensorBoard runs.
- `references/` holds research notes and external reference metadata that are
  safe to version.

## Current decisions

The eventual model consumes raw audio only. The scaffold standardizes the
integration-facing audio default to mono 16 kHz, while source recordings may
arrive at other rates and must be preserved in `data/raw/`.

Prosody targets are deliberately undecided. The web application's mock labels
and acoustic values are not research requirements. Before implementing a model,
define the target schema, labeling provenance, split strategy, evaluation
metrics, and exported inference contract in a versioned experiment config.

Hugging Face `datasets` remains available for future loading and transformation.
Corpus acquisition uses public, revision-pinned source snapshots and does not
include Hub authentication, uploads, dataset cards, model cards, or publishing
workflows.

## Corpus acquisition

Acquire one immutable source snapshot, or all three supported corpora, from the
research directory:

```sh
python src/prosody_classifier/data/acquire.py ravdess
python src/prosody_classifier/data/acquire.py all
```

RAVDESS uses the official speech-only Zenodo archive. CREMA-D and TESS use
revision-pinned Hugging Face dataset repositories. Downloads are written under
`data/external/` with a manifest containing their source revision, license,
sizes, and SHA-256 checksums. Acquisition does not extract, resample, split, or
otherwise transform the source corpora.

See [docs/pipeline.md](docs/pipeline.md) for the intended stage boundaries and
data-leakage safeguards.
