from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import tempfile
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from pathlib import Path
from typing import Any
from urllib.request import urlopen

from huggingface_hub import hf_hub_download


class Corpus(StrEnum):
    RAVDESS = "ravdess"
    CREMA_D = "crema_d"
    TESS = "tess"


class SourceKind(StrEnum):
    HUGGING_FACE = "hugging_face"
    URL = "url"


class AcquisitionError(RuntimeError):
    pass


@dataclass(frozen=True)
class SourceFile:
    path: str
    size_bytes: int
    md5: str | None = None
    url: str | None = None


@dataclass(frozen=True)
class CorpusSpec:
    corpus: Corpus
    source_kind: SourceKind
    source: str
    revision: str
    license: str
    license_url: str
    files: tuple[SourceFile, ...]


CORPUS_SPECS: dict[Corpus, CorpusSpec] = {
    Corpus.RAVDESS: CorpusSpec(
        corpus=Corpus.RAVDESS,
        source_kind=SourceKind.URL,
        source="https://zenodo.org/records/1188976",
        revision="1188976",
        license="CC BY-NC-SA 4.0",
        license_url="https://creativecommons.org/licenses/by-nc-sa/4.0/",
        files=(
            SourceFile(
                path="Audio_Speech_Actors_01-24.zip",
                size_bytes=208_468_073,
                md5="bc696df654c87fed845eb13823edef8a",
                url=(
                    "https://zenodo.org/api/records/1188976/files/"
                    "Audio_Speech_Actors_01-24.zip/content"
                ),
            ),
        ),
    ),
    Corpus.CREMA_D: CorpusSpec(
        corpus=Corpus.CREMA_D,
        source_kind=SourceKind.HUGGING_FACE,
        source="cfahlgren1/crema-d",
        revision="b7d5beded69285eb5eb6a1c6894a5b0ad17cab92",
        license="ODbL 1.0 / DbCL 1.0",
        license_url="https://github.com/CheyneyComputerScience/CREMA-D/blob/master/LICENSE.txt",
        files=(
            SourceFile(path="README.md", size_bytes=2_593),
            SourceFile(path="data/train-00000-of-00004.parquet", size_bytes=159_698_655),
            SourceFile(path="data/train-00001-of-00004.parquet", size_bytes=148_487_378),
            SourceFile(path="data/train-00002-of-00004.parquet", size_bytes=146_108_080),
            SourceFile(path="data/train-00003-of-00004.parquet", size_bytes=151_556_054),
        ),
    ),
    Corpus.TESS: CorpusSpec(
        corpus=Corpus.TESS,
        source_kind=SourceKind.HUGGING_FACE,
        source="myleslinder/tess",
        revision="05bff369fa278b3d74b2eaa8daed5df3032fdc4e",
        license="CC BY-NC 4.0",
        license_url="https://creativecommons.org/licenses/by-nc/4.0/",
        files=(
            SourceFile(path="README.md", size_bytes=3_028),
            SourceFile(path="data/tess.zip", size_bytes=224_036_453),
        ),
    ),
}

MANIFEST_NAME = "manifest.json"
DEFAULT_OUTPUT_ROOT = Path(__file__).resolve().parents[3] / "data" / "external"


def acquire_corpus(corpus: Corpus | str, output_root: Path = DEFAULT_OUTPUT_ROOT) -> Path:
    corpus_id = _coerce_corpus(corpus)
    spec = CORPUS_SPECS[corpus_id]
    destination = output_root / corpus_id.value

    if destination.exists():
        _validate_existing_snapshot(destination, spec)
        return destination / MANIFEST_NAME

    output_root.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{corpus_id.value}-", dir=output_root))

    try:
        file_entries: list[dict[str, int | str]] = []
        for source_file in spec.files:
            staged_file = staging / source_file.path
            staged_file.parent.mkdir(parents=True, exist_ok=True)
            _download_file(spec, source_file, staged_file)
            file_entries.append(_validate_download(staged_file, source_file))

        manifest = {
            "schema_version": 1,
            "corpus": corpus_id.value,
            "source": _source_manifest(spec),
            "acquired_at": datetime.now(UTC).isoformat(),
            "files": file_entries,
        }
        (staging / MANIFEST_NAME).write_text(
            json.dumps(manifest, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        os.replace(staging, destination)
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise

    return destination / MANIFEST_NAME


def acquire_all(output_root: Path = DEFAULT_OUTPUT_ROOT) -> dict[Corpus, Path]:
    return {corpus: acquire_corpus(corpus, output_root) for corpus in Corpus}


def _coerce_corpus(corpus: Corpus | str) -> Corpus:
    if isinstance(corpus, Corpus):
        return corpus
    try:
        return Corpus(corpus)
    except ValueError as error:
        choices = ", ".join(item.value for item in Corpus)
        raise ValueError(f"unknown corpus {corpus!r}; expected one of: {choices}") from error


def _download_file(spec: CorpusSpec, source_file: SourceFile, destination: Path) -> None:
    if spec.source_kind is SourceKind.HUGGING_FACE:
        cached_path = hf_hub_download(
            repo_id=spec.source,
            filename=source_file.path,
            repo_type="dataset",
            revision=spec.revision,
        )
        shutil.copyfile(cached_path, destination)
        return

    if source_file.url is None:
        raise AcquisitionError(f"no download URL configured for {source_file.path}")

    with urlopen(source_file.url) as response, destination.open("wb") as output:
        shutil.copyfileobj(response, output)


def _validate_download(path: Path, source_file: SourceFile) -> dict[str, int | str]:
    size_bytes = path.stat().st_size
    if size_bytes != source_file.size_bytes:
        raise AcquisitionError(
            f"size mismatch for {source_file.path}: expected {source_file.size_bytes}, "
            f"received {size_bytes}"
        )

    sha256, md5 = _hash_file(path, include_md5=source_file.md5 is not None)
    if source_file.md5 is not None and md5 != source_file.md5:
        raise AcquisitionError(
            f"checksum mismatch for {source_file.path}: expected MD5 {source_file.md5}, "
            f"received {md5}"
        )

    return {"path": source_file.path, "size_bytes": size_bytes, "sha256": sha256}


def _hash_file(path: Path, *, include_md5: bool = False) -> tuple[str, str | None]:
    sha256 = hashlib.sha256()
    md5 = hashlib.md5(usedforsecurity=False) if include_md5 else None
    with path.open("rb") as input_file:
        while chunk := input_file.read(1024 * 1024):
            sha256.update(chunk)
            if md5 is not None:
                md5.update(chunk)
    return sha256.hexdigest(), md5.hexdigest() if md5 is not None else None


def _source_manifest(spec: CorpusSpec) -> dict[str, str]:
    revision_key = "record_id" if spec.source_kind is SourceKind.URL else "revision"
    return {
        "kind": spec.source_kind.value,
        "location": spec.source,
        revision_key: spec.revision,
        "license": spec.license,
        "license_url": spec.license_url,
    }


def _validate_existing_snapshot(destination: Path, spec: CorpusSpec) -> None:
    manifest_path = destination / MANIFEST_NAME
    try:
        manifest: Any = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise AcquisitionError(
            f"{destination} exists but does not contain a valid acquisition manifest"
        ) from error

    if not isinstance(manifest, dict):
        raise AcquisitionError(f"invalid acquisition manifest in {destination}")
    if manifest.get("schema_version") != 1 or manifest.get("corpus") != spec.corpus.value:
        raise AcquisitionError(f"acquisition manifest does not match {spec.corpus.value}")
    if manifest.get("source") != _source_manifest(spec):
        raise AcquisitionError(f"source revision does not match {spec.corpus.value}")

    entries = manifest.get("files")
    if not isinstance(entries, list):
        raise AcquisitionError(f"invalid file list in {manifest_path}")

    expected_paths = {source_file.path for source_file in spec.files}
    actual_paths = {
        path.relative_to(destination).as_posix()
        for path in destination.rglob("*")
        if path.is_file() and path.name != MANIFEST_NAME
    }
    if actual_paths != expected_paths:
        raise AcquisitionError(f"snapshot contents do not match {spec.corpus.value}")

    entries_by_path = {
        entry.get("path"): entry for entry in entries if isinstance(entry, dict)
    }
    if set(entries_by_path) != expected_paths:
        raise AcquisitionError(f"manifest contents do not match {spec.corpus.value}")

    for source_file in spec.files:
        entry = entries_by_path[source_file.path]
        path = destination / source_file.path
        sha256, _ = _hash_file(path)
        if entry.get("size_bytes") != path.stat().st_size or entry.get("sha256") != sha256:
            raise AcquisitionError(f"existing file does not match its manifest: {source_file.path}")
        if path.stat().st_size != source_file.size_bytes:
            raise AcquisitionError(f"existing file has an unexpected size: {source_file.path}")


def _parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Acquire immutable prosody corpus snapshots.")
    parser.add_argument("corpus", choices=[*(corpus.value for corpus in Corpus), "all"])
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(argv)
    output_root: Path = args.output_root
    if args.corpus == "all":
        manifests = list(acquire_all(output_root).values())
    else:
        manifests = [acquire_corpus(args.corpus, output_root)]

    for manifest in manifests:
        print(manifest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
