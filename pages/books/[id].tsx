import { useRouter } from 'next/router';
import BookDetailWithTransactions from '../../components/BookDetailWithTransactions';

const BookDetailPage: React.FC = () => {
  const router = useRouter();
  const { id } = router.query;

  if (!id || typeof id !== 'string') {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return <BookDetailWithTransactions bookId={id} />;
};

export default BookDetailPage;