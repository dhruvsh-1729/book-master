const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'dhruvshdarshansh@gmail.com';

  const users = await prisma.user.findMany({ select: { id: true, email: true, role: true } });
  for (const user of users) {
    const targetRole = user.email === adminEmail ? 'admin' : (user.role || 'user');
    if (user.role !== targetRole) {
      await prisma.user.update({ where: { id: user.id }, data: { role: targetRole } });
      console.log(`Updated ${user.email} -> ${targetRole}`);
    }
  }
  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  })
  .then(() => {
    process.exit(0);
  });
