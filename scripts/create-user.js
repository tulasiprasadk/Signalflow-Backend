const { PrismaClient } = require('@prisma/client');
const { randomBytes, scryptSync } = require('crypto');

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

async function main() {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  const password = String(process.argv[3] || '').trim();

  if (!email || !email.includes('@')) {
    throw new Error('Usage: npm run user:create -- user@example.com strongpassword');
  }

  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(JSON.stringify({ ok: true, created: false, email, id: existing.id }));
    return;
  }

  const orgLabel = email.split('@')[0] || 'signalflow';
  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        email,
        password: hashPassword(password),
      },
    });

    const organization = await tx.organization.create({
      data: {
        name: `${orgLabel} organization`,
        description: 'Default organization',
        category: 'general',
        location: 'remote',
        website: '',
      },
    });

    await tx.membership.create({
      data: {
        userId: createdUser.id,
        organizationId: organization.id,
        role: 'owner',
      },
    });

    return createdUser;
  });

  console.log(JSON.stringify({ ok: true, created: true, email, id: user.id }));
}

main()
  .catch((error) => {
    console.error(error.message || String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
