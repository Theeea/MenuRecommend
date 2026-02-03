import "dotenv/config";
import { PrismaService } from "../prisma/prisma.service";
import { ProofService } from "../proof/proof.service";

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();

  try {
    const proof = new ProofService(prisma);

    const limit = Number(process.env.PROOF_AI_BATCH ?? 5);
    const res = await proof.processPendingBatch(limit);

    console.log("[proof-ai]", JSON.stringify(res));
  } catch (e) {
    console.error("[proof-ai] fatal", e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
