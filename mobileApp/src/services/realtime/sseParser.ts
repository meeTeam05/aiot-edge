export interface SseFrame { id: string | null; type: string | null; data: string; }

/** Incremental SSE parser supporting CRLF, comments, and multi-line data frames. */
export class SseParser {
  private buffer = '';
  private id: string | null = null;
  private type: string | null = null;
  private data: string[] = [];

  add(chunk: string): SseFrame[] {
    this.buffer += chunk;
    const frames: SseFrame[] = [];
    for (;;) {
      const newline = this.buffer.indexOf('\n');
      if (newline < 0) break;
      let line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      const frame = this.processLine(line);
      if (frame !== null) frames.push(frame);
    }
    return frames;
  }

  private processLine(line: string): SseFrame | null {
    if (line === '') return this.dispatch();
    if (line.startsWith(':')) return null;
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'id') this.id = value;
    if (field === 'event') this.type = value;
    if (field === 'data') this.data.push(value);
    return null;
  }

  private dispatch(): SseFrame | null {
    if (this.data.length === 0) {
      this.id = null;
      this.type = null;
      return null;
    }
    const frame = { id: this.id, type: this.type, data: this.data.join('\n') };
    this.id = null;
    this.type = null;
    this.data = [];
    return frame;
  }
}
