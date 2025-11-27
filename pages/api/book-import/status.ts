import type { NextApiRequest, NextApiResponse } from "next";
import { getUserIdFromRequest } from "@/lib/auth";
import { importJobManager } from "@/lib/import-jobs";

const toStr = (v: unknown) => (typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? "" : "").trim();

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const jobId = toStr(req.query.jobId);
  if (!jobId) {
    return res.status(400).json({ error: "jobId is required" });
  }

  const job = importJobManager.getJob(jobId);
  if (!job || job.userId !== userId) {
    return res.status(404).json({ error: "Job not found" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  res.flushHeaders?.();

  const send = (event: any) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  job.events.forEach(send);

  const listener = (event: any) => send(event);
  job.emitter.on("event", listener);

  req.on("close", () => {
    job.emitter.off("event", listener);
  });
}
