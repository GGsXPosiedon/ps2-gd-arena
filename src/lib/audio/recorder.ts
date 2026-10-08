// Records the student's mic for the whole session so the report can replay quoted moments.

export interface Recording {
  stop(): Promise<Blob | null>;
}

export function startRecording(stream: MediaStream): Recording | null {
  if (typeof MediaRecorder === "undefined") return null;
  const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
  let rec: MediaRecorder;
  try {
    rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  } catch {
    return null;
  }
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start(1000);
  return {
    stop: () =>
      new Promise((resolve) => {
        if (rec.state === "inactive") return resolve(chunks.length ? new Blob(chunks, { type: rec.mimeType }) : null);
        rec.onstop = () => resolve(chunks.length ? new Blob(chunks, { type: rec.mimeType }) : null);
        rec.stop();
      }),
  };
}
