from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from prosody_classifier.data import acquire
from prosody_classifier.data.acquire import (
    AcquisitionError,
    Corpus,
    CorpusSpec,
    SourceFile,
    SourceKind,
)


def _install_tiny_ravdess(
    monkeypatch: pytest.MonkeyPatch,
    *,
    md5: str | None = None,
) -> tuple[bytes, list[Path]]:
    payload = b"immutable corpus bytes"
    expected_md5 = md5 or hashlib.md5(payload, usedforsecurity=False).hexdigest()
    spec = CorpusSpec(
        corpus=Corpus.RAVDESS,
        source_kind=SourceKind.URL,
        source="https://example.test/ravdess",
        revision="test-record",
        license="test-only",
        license_url="https://example.test/license",
        files=(
            SourceFile(
                path="audio.zip",
                size_bytes=len(payload),
                md5=expected_md5,
                url="https://example.test/audio.zip",
            ),
        ),
    )
    downloads: list[Path] = []

    def fake_download(
        corpus_spec: CorpusSpec,
        source_file: SourceFile,
        destination: Path,
    ) -> None:
        assert corpus_spec is spec
        assert source_file is spec.files[0]
        downloads.append(destination)
        destination.write_bytes(payload)

    monkeypatch.setitem(acquire.CORPUS_SPECS, Corpus.RAVDESS, spec)
    monkeypatch.setattr(acquire, "_download_file", fake_download)
    return payload, downloads


def test_corpus_names_and_source_revisions_are_stable() -> None:
    assert [corpus.value for corpus in Corpus] == ["ravdess", "crema_d", "tess"]
    assert acquire.CORPUS_SPECS[Corpus.RAVDESS].revision == "1188976"
    assert (
        acquire.CORPUS_SPECS[Corpus.CREMA_D].revision
        == "b7d5beded69285eb5eb6a1c6894a5b0ad17cab92"
    )
    assert (
        acquire.CORPUS_SPECS[Corpus.TESS].revision
        == "05bff369fa278b3d74b2eaa8daed5df3032fdc4e"
    )
    assert acquire._parse_args(["crema_d"]).corpus == "crema_d"
    with pytest.raises(ValueError, match="unknown corpus"):
        acquire.acquire_corpus("unknown")


def test_acquire_all_dispatches_each_corpus(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[Corpus, Path]] = []

    def fake_acquire(corpus: Corpus | str, output_root: Path) -> Path:
        corpus_id = Corpus(corpus)
        calls.append((corpus_id, output_root))
        return output_root / corpus_id.value / "manifest.json"

    monkeypatch.setattr(acquire, "acquire_corpus", fake_acquire)
    manifests = acquire.acquire_all(tmp_path)

    assert list(manifests) == list(Corpus)
    assert calls == [(corpus, tmp_path) for corpus in Corpus]


def test_acquire_writes_snapshot_and_manifest(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload, downloads = _install_tiny_ravdess(monkeypatch)

    manifest_path = acquire.acquire_corpus("ravdess", tmp_path)

    snapshot = tmp_path / "ravdess"
    assert manifest_path == snapshot / "manifest.json"
    assert (snapshot / "audio.zip").read_bytes() == payload
    assert len(downloads) == 1
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["schema_version"] == 1
    assert manifest["corpus"] == "ravdess"
    assert manifest["source"] == {
        "kind": "url",
        "license": "test-only",
        "license_url": "https://example.test/license",
        "location": "https://example.test/ravdess",
        "record_id": "test-record",
    }
    assert manifest["files"] == [
        {
            "path": "audio.zip",
            "sha256": hashlib.sha256(payload).hexdigest(),
            "size_bytes": len(payload),
        }
    ]
    assert isinstance(manifest["acquired_at"], str)


def test_acquire_is_idempotent_and_rejects_tampering(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, downloads = _install_tiny_ravdess(monkeypatch)
    manifest_path = acquire.acquire_corpus(Corpus.RAVDESS, tmp_path)

    assert acquire.acquire_corpus(Corpus.RAVDESS, tmp_path) == manifest_path
    assert len(downloads) == 1

    (tmp_path / "ravdess" / "audio.zip").write_bytes(b"tampered")
    with pytest.raises(AcquisitionError, match="manifest"):
        acquire.acquire_corpus(Corpus.RAVDESS, tmp_path)
    assert len(downloads) == 1


def test_checksum_failure_removes_partial_snapshot(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_tiny_ravdess(monkeypatch, md5="0" * 32)

    with pytest.raises(AcquisitionError, match="checksum mismatch"):
        acquire.acquire_corpus(Corpus.RAVDESS, tmp_path)

    assert not (tmp_path / "ravdess").exists()
    assert list(tmp_path.iterdir()) == []


def test_download_failure_removes_staging_directory(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_tiny_ravdess(monkeypatch)

    def fail_download(
        corpus_spec: CorpusSpec,
        source_file: SourceFile,
        destination: Path,
    ) -> None:
        del corpus_spec, source_file
        destination.write_bytes(b"partial")
        raise OSError("network interrupted")

    monkeypatch.setattr(acquire, "_download_file", fail_download)
    with pytest.raises(OSError, match="network interrupted"):
        acquire.acquire_corpus(Corpus.RAVDESS, tmp_path)

    assert not (tmp_path / "ravdess").exists()
    assert list(tmp_path.iterdir()) == []
