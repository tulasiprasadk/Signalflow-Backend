const { PrismaClient } = require('@prisma/client');
(async () => {
  const prisma = new PrismaClient();
  try {
    const oldProvider = '974834305707134';
    const newProvider = 'facebook:rrnagar';
    console.log('Finding account with provider=', oldProvider);
    const acc = await prisma.socialAccount.findFirst({ where: { provider: oldProvider } });
    if (!acc) {
      console.error('No account found for', oldProvider);
      process.exit(2);
    }
    console.log('Found:', acc.id, acc.provider);
    const updated = await prisma.socialAccount.update({ where: { id: acc.id }, data: { provider: newProvider } });
    console.log('Updated provider ->', updated.provider);
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
