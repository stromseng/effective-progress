# effective-progress

A terminal progress library for Effect programs. It tracks a tree of tasks, keeps their
counters honest, and renders them as aligned rows while the program runs.

## Language

### Tasks

**Task**:
One unit of tracked work, shown as one row. A task is running until it is finalized as done
or failed.
_Avoid_: job, item, bar, progress bar (for the tracked thing itself)

**Task ID**:
The stable identity of a task for the lifetime of the store.

**Current task**:
The task whose scope the running effect is inside. New tasks become its children unless a
parent is given explicitly.
_Avoid_: task context, ambient task

**Parent / child**:
A task created inside another task's scope is its child. Children render indented beneath
their parent in creation order.

**Root task**:
A task with no parent.
_Avoid_: top-level task

**Task handle**:
The typed, task-local interface an effect uses to update its own task: counters, description,
total, metadata, and explicit finalization.
_Avoid_: task API, task controller

**Task operations**:
The service-level interface for creating, updating, finalizing, and reading any task by ID.
_Avoid_: task API, store API

### Progress and counters

**Units**:
The counts that describe a task's progress: succeeded, failed, processed, and total.
_Avoid_: counts, amounts, stats

**Counter**:
One of the two independently incremented unit values: succeeded or failed.

**Processed**:
Succeeded plus failed. Always derived, never set directly.
_Avoid_: completed, finished, done (for counts)

**Total**:
The expected number of units. Absent when unknown.

**Determinate**:
A task whose total is known. Its bar fills proportionally.
_Avoid_: bounded, known-total

**Indeterminate**:
A task whose total is unknown. It shows a spinner and, once anything has been processed,
a count over `?`.
_Avoid_: unbounded, spinner task

**Count display**:
Whether a task's amount text shows only processed over total, or also the succeeded and
failed counters.

### Lifecycle

**Finalize**:
Move a task out of running, either by completing it (done) or failing it (failed).
Finalization is terminal.
_Avoid_: finish, end, close, settle

**Complete / done**:
Complete is the action; done is the resulting status.

**Fail / failed**:
Fail is the action; failed is the resulting status.

**Transient**:
A task that is removed, together with its subtree, when it finalizes. Children of a transient
task are transient.

**Retained**:
A task that stays visible after it finalizes. The default.
_Avoid_: persistent, permanent, sticky

**Auto-finalize**:
Finalizing a task from the exit of the effect that owns it, when the effect did not finalize
the task explicitly.

### State and publication

**Progress state**:
Everything the store knows at one moment: every task, the render order, and per-task
columns. Immutable; every change produces a new value.
_Avoid_: store snapshot, snapshot, task store

**Task snapshot**:
The immutable view of one task at one moment. The only thing called a snapshot.
_Avoid_: task state, task record, task data

**Live state**:
The most recent progress state. Task operations read and write this.

**Published state**:
The progress state most recently handed to the renderer. Publication is throttled, so it
can lag the live state by up to one interval.

**Publish**:
Hand a progress state to the renderer. **Flush** publishes immediately, ignoring the
throttle.

**Render order**:
The depth-first list of task IDs and depths that decides row order.
_Avoid_: task order, tree order, task list

**Progress sample**:
One observation of a task's processed count at a time, kept in a rolling window for ETA
estimation.
_Avoid_: history, tick, data point

### Rendering

**Renderer**:
The component that subscribes to published state and draws rows to the terminal.

**Row**:
One visible task prepared for rendering, together with its tree connectors and measured
widths. Finalized transient tasks are not rows.
_Avoid_: cell info, line, entry

**Tree prefix**:
The box-drawing connectors drawn before a nested row's description.
_Avoid_: indent, guide lines

**Column**:
A definition of how to prepare, size, and render one vertical slice of every row.

**Column position**:
The visual column at a given index, shared by every row. Rows may use different column
definitions at the same position.
_Avoid_: slot, column index (when meaning the shared visual column)

**Cell**:
The intersection of one row and one column position.

**Prepare / prepared**:
Prepare runs once per column definition per position over all its rows and yields a prepared
value that every cell in that group can read. Prepared values carry shared layout such as
the widest count.
_Avoid_: layout (as a noun for this), measure, precompute

**Bind / bound column**:
Attach a prepared value to its column definition so the cell renderer and sizing hints can
use it.

**Resolve**:
Turn rows and their column definitions into sized column positions.

**Amount**:
The column that renders a task's units as text. Only a column name.

**Indicator**:
The single glyph that shows a task's status: a spinner frame while running, then a check,
tilde, or cross.
_Avoid_: icon, marker, status symbol

**Clock**:
A shared timer that cells subscribe to. The **now clock** ticks once per second for elapsed
time and ETA; the **spinner clock** ticks per spinner frame.
_Avoid_: timer, interval (as a noun for these)
