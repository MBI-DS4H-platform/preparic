# Preparic

Preparic is a collaborative web interface for preparing an Alaric run. Every
browser tab connected to one backend works on one shared project, with one
shared stage, so several people can prepare the same run together. The
project is kept as parameter files on disk: the decisions you make in the
browser, plus the downloaded structure. Everything else is recomputed from
them when the backend starts again (see [Restarting the backend](#restarting-the-backend)).
Simultaneous edits of the same parameter in two tabs are not guarded against.

The project goes through six stages: PDB entry and biological assembly,
residue ranges, stacking selection, best-fit thresholds and clipping,
energetics and the interaction matrix, and the Gaussian stacking filter. The
result is an exported Alaric project folder (see [Using Preparic](#using-preparic)).
The frontend is Svelte 5 + Mol*; the backend is a Seamless `Context`
(`backend.py`) that runs preparic's own steps and Alaric's sandbox-tested steps.

What each stage does, its gates and the files it keeps are described in
[STAGES.md](STAGES.md).

## Installation

See [INSTALLATION.md](INSTALLATION.md). Preparic needs a working Alaric
installation first (its `alaric` conda environment, `~/.alaric/fraglib.yaml`
and the Gaussian stacking-filter caches), the `preparic` conda environment
from `environment.yml`, and a browser with WebGL enabled.

## Start the app

With the `preparic` environment active (see [INSTALLATION.md](INSTALLATION.md)):

```sh
preparic-start            # backend + Vite as subprocesses, output to the terminal
```

Then open <http://localhost:5173/>. Launcher options:

```sh
preparic-start --alaric-dir PATH  # Alaric's alaric/ package directory
preparic-start --force    # also force Vite to rebuild optimized dependencies
preparic-start --collaborative  # (or --collab, --co) Vite listens on 0.0.0.0, so others open http://<this machine's IP or hostname>:5173/
preparic-start --log      # output of both servers goes to preparic.log (--log FILE for another file)
preparic-start --log --shell  # only Vite logs; the backend runs in `ipython -i` (else `python -i`) on the terminal, with `ctx` available. Exit the shell to stop both
preparic-stop             # stops any running preparic-start, and with it both servers
preparic-restart [OPTIONS]  # preparic-stop, then preparic-start with the options given to preparic-restart (it does not remember earlier ones)
```

Alaric's location is set with `--alaric-dir` or `ALARIC_DIR`
([INSTALLATION.md](INSTALLATION.md), section 4). The backend never imports the
installed `alaric` package; it attaches Alaric modules or stages Alaric CLIs
with their declared dependency lists inside Seamless transformations.

Use `--force` when Vite's optimized dependency cache is stale or inconsistent.
`npm run dev` alone serves only the frontend, without a backend.

With `--collaborative`, everyone who opens the app works on the same project:
the backend's state is shared by all visitors. There is no authentication;
anyone who can reach port 5173 can use and change the project, so use it only
on a network you trust. Others open it by this machine's IP address or
hostname; in this mode Vite accepts any hostname. A production deployment (for
example through Cloudless) is set up differently.

For a quick test, open the app with `?pdb=1B7F&continue=1` (see
[INSTALLATION.md](INSTALLATION.md), section 7). It loads the first biological
unit and advances after the viewer is ready. URL parameters apply only in
stage 1 with an empty PDB code.

## Using Preparic

Work goes through the six stages in order. Details, gates and file names are
in [STAGES.md](STAGES.md).

- **Start and open.** Run `preparic-start` and open <http://localhost:5173/>.
   The project reopens at the stage where it was left.
- **Stage 1: Structure.** Enter a four-character PDB code and choose the **Biological
   unit** (assembly). Press **Continue**. The structure is downloaded from the
   RCSB.
- **Stage 2: Ranges.** Define residue ranges by typing residue numbers or by picking
   in the viewer. Range 1 is the RNA; the others are protein ranges. Press
   **Complete**.
- **Stage 3: Stackings.** Review the detected RNA–protein aromatic stackings. The
   defaults are preselected; change the selection as needed. The selected
   stackings anchor the RNA. Press **Continue to best fits**.
- **Stage 4: Best fits.** Compare the local best fits and review the pair thresholds
   (**Copy cRMSD / ovRMSD to thresholds** fills them from the computed values). **Clip 5′** and **Clip 3′**
   remove terminal fragments; confirm them with **Apply clip**. Press
   **Continue to energetics**.
- **Stage 5: Energetics and interactions.** Review the ATTRACT scores of every fragment
   against each protein range, check the interaction matrix (**Recompute
   matrix** rebuilds it from the anchors) and the energy thresholds (**Copy
   computed thresholds**). Press **Continue to Gaussian filters**.
- **Stage 6: Stacking classes.** Each selected stacking gets a stacking class. Review
   them against the computed values (**Copy computed**) and the validation
   results. You can switch a stacking off here.
- **Export.** When the results are current, press **Download export ZIP**. Some
   projects show a warning that has to be acknowledged first.

**Continue and Back.** Continue saves the stage's decision and opens the next
stage; Back returns one stage and keeps what you entered. Computation never moves
you between stages. If you change an earlier decision, later results are shown as
stale or pending until they have been recomputed, and Continue stays closed until
they are fresh. Saved choices that no longer match their upstream decisions are
replaced by defaults on the next Continue.

**Another PDB entry, or starting over.** Go Back, one stage at a time, to stage 1 and
enter another PDB code. Decisions that belong to the old entry are replaced by defaults as you
continue. To discard the whole project, stop Preparic, delete the contents of
`deployment-mounts/` and start it again. Reload any open browser tab.

**After the download.** Unzip the ZIP. It holds one `alaric_project/` folder with
`DATA/` (the prepared structures, constraints, thresholds, fragments and a
manifest) and a catalogue of alternative `gen-*` generator folders. They are not
one runnable project, and you don't run Alaric inside `alaric_project/`. Keep
that folder unchanged. Each Alaric run gets its own directory, with a symlink
to `alaric_project/DATA` and to a cache shared by all runs. You copy into it,
with `alaric-copy`, the action directories of a compatible set of `gen-*`
folders. One
export usually serves several runs: for example a quick `anchor-refe` run
first, then an `anchor` run. Alaric's README describes the procedure. The
catalogue and the choice rules are described in [STAGES.md](STAGES.md#export).

## Execution model

- **Eight local spawn workers.** The backend starts exactly eight Seamless
  spawn workers on this machine. Every transformation runs in one of them.
  There are no remote workers.
- **Temporary caching.** By default, each backend starts its own hashserver in a
  temporary directory for buffer caching. The server stops and the directory is
  deleted when the backend stops. No database server or jobserver is started,
  and cached buffers are not retained across backend restarts. Set
  `PREPARIC_NO_DISK_CACHE=1` before starting the backend to use Seamless's
  in-memory buffer cache without a hashserver.
- **Durable decisions.** Every decision the user makes is a file-authoritative
  mount under `deployment-mounts/` (the table in [STAGES.md](STAGES.md)),
  including the downloaded CIF. A missing or malformed file loads as
  undecided. For a malformed file, the backend prints the diagnostic to its log
  before it resets the file. A stored decision is never migrated silently.
- **Computed files are output only.** The other files in `deployment-mounts/`
  (`stackings.json`, `best-fit-thresholds.json`, `pdbs-aa/`,
  `clipped-fragments/`, `interactions.json`, …) are written by the backend for
  inspection and the later export. They are never read back, so an old file
  never counts as a fresh result.
- **One stage for all tabs.** The stage is derived from the decision files,
  never from computation state. When one tab presses Continue while another tab
  is not editing, the other tab follows to the same stage. Racing edits in
  two tabs are not guarded against.

## Restarting the backend

After `preparic-restart` (or any backend restart), **reload every open
browser tab**. A tab kept open across a backend restart has undefined
behavior.

The restarted backend restores the decisions and the CIF from
`deployment-mounts/`, and the project reopens at the same stage. Everything
else is recomputed cold: from stage 3 on that includes the best fit, the
threshold tables, gridless energetics, Gaussian scores and the Gaussian check.
Loading the fragment library can take minutes. Meanwhile the stage stays
where it was, results show as pending, and Continue stays closed where it
needs a fresh result. Stage 4's threshold table stays editable.

Long-lived folder results (the reference fragments and the best fits) are
also written to temporary write-only backup folders for the backend's
lifetime. They are removed when the backend stops and never adopted on start.

## Tests

Run tests in the `preparic` conda environment (`pytest` is included in
`environment.yml`; update an existing environment if necessary):

```sh
conda activate preparic
npm run check                   # svelte-check / TypeScript
npm test                        # tests/frontend: Vitest
npm run test:backend            # tests/backend: pytest, including native Bash tests
python -m pytest -m 'not integration'  # direct Python and Bash checks
python -m pytest -m integration        # Seamless transformations, a few with a workflow Context
bash tests/backend/test_range_pdbs_aareduce.sh  # native Bash suite by itself
npm run build
```

The frontend tests cover the stage derivation, marker validation, freshness,
deferred writes, and each stage's pure logic (`w1-*`, `w3-stage4`,
`w45-stage5`, `w6-anchor-constants`, `w7-*`, `export*`, and the clip and selection
tests). The backend tests cover the decision loader, the eight-worker spawn
runtime (`test_w1_spawn_runtime.py`), preparation
(`test_w3_*`), stage 4, stage 5 (`test_w45_stage5_acceptance.py`) and
stage 6 (`test_w7_*`) and the export (`test_export_*`).

Most integration tests build standalone Seamless `Transformer`/`Transformation`
objects with the code, celltypes and conda environments used by `backend.py`.
They test individual steps and the extraction-to-reduction chain without
workflow Contexts, mounts, share servers or remote services. Persistent
caching is disabled so previous deployments cannot supply cached results.
A few integration tests (`test_backend_workflow.py`, `test_export_download.py`,
`test_export_backend_bindings.py`) do start a workflow Context, a share server
or a hashserver, and read modules and reference files from the Alaric checkout
(`--alaric-dir`/`ALARIC_DIR`, see [INSTALLATION.md](INSTALLATION.md)).

Fixtures are checked into `tests/backend/data/1b7f` and
`tests/backend/data/export-gens`; tests do not read live deployment files or
download data. Two strict expected failures record an upstream Seamless error
when materializing an empty-list transformation result (`Checksum.resolution`
creates a trivial Buffer without its checksum). The direct empty-input checks
and the empty Bash transformation still run normally.

Browser acceptance scenarios (two tabs, restart, reconnect) are described in
`tests/W1_BROWSER_ACCEPTANCE.md`, `tests/W3_BROWSER_ACCEPTANCE.md`,
`tests/W7_ACCEPTANCE.md` and `tests/browser/*/README.md`. They are run by hand
with Chrome DevTools.

## Background documents

The contract that defines the stages is in the Alaric repository under
`plans/final/`: `oracle-contract.md` (requirements and their checks),
`state-transitions.md` (the stage model) and `contract-boundaries.md` (the
transformer and shared-cell inventory). `outline-phase-1.md`,
`implementation-phase-1.md`, `stage-3-implementation-plan.md` and
`preparic-on-seamless.md` in this directory are earlier design notes, kept as
history.
