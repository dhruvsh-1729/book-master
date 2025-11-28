/**
 * Migration helper: move single-image fields into multi-image relations.
 * Safe to run multiple times (idempotent per existing url/publicId combo).
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function migrateTransactions() {
  const txs = await prisma.summaryTransaction.findMany({
    where: { OR: [{ imageUrl: { not: null } }, { imagePublicId: { not: null } }] },
    select: { id: true, imageUrl: true, imagePublicId: true },
  });

  for (const tx of txs) {
    if (!tx.imageUrl) continue;
    const exists = await prisma.transactionImage.findFirst({
      where: {
        summaryTransactionId: tx.id,
        url: tx.imageUrl,
      },
    });
    if (exists) continue;
    await prisma.transactionImage.create({
      data: {
        summaryTransactionId: tx.id,
        url: tx.imageUrl,
        publicId: tx.imagePublicId,
      },
    });
  }
  console.log(`Migrated transaction images: ${txs.length}`);
}

async function migrateBooks() {
  const books = await prisma.bookMaster.findMany({
    where: { OR: [{ coverImageUrl: { not: null } }, { coverImagePublicId: { not: null } }] },
    select: { id: true, coverImageUrl: true, coverImagePublicId: true },
  });

  for (const book of books) {
    if (!book.coverImageUrl) continue;
    const exists = await prisma.bookImage.findFirst({
      where: {
        bookId: book.id,
        url: book.coverImageUrl,
      },
    });
    if (exists) continue;
    await prisma.bookImage.create({
      data: {
        bookId: book.id,
        url: book.coverImageUrl,
        publicId: book.coverImagePublicId,
      },
    });
  }
  console.log(`Migrated book images: ${books.length}`);
}

async function main() {
  await migrateTransactions();
  await migrateBooks();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
