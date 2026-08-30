# Local data

Dataset contents are generated or downloaded locally and ignored by Git.

- `raw/` contains immutable source recordings and source manifests.
- `external/` contains third-party data preserved in its supplied form.
- `interim/` contains reproducible intermediate representations.
- `processed/` contains finalized inputs and split manifests for experiments.

Do not store secrets, credentials, or irreplaceable sole copies here.
