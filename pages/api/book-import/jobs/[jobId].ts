import type { NextApiRequest, NextApiResponse } from "next";
import { getUserIdFromRequest } from "@/lib/auth";
import { importJobManager } from "@/lib/import-jobs";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const jobIdParam = Array.isArray(req.query.jobId) ? req.query.jobId[0] : req.query.jobId;
  if (!jobIdParam) {
    return res.status(400).json({ error: "jobId is required" });
  }

  const job = importJobManager.getJob(jobIdParam);
  if (!job || job.userId !== userId) {
    return res.status(404).json({ error: "Job not found" });
  }

  return res.status(200).json(job.summary);
}
