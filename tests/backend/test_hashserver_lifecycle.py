"""Preparic owns its ephemeral hashserver process and configuration."""

import json
from pathlib import Path

import pytest

import backend


def test_close_context_stops_hashserver_and_removes_its_temporary_directory(
    monkeypatch,
):
    """Normal backend cleanup keeps no process or buffer directory behind."""
    assert backend.ctx is None
    monkeypatch.setattr(backend.seamless, "close", lambda: None)

    try:
        backend._start_hashserver()
        process = backend._HASH_SERVER_PROCESS
        assert process is not None
        temporary_directory = Path(backend._HASH_SERVER_TEMP_DIRECTORY.name)
        assert temporary_directory.is_dir()

        backend.close_context()

        assert process.poll() is not None
        assert not temporary_directory.exists()
        assert backend._HASH_SERVER_PROCESS is None
        assert backend._HASH_SERVER_TEMP_DIRECTORY is None
    finally:
        backend._stop_hashserver()


def test_hashserver_launch_failure_removes_the_temporary_directory(
    monkeypatch, tmp_path
):
    created_directories = []
    temporary_directory = backend.tempfile.TemporaryDirectory

    def create_temporary_directory(*, prefix):
        result = temporary_directory(prefix=prefix, dir=tmp_path)
        created_directories.append(Path(result.name))
        return result

    def fail_to_launch(*args, **kwargs):
        raise OSError("simulated hashserver launch failure")

    monkeypatch.setattr(backend.tempfile, "TemporaryDirectory", create_temporary_directory)
    monkeypatch.setattr(backend.subprocess, "Popen", fail_to_launch)

    with pytest.raises(OSError, match="simulated hashserver launch failure"):
        backend._start_hashserver()

    assert len(created_directories) == 1
    assert not created_directories[0].exists()
    assert backend._HASH_SERVER_PROCESS is None
    assert backend._HASH_SERVER_TEMP_DIRECTORY is None
    assert backend._HASH_SERVER_LOG is None


def test_hashserver_client_configuration_has_no_database_or_jobserver(
    monkeypatch,
):
    import seamless_config
    from seamless_config import extern_clients

    calls = []
    monkeypatch.setattr(seamless_config, "set_remote_clients", calls.append)
    worker_calls = []
    monkeypatch.setattr(
        extern_clients,
        "set_remote_clients",
        lambda clients, in_remote=False: worker_calls.append((clients, in_remote)),
    )
    monkeypatch.delenv("SEAMLESS_CACHE", raising=False)
    monkeypatch.setenv("SEAMLESS_REMOTE_CLIENTS", "previous-clients")
    monkeypatch.setenv("SEAMLESS_ALLOW_REMOTE_CLIENTS_IN_WORKER", "0")
    monkeypatch.setattr(backend, "_HASH_SERVER_CLIENT_ENV_BEFORE", None)
    monkeypatch.setattr(backend, "_HASH_SERVER_CLIENT_ENV_SET", {})

    backend._configure_hashserver_clients("http://127.0.0.1:49152")
    try:
        assert calls == [
            {
                "database": [],
                "buffer": [
                    {
                        "url": "http://127.0.0.1:49152",
                        "remote_url": "http://127.0.0.1:49152",
                        "readonly": False,
                    }
                ],
            }
        ]
        worker_clients = json.loads(backend.os.environ["SEAMLESS_REMOTE_CLIENTS"])
        assert worker_clients == calls[0]
        assert extern_clients.set_remote_clients_from_env(include_dask=False)
        assert worker_calls == [(worker_clients, True)]
        assert backend.os.environ["SEAMLESS_ALLOW_REMOTE_CLIENTS_IN_WORKER"] == "1"
        assert worker_clients["database"] == []
        assert worker_clients["buffer"][0]["url"] == worker_clients["buffer"][0]["remote_url"]
    finally:
        backend._restore_hashserver_client_env()

    assert backend.os.environ["SEAMLESS_REMOTE_CLIENTS"] == "previous-clients"
    assert backend.os.environ["SEAMLESS_ALLOW_REMOTE_CLIENTS_IN_WORKER"] == "0"
