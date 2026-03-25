import type { NoteData } from '@/shared/types'
import type { NoteInput } from '@/shared/messaging'

const LOG_PREFIX = '[XHS Radar Queue]'
const BATCH_SIZE = 20
const FLUSH_DELAY_MS = 500

/**
 * Batch queue for notes pending LLM analysis.
 * Accumulates notes and flushes when batch size reached or timeout fires.
 * Uses fire-and-forget messaging — background pushes results back separately.
 */
export class AnalysisQueue {
  private pending: NoteData[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private stopped = false

  /** Add notes to the queue. May trigger an immediate flush. */
  enqueue(notes: NoteData[]): void {
    if (this.stopped) return
    this.pending.push(...notes)
    console.debug(LOG_PREFIX, `Queued ${notes.length} note(s), pending: ${this.pending.length}`)

    if (this.pending.length >= BATCH_SIZE) {
      this.flush()
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), FLUSH_DELAY_MS)
    }
  }

  /** Force flush all pending notes. */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    if (this.stopped || this.pending.length === 0) return

    const batch = this.pending.splice(0, BATCH_SIZE)
    const inputs: NoteInput[] = batch.map(toNoteInput)

    console.log(LOG_PREFIX, `Flushing ${inputs.length} note(s) to background`)

    try {
      // Fire-and-forget: background will push results back via ANALYZE_RESULT message
      chrome.runtime.sendMessage({
        type: 'ANALYZE_NOTES',
        payload: { notes: inputs },
      }).catch(() => { /* response ignored — results come via ANALYZE_RESULT */ })
    } catch {
      this.stop()
      return
    }

    // If there are still pending notes, schedule another flush
    if (this.pending.length > 0) {
      this.timer = setTimeout(() => this.flush(), FLUSH_DELAY_MS)
    }
  }

  /** Stop the queue permanently (e.g., extension context invalidated). */
  private stop(): void {
    this.stopped = true
    this.pending = []
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}

function toNoteInput(note: NoteData): NoteInput {
  return {
    noteId: note.noteId,
    title: note.title,
    content: note.content,
    author: note.author,
    likeCount: note.likeCount,
  }
}
