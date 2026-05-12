import { describe, expect, it } from "vitest";
import { parseSseFrame, readSseStream } from "./sidecar-client";

describe("sidecar SSE parsing", () => {
  it("parses event stream frames with comments and JSON payloads", () => {
    expect(parseSseFrame(": connected")).toBeUndefined();
    expect(
      parseSseFrame(
        'id: 4\nevent: run.completed\ndata: {"id":"event_4","runId":"run_1","sequence":4,"type":"run.completed","payload":{"finalOutput":"hello"},"createdAt":"2026-05-12T00:00:00.000Z"}',
      ),
    ).toMatchObject({
      id: "4",
      event: "run.completed",
      data: {
        runId: "run_1",
        sequence: 4,
        type: "run.completed",
        payload: {
          finalOutput: "hello",
        },
      },
    });
  });

  it("reads frames split across chunks", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('id: 1\nevent: run.created\ndata: {"id":"event_1",'));
        controller.enqueue(
          encoder.encode('"runId":"run_1","sequence":1,"type":"run.created","payload":{},"createdAt":"2026-05-12T00:00:00.000Z"}\n\n'),
        );
        controller.close();
      },
    });
    const frames: unknown[] = [];

    await readSseStream(stream, (frame) => frames.push(frame));

    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({
      id: "1",
      event: "run.created",
      data: {
        runId: "run_1",
        sequence: 1,
      },
    });
  });
});
