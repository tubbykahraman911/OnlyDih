import { prisma } from "../db/prisma.js";
import type { Prisma } from "@prisma/client";

export const auditActions = {
  login: "login",
  logout: "logout",
  verificationUpdate: "verification_update",
  uploadCreated: "upload_created",
  consentAccepted: "consent_accepted",
  uploadProcessingStarted: "upload_processing_started",
  moderationCompleted: "moderation_completed",
  analysisCompleted: "analysis_completed",
  uploadDeleted: "upload_deleted",
  deletionRequested: "deletion_requested",
  deletionCompleted: "deletion_completed"
} as const;

export async function auditLog(userId: string | null, action: string, metadataJson?: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      metadataJson: (metadataJson ?? {}) as Prisma.InputJsonValue
    }
  });
}
