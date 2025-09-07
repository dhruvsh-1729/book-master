import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserIdFromRequest } from '../../../lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = getUserIdFromRequest(req);
  
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { method, query: { id } } = req;

  switch (method) {
    case 'GET':
      try {
        const book = await prisma.bookMaster.findFirst({
          where: { 
            id: id as string,
            userId // Ensure user can only access their own books
          },
          include: {
            user: { select: { id: true, name: true, email: true } },
            editors: true,
            genericTags: {
              include: { genericSubject: true }
            },
            specificTags: {
              include: { tag: true }
            },
            summaryTransactions: {
              include: {
                genericSubject: true,
                specificSubject: true
              },
              orderBy: { srNo: 'asc' }
            }
          }
        });

        if (!book) {
          return res.status(404).json({ error: 'Book not found' });
        }

        res.status(200).json(book);
      } catch (error: any) {
        console.error('Error fetching book:', error);
        res.status(500).json({ error: 'Failed to fetch book' });
      }
      break;


    case 'PUT':
      try {
        const { title, author, description, genericTags, specificTags, summaryTransactions, editors, ...otherData } = req.body;
        
        // Verify the book exists and belongs to the user
        const existingBook = await prisma.bookMaster.findFirst({
          where: { 
            id: id as string,
            userId 
          }
        });
        
        if (!existingBook) {
          return res.status(404).json({ error: 'Book not found' });
        }

        // Update the book in a transaction to ensure consistency
        const updatedBook = await prisma.$transaction(async (tx) => {
          // Update basic book info
          delete otherData.id; // Prevent changing the ID
          delete otherData.userId; // Prevent changing the userId
          
          const book = await tx.bookMaster.update({
            where: { id: id as string },
            data: { 
              title, 
              author, 
              description,
              ...otherData,
              updatedAt: new Date()
            }
          });
          
          // Update generic tags if provided
          if (genericTags) {
            // Remove existing generic tags
            await tx.bookGenericTag.deleteMany({
              where: { bookId: id as string }
            });
            
            // Add new generic tags
            if (genericTags.length > 0) {
              await tx.bookGenericTag.createMany({
                data: genericTags.map((tagId: string) => ({
                  bookId: id as string,
                  genericSubjectId: tagId
                }))
              });
            }
          }
          
          // Update specific tags if provided
          if (specificTags) {
            // Remove existing specific tags
            await tx.bookSpecificTag.deleteMany({
              where: { bookId: id as string }
            });
            
            // Add new specific tags
            if (specificTags.length > 0) {
              await tx.bookSpecificTag.createMany({
                data: specificTags.map((tagId: string) => ({
                  bookId: id as string,
                  tagId
                }))
              });
            }
          }
          
          // Update summary transactions if provided
          if (summaryTransactions) {
            // Remove existing transactions
            await tx.summaryTransaction.deleteMany({
              where: { bookId: id as string }
            });
            
            // Add new transactions
            if (summaryTransactions.length > 0) {
              for (let i = 0; i < summaryTransactions.length; i++) {
                const { genericSubjectId, specificSubjectId, content } = summaryTransactions[i];
                await tx.summaryTransaction.create({
                  data: {
                    bookId: id as string,
                    srNo: i + 1,
                    genericSubjectId,
                    specificSubjectId,
                    title: content?.title || null,
                    keywords: content?.keywords || null,
                    relevantParagraph: content?.relevantParagraph || null,
                    paragraphNo: content?.paragraphNo || null,
                    pageNo: content?.pageNo || null,
                    informationRating: content?.informationRating || null,
                    remark: content?.remark || null,
                    userId
                  }
                });
              }
            }

            // Update editors if provided
            if (editors) {
              // Remove existing editors
              await tx.bookEditor.deleteMany({
                where: { bookId: id as string }
              });
              
              // Add new editors
              if (req.body.editors.length > 0) {
                await tx.bookEditor.createMany({
                  data: req.body.editors.map((editor: { name: string; role?: string }) => ({
                    bookId: id as string,
                    name: editor.name,
                    role: editor.role || null
                  }))
                });
              }
            }
          
          }
          
          return book;
        });

        res.status(200).json(updatedBook);
      } catch (error: any) {
        console.error('Error updating book:', error);
        res.status(500).json({ error: 'Failed to update book' });
      }
      break;

    case 'DELETE':
      try {
        const book = await prisma.bookMaster.findFirst({
          where: { 
            id: id as string,
            userId 
          }
        });

        if (!book) {
          return res.status(404).json({ error: 'Book not found' });
        }

        // Manual cascade delete for MongoDB
        await prisma.$transaction(async (tx) => {
          await tx.bookEditor.deleteMany({ where: { bookId: id as string } });
          await tx.bookGenericTag.deleteMany({ where: { bookId: id as string } });
          await tx.bookSpecificTag.deleteMany({ where: { bookId: id as string } });
          await tx.summaryTransaction.deleteMany({ where: { bookId: id as string } });
          await tx.bookMaster.delete({ where: { id: id as string } });
        });

        res.status(204).end();
      } catch (error: any) {
        console.error('Error deleting book:', error);
        res.status(500).json({ error: 'Failed to delete book' });
      }
      break;

    default:
      res.setHeader('Allow', ['GET', 'DELETE']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
}