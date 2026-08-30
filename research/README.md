# Prosody Research

This directory is the source-free research scaffold for experiments that infer
prosodic information from raw audio. It provides a reproducible Mamba
environment, data and artifact boundaries, configuration placeholders, and
local JupyterLab and TensorBoard workflows. It does not yet define model code,
training code, notebooks, targets, losses, metrics, or an inference schema.

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
- `src/prosody_research/` reserves future data, feature, model, training, and
  inference boundaries without creating Python modules.
- `tests/` reserves unit and integration test locations without adding tests.
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

Hugging Face `datasets` is available for loading datasets, but this scaffold
does not include Hub authentication, uploads, dataset cards, model cards, or
publishing workflows.

See [docs/pipeline.md](docs/pipeline.md) for the intended stage boundaries and
data-leakage safeguards.
