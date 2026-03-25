import type { NoteData } from '@/shared/types'
import type { NoteInput } from '@/shared/messaging'

const LOG_PREFIX = '[XHS Radar Queue]'

// First flush: small + fast for immediate feedback
const FIRST_BATCH_SIZE = 5
const FIRST_FLUSH_DELAY_MS = 200
// Subsequent flushes: larger batches, fewer API calls
const NORMAL_BATCH_SIZE = 20
const NORMAL_FLUSH_DELAY_MS = 500

/**
 * Batch queue for notes pending LLM analysis.
 * First flush is small and fast (5 notes, 200ms) for immediate feedback.
 * Subsequent flushes use larger batches (20 notes, 500ms) to reduce API calls.
 */
export class AnalysisQueue {
  private pending: NoteData[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private stopped = false
  private flushedOnce = false

  /** Add notes to the queue. May trigger an immediate flush. */
  enqueue(notes: NoteData[]): void {
    if (this.stopped) return
    this.pending.push(...notes)
    console.debug(LOG_PREFIX, `Queued ${notes.length} note(s), pending: ${this.pending.length}`)

    const batchSize = this.flushedOnce ? NORMAL_BATCH_SIZE : FIRST_BATCH_SIZE
    const delay = this.flushedOnce ? NORMAL_FLUSH_DELAY_MS : FIRST_FLUSH_DELAY_MS

    if (this.pending.length >= batchSize) {
      this.flush()
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), delay)
    }
  }

  /** Force flush all pending notes. */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    if (this.stopped || this.pending.length === 0) return

    const batchSize = this.flushedOnce ? NORMAL_BATCH_SIZE : FIRST_BATCH_SIZE
    const batch = this.pending.splice(0, batchSize)
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

    this.flushedOnce = true

    // If there are still pending notes, schedule another flush
    if (this.pending.length > 0) {
      this.timer = setTimeout(() => this.flush(), NORMAL_FLUSH_DELAY_MS)
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
