const { PrismaClient } = require('@prisma/client');

(async function main() {
  const db = new PrismaClient();
  try {
    console.log('Attempting DB connect using DATABASE_URL from environment...');
    await db.$connect();
    console.log('DB OK');
    process.exit(0);
  } catch (e) {
    console.error('DB ERR', e && e.message ? e.message : e);
    if (e && e.stack) console.error(e.stack);
    process.exit(1);
  } finally {
    try { await db.$disconnect(); } catch (__) {}
  }
})();
