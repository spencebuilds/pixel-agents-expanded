/**
 * Watches ~/.claude/projects/ for JSONL transcript files using chokidar.
 *
 * Detects new Claude Code sessions, tracks file read positions for
 * incremental parsing, feeds new lines to the transcript parser, and
 * handles file creation/deletion/truncation.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { watch, type FSWatcher } from "chokidar";
import {
  TranscriptEmitter,
  processTranscriptLine,
  createAgentSession,
} from "./transcriptParser";
import type { AgentSession } from "../shared/types";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Root directory where Claude Code stores project transcripts. */
const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");

/** Minimum interval (ms) between reads of the same file (debounce). */
const READ_DEBOUNCE_MS = 100;

// ─── Types ───────────────────────────────────────────────────────────────────

/** Per-file tracking state for incremental reading. */
interface TrackedFile {
  /** Absolute path to the JSONL file. */
  filePath: string;
  /** Byte offset up to which the file has been read. */
  fileOffset: number;
  /** Partial line buffer (last line without a trailing newline). */
  lineBuffer: string;
  /** Agent session ID (internal, auto-assigned). */
  agentId: number;
  /** Debounce timer handle for batching rapid writes. */
  debounceTimer: ReturnType<typeof setTimeout> | null;
}

// ─── Watcher class ───────────────────────────────────────────────────────────

export class TranscriptWatcher {
  private watcher: FSWatcher | null = null;
  private trackedFiles = new Map<string, TrackedFile>();
  private nextAgentId = 1;

  /** Shared agent session map consumed by the transcript parser. */
  readonly agents = new Map<number, AgentSession>();

  /** Typed event emitter surfacing transcript state-change events. */
  readonly emitter = new TranscriptEmitter();

  /** Waiting timers (agentId -> timeout handle). */
  private waitingTimers = new Map<number, ReturnType<typeof setTimeout>>();

  /** Permission timers (agentId -> timeout handle). */
  private permissionTimers = new Map<number, ReturnType<typeof setTimeout>>();

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Begin watching `~/.claude/projects/` for JSONL files.
   *
   * Existing files are discovered on startup; new files trigger session
   * creation automatically.
   */
  startWatching(): void {
    if (this.watcher) return; // already watching

    const watchDir = CLAUDE_PROJECTS_DIR;

    // Ensure directory exists (Claude Code may not have run yet).
    try {
      fs.mkdirSync(watchDir, { recursive: true });
    } catch {
      // Best-effort: log and continue; watcher will retry on dir creation.
    }

    console.log(`[TranscriptWatcher] Watching ${watchDir}`);

    this.watcher = watch("**/*.jsonl", {
      cwd: watchDir,
      persistent: true,
      ignoreInitial: false, // process existing files on startup
      awaitWriteFinish: false, // we handle debouncing ourselves
      depth: 10, // reasonable nesting depth
      // Avoid permission errors on inaccessible directories
      ignorePermissionErrors: true,
    });

    this.watcher
      .on("add", (relPath: string) => {
        const absPath = path.join(watchDir, relPath);
        this.onFileAdded(absPath);
      })
      .on("change", (relPath: string) => {
        const absPath = path.join(watchDir, relPath);
        this.onFileChanged(absPath);
      })
      .on("unlink", (relPath: string) => {
        const absPath = path.join(watchDir, relPath);
        this.onFileRemoved(absPath);
      })
      .on("error", (err: unknown) => {
        console.warn(
          `[TranscriptWatcher] Watcher error: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  /** Stop watching and clean up all tracking state. */
  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close().catch(() => {
        /* ignore close errors */
      });
      this.watcher = null;
    }

    // Clear all debounce timers
    for (const tracked of this.trackedFiles.values()) {
      if (tracked.debounceTimer) {
        clearTimeout(tracked.debounceTimer);
      }
    }
    this.trackedFiles.clear();

    // Clear waiting/permission timers
    for (const t of this.waitingTimers.values()) clearTimeout(t);
    this.waitingTimers.clear();
    for (const t of this.permissionTimers.values()) clearTimeout(t);
    this.permissionTimers.clear();

    // Emit a removal for each tracked agent so consumers can clean up
    for (const agentId of this.agents.keys()) {
      this.emitter.emit("agentStatus", { id: agentId, status: "waiting" });
    }
    this.agents.clear();

    console.log("[TranscriptWatcher] Stopped");
  }

  // ── File event handlers ──────────────────────────────────────────────────

  private onFileAdded(absPath: string): void {
    if (this.trackedFiles.has(absPath)) return; // already tracking

    const agentId = this.nextAgentId++;
    const projectDir = path.dirname(absPath);

    const session = createAgentSession(agentId, projectDir, absPath);
    this.agents.set(agentId, session);

    const tracked: TrackedFile = {
      filePath: absPath,
      fileOffset: 0,
      lineBuffer: "",
      agentId,
      debounceTimer: null,
    };
    this.trackedFiles.set(absPath, tracked);

    console.log(
      `[TranscriptWatcher] New session: agent ${agentId} -> ${path.basename(absPath)}`,
    );

    // Read any content already in the file
    this.readNewLines(tracked);
  }

  private onFileChanged(absPath: string): void {
    const tracked = this.trackedFiles.get(absPath);
    if (!tracked) {
      // File appeared as a change before the add event (race); treat as add.
      this.onFileAdded(absPath);
      return;
    }

    // Debounce rapid writes: schedule a single read after the burst settles.
    if (tracked.debounceTimer) {
      clearTimeout(tracked.debounceTimer);
    }
    tracked.debounceTimer = setTimeout(() => {
      tracked.debounceTimer = null;
      this.readNewLines(tracked);
    }, READ_DEBOUNCE_MS);
  }

  private onFileRemoved(absPath: string): void {
    const tracked = this.trackedFiles.get(absPath);
    if (!tracked) return;

    if (tracked.debounceTimer) {
      clearTimeout(tracked.debounceTimer);
    }

    const agentId = tracked.agentId;
    this.trackedFiles.delete(absPath);
    this.agents.delete(agentId);

    // Clean up timers
    const wt = this.waitingTimers.get(agentId);
    if (wt) {
      clearTimeout(wt);
      this.waitingTimers.delete(agentId);
    }
    const pt = this.permissionTimers.get(agentId);
    if (pt) {
      clearTimeout(pt);
      this.permissionTimers.delete(agentId);
    }

    console.log(
      `[TranscriptWatcher] Session ended: agent ${agentId} (${path.basename(absPath)} removed)`,
    );

    this.emitter.emit("agentToolsClear", { id: agentId });
  }

  // ── Incremental reader ───────────────────────────────────────────────────

  /**
   * Read newly appended bytes from a tracked JSONL file and feed each
   * complete line to the transcript parser.
   *
   * Handles truncation (file shrinks) by resetting the read position.
   */
  private readNewLines(tracked: TrackedFile): void {
    const agent = this.agents.get(tracked.agentId);
    if (!agent) return;

    let stat: fs.Stats;
    try {
      stat = fs.statSync(tracked.filePath);
    } catch {
      // File may have been deleted between the event and now.
      return;
    }

    // Handle truncation (e.g. file was replaced or truncated in-place).
    if (stat.size < tracked.fileOffset) {
      console.log(
        `[TranscriptWatcher] File truncated, resetting offset: ${path.basename(tracked.filePath)}`,
      );
      tracked.fileOffset = 0;
      tracked.lineBuffer = "";
      agent.fileOffset = 0;
      agent.lineBuffer = "";
    }

    // Nothing new to read.
    if (stat.size <= tracked.fileOffset) return;

    const bytesToRead = stat.size - tracked.fileOffset;
    const buf = Buffer.alloc(bytesToRead);

    let fd: number;
    try {
      fd = fs.openSync(tracked.filePath, "r");
    } catch (err) {
      console.warn(
        `[TranscriptWatcher] Cannot open ${path.basename(tracked.filePath)}: ${err}`,
      );
      return;
    }

    try {
      fs.readSync(fd, buf, 0, bytesToRead, tracked.fileOffset);
    } catch (err) {
      console.warn(
        `[TranscriptWatcher] Read error for ${path.basename(tracked.filePath)}: ${err}`,
      );
      fs.closeSync(fd);
      return;
    }
    fs.closeSync(fd);

    tracked.fileOffset = stat.size;
    agent.fileOffset = stat.size;

    // Combine with any partial line left over from the previous read.
    const text = tracked.lineBuffer + buf.toString("utf-8");
    const lines = text.split("\n");
    // The last element is either "" (if text ended with \n) or a partial line.
    tracked.lineBuffer = lines.pop() || "";
    agent.lineBuffer = tracked.lineBuffer;

    for (const line of lines) {
      if (!line.trim()) continue;
      processTranscriptLine(
        tracked.agentId,
        line,
        this.agents,
        this.waitingTimers,
        this.permissionTimers,
        this.emitter,
      );
    }
  }

  // ── Query helpers ────────────────────────────────────────────────────────

  /** Return the number of currently tracked files / active sessions. */
  get activeSessionCount(): number {
    return this.trackedFiles.size;
  }

  /** Return all active agent IDs. */
  getActiveAgentIds(): number[] {
    return Array.from(this.agents.keys());
  }
}
