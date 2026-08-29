import asyncio
import builtins
from types import SimpleNamespace

from prosody_api.core import lifespan as lifespan_module


def run_lifespan(app):
    async def run():
        async with lifespan_module.lifespan(app):
            return None

    asyncio.run(run())


def test_lifespan_creates_cache_and_records_missing_probe(monkeypatch, tmp_path):
    cache_dir = tmp_path / "cache"
    probe_path = tmp_path / "missing-probe.pt"
    monkeypatch.setattr(
        lifespan_module,
        "get_settings",
        lambda: {"cache_dir": cache_dir, "probe_path": probe_path},
    )
    app = SimpleNamespace(state=SimpleNamespace())

    run_lifespan(app)

    assert cache_dir.is_dir()
    assert app.state.probe_path == str(probe_path)
    assert app.state.probe_found is False
    assert app.state.probe is None


def test_lifespan_records_present_probe_and_tolerates_torch_import(
    monkeypatch, tmp_path
):
    cache_dir = tmp_path / "cache"
    probe_path = tmp_path / "probe.pt"
    probe_path.write_bytes(b"artifact")
    monkeypatch.setattr(
        lifespan_module,
        "get_settings",
        lambda: {"cache_dir": cache_dir, "probe_path": probe_path},
    )
    real_import = builtins.__import__

    def rejecting_torch(name, *args, **kwargs):
        if name == "torch":
            raise ImportError("optional")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", rejecting_torch)
    app = SimpleNamespace(state=SimpleNamespace())

    run_lifespan(app)

    assert app.state.probe_found is True
    assert app.state.probe_path == str(probe_path)
    assert app.state.probe is None
