/**
 * Clone books and summary transactions from one user to another.
 * Default: from dhruvshdarshansh@gmail.com -> science@gitarthganga.com
 *
 * Run: node scripts/clone-user-data.js [sourceEmail] [targetEmail]
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const sourceEmail = process.argv[2] || 'dhruvshdarshansh@gmail.com';
const targetEmail = process.argv[3] || 'science@gitarthganga.com';

async function main() {
  const sourceUser = await prisma.user.findUnique({ where: { email: sourceEmail } });
  const targetUser = await prisma.user.findUnique({ where: { email: targetEmail } });

  if (!sourceUser) {
    throw new Error(`Source user not found: ${sourceEmail}`);
  }
  if (!targetUser) {
    throw new Error(`Target user not found: ${targetEmail}`);
  }

  console.log(`Cloning data from ${sourceEmail} -> ${targetEmail}`);

  const books = await prisma.bookMaster.findMany({
    where: { userId: sourceUser.id },
    include: {
      editor: true,
      transactions: {
        include: {
          genericSubjects: true,
          specificSubjects: true,
        },
      },
    },
  });

  let bookCount = 0;
  let transactionCount = 0;

  for (const book of books) {
    const { transactions, editor, ...bookData } = book;
    const newBook = await prisma.bookMaster.create({
      data: {
        libraryNumber: bookData.libraryNumber,
        bookName: bookData.bookName,
        bookSummary: bookData.bookSummary,
        pageNumbers: bookData.pageNumbers,
        grade: bookData.grade,
        remark: bookData.remark,
        edition: bookData.edition,
        publisherName: bookData.publisherName,
        coverImageUrl: bookData.coverImageUrl,
        coverImagePublicId: bookData.coverImagePublicId,
        userId: targetUser.id,
        editor: editor?.length
          ? {
              create: editor.map((e) => ({
                name: e.name,
                role: e.role,
              })),
            }
          : undefined,
      },
    });
    bookCount++;

    for (const tx of transactions || []) {
      const { genericSubjects, specificSubjects, ...txData } = tx;
      await prisma.summaryTransaction.create({
        data: {
          srNo: txData.srNo,
          title: txData.title,
          keywords: txData.keywords,
          relevantParagraph: txData.relevantParagraph,
          paragraphNo: txData.paragraphNo,
          pageNo: txData.pageNo,
          informationRating: txData.informationRating,
          remark: txData.remark,
          summary: txData.summary,
          conclusion: txData.conclusion,
          footNote: txData.footNote,
          imageUrl: txData.imageUrl,
          imagePublicId: txData.imagePublicId,
          bookId: newBook.id,
          userId: targetUser.id,
          genericSubjects: genericSubjects?.length
            ? {
                create: genericSubjects.map((g) => ({
                  genericSubject: { connect: { id: g.genericSubjectId } },
                })),
              }
            : undefined,
          specificSubjects: specificSubjects?.length
            ? {
                create: specificSubjects.map((s) => ({
                  tag: { connect: { id: s.tagId } },
                })),
              }
            : undefined,
        },
      });
      transactionCount++;
    }
  }

  console.log(`Cloned ${bookCount} books and ${transactionCount} transactions to ${targetEmail}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
