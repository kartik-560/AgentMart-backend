import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Clearing test transactions, offers, messages, and negotiations...');

  const deletedTx = await prisma.transaction.deleteMany({});
  console.log(`Deleted ${deletedTx.count} transactions`);

  const deletedOffers = await prisma.offer.deleteMany({});
  console.log(`Deleted ${deletedOffers.count} offers`);

  const deletedMessages = await prisma.agentMessage.deleteMany({});
  console.log(`Deleted ${deletedMessages.count} agent messages`);

  const deletedSec = await prisma.securityEvent.deleteMany({});
  console.log(`Deleted ${deletedSec.count} security events`);

  const deletedNegs = await prisma.negotiation.deleteMany({});
  console.log(`Deleted ${deletedNegs.count} negotiations`);

  await prisma.inventory.updateMany({
    data: { reservedQuantity: 0 },
  });
  console.log('Reset all inventory reserved quantities to 0');

  await prisma.businessMemory.updateMany({
    data: {
      totalTransactions: 0,
      successfulDeals: 0,
    },
  });
  console.log('Reset business memory counters');

  console.log('✅ Database is clean and ready for manual testing!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
