import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/crypto.js";

const prisma = new PrismaClient();

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.safetyFlag.deleteMany();
  await prisma.analysisResult.deleteMany();
  await prisma.consentEvent.deleteMany();
  await prisma.upload.deleteMany();
  await prisma.verificationStatus.deleteMany();
  await prisma.session.deleteMany();
  await prisma.deletionRequest.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: {
      email: "verified@onlydihs.local",
      username: "verified_user",
      passwordHash: await hashPassword("change-me-change-me")
    }
  });

  await prisma.verificationStatus.create({
    data: {
      userId: user.id,
      provider: "placeholder",
      providerVerificationId: "seed_verified_adult",
      status: "verified",
      ageOver18Confirmed: true,
      verifiedAt: new Date()
    }
  });

  // eslint-disable-next-line no-console
  console.log("Seed complete: verified@onlydihs.local / change-me-change-me");
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
