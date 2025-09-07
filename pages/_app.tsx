import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { useRouter } from 'next/router'
import Layout from '../components/Layout'
import ProtectedRoute from '../components/ProtectedRoute'
import AuthForm from '../components/AuthForm'

// Pages that don't require authentication
const publicPages = ['/login', '/register'];

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isPublicPage = publicPages.includes(router.pathname);

  if (isPublicPage) {
    return <Component {...pageProps} />;
  }

  return (
    <ProtectedRoute>
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </ProtectedRoute>
  );
}

export default MyApp;