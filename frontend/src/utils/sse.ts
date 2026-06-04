export function parseSseEvents(buffer: string): { nextBuffer: string; events: string[] } {
  const rawEvents = buffer.split('\n\n');
  const nextBuffer = rawEvents.pop() ?? '';
  const events: string[] = [];

  for (const event of rawEvents) {
    const payload = event
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.replace(/^data:\s?/, ''))
      .join('\n')
      .trim();

    if (payload.length > 0) {
      events.push(payload);
    }
  }

  return { nextBuffer, events };
}
