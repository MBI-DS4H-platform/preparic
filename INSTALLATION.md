# Installation

This is a recipe-style installation guide for Linux. It assumes that you have
already cloned the `preparic` repository and are running commands from the
repository root. Preparic prepares runs for Alaric, so a working Alaric
installation comes first.

## 1. Install Alaric

Follow Alaric's `INSTALLATION.md` completely. Preparic needs these parts of it:

- an Alaric checkout (Preparic reads files from the checkout, not only the
  installed package: `util/`, `alaric/`, `fraglib/` and `ring-refe/`);
- a conda environment named exactly `alaric`, with Alaric installed in it;
- `~/.alaric/fraglib.yaml`, pointing at the fragment library;
- the twelve Gaussian stacking-filter caches under
  `precomputed-filters/gaussian/` in that checkout (Alaric's
  `INSTALLATION.md` §9 and `documents/gaussian-filter.md` §6).

Preparic itself runs on the local machine. It does not use Alaric's remote
host settings.

How Preparic uses Alaric: Alaric's command-line steps (the fitter, the
reference cutter, the best-fit tables, the gridless energetics and the
Gaussian check) run as Seamless transformations inside `conda run -n alaric`.
The environment name `alaric` is fixed in `alaric_runtime.py`; an environment
with another name, or one given as a path, is not used. Seamless finds conda
through `SEAMLESS_CONDA_EXE`, else `CONDA_EXE` (which conda sets when it is
initialized in your shell), else `$CONDA_ROOT/bin/conda`, else `conda` on
`PATH`. Alaric's Python modules that Preparic needs are attached to the
transformations from the checkout, so Preparic never imports the installed
`alaric` package.

## 2. Create the `preparic` conda environment

From the `preparic` repository root:

```bash
conda env create -f environment.yml
conda activate preparic
```

`mamba env create -f environment.yml` does the same.

This creates an environment named `preparic` with Node.js 22, Python, IPython,
PyYAML, Biopython, NumPy, SciPy, PDB2PQR and pytest from conda-forge. Through
pip it also installs the `seamless-suite` pre-release (`--pre` in
`environment.yml`), which provides the Seamless packages that the backend
imports (`seamless`, `seamless_transformer`, `seamless_workflow`) and the
`hashserver` command that it starts. Python is not pinned in
`environment.yml`; at the time of writing, conda chose Python 3.15.

Conda may print a warning that a newer version of conda exists, and mamba
may warn that pip is used as an additional package manager. Both are harmless.

## 3. Install the frontend packages

With the `preparic` environment active:

```bash
npm install
```

This installs Svelte, Mol*, Vite and the test tools into `node_modules/`.

## 4. Tell Preparic where Alaric is

Preparic needs the path of Alaric's `alaric/` package directory (the directory
inside the repository, not the repository root). The setting is resolved in
this order:

1. `preparic-start --alaric-dir PATH`;
2. the `ALARIC_DIR` environment variable;
3. `~/alaric/alaric`.

The repository root is the parent of that directory. Set `ALARIC_DIR` once in
your shell startup file, as Alaric's `INSTALLATION.md` §7 does; Alaric's own
local scripts need it too:

```bash
export ALARIC_DIR=~/alaric/alaric
```

If the directory does not exist, the backend stops at startup with
`Alaric package directory ... does not exist`, and names whether the path
came from `--alaric-dir`/`ALARIC_DIR` or from the default location.

## 5. Put the launcher scripts on `PATH`

Once, in the activated `preparic` environment:

```bash
./preparic-install-hook
```

This writes an activation hook into the environment, so that
`preparic-start`, `preparic-stop` and `preparic-restart` are on `PATH` after
every `conda activate preparic`. Deactivating removes them again. Conda
reserves `PATH` in `environment.yml`, which is why this is a separate step.
Deactivate and activate the environment once, so that the hook takes effect:

```bash
conda deactivate
conda activate preparic
```

## 6. Start Preparic and open it

```bash
preparic-start
```

This starts the backend and the Vite dev server as subprocesses and prints
their output to the terminal. When Vite reports that it is ready, open
<http://localhost:5173/> in a browser with WebGL enabled. Vite listens on
`localhost` only (it prints "Network: use --host to expose"), and proxies
the backend, a Seamless share server on `127.0.0.1:5813`, itself. To let
others use the app from their own machines, start it with
`preparic-start --collaborative`: Vite then listens on `0.0.0.0` and they open
`http://<this machine's IP or hostname>:5173/` (see [README.md](README.md#start-the-app)).
The backend stays on `127.0.0.1` and is reached only through Vite. Stop it with
Ctrl-C or with `preparic-stop` from another terminal.

The launcher options are described in [README.md](README.md#start-the-app).

## 7. Quick check

Open <http://localhost:5173/?pdb=1B7F&continue=1>. Preparic downloads
entry 1B7F from the RCSB, loads its first biological assembly and moves to
stage 2 (residue ranges) when the viewer is ready. This needs internet
access. The first time after a start, stages 3 and later can take minutes
to compute, because the fragment library has to be loaded.

To check the installation without the browser, run the test suite as
described in [README.md](README.md#tests). Some of the backend tests read
files from the Alaric checkout (they use the same `--alaric-dir`/`ALARIC_DIR`
setting).

## 8. Troubleshooting

- **Backend stops with `Alaric package directory ... does not exist`.** Set
  `ALARIC_DIR` or pass `--alaric-dir`, see section 4.
- **A stage-6 installation error about a Gaussian cache.** A cache under
  `precomputed-filters/gaussian/` is missing or corrupt. The message names
  the generator command; run it in the `alaric` environment, see Alaric's
  `INSTALLATION.md` §9. Preparic never builds the caches itself.
- **Errors from `conda run -n alaric`, or "Cannot find conda launcher".** Check
  that `conda env list` shows an environment named `alaric` and that `conda`
  is on `PATH` (or set `SEAMLESS_CONDA_EXE`).
- **Vite reports an optimized-dependency error, or the page is stale after
  `npm install`.** Run `preparic-restart --force`.
- **The page misbehaves after a backend restart.** Reload every open browser
  tab. A tab kept open across a restart has undefined behavior.
- **The viewer does not start.** Check that WebGL is enabled in the browser.
