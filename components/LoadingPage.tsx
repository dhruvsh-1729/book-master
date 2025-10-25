// components/LoadingPage.tsx
import React from 'react';
import { Book } from 'lucide-react';

interface LoadingPageProps {
  message?: string;
  showLogo?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const LoadingPage: React.FC<LoadingPageProps> = ({ message = 'Loading...', showLogo = true, size = 'md' }) => {
  const sizeClasses = {
    sm: { container: 'min-h-64', logo: 'h-8 w-8', spinner: 'h-8 w-8', title: 'text-lg', message: 'text-sm' },
    md: { container: 'min-h-screen', logo: 'h-12 w-12', spinner: 'h-12 w-12', title: 'text-2xl', message: 'text-base' },
    lg: { container: 'min-h-screen', logo: 'h-16 w-16', spinner: 'h-16 w-16', title: 'text-3xl', message: 'text-lg' },
  };
  const s = sizeClasses[size];

  return (
    <div className={`flex items-center justify-center bg-gray-50 ${s.container}`}>
      <div className="text-center space-y-4">
        {showLogo && (
          <div className="flex items-center justify-center space-x-3 mb-6">
            <Book className={`${s.logo} text-blue-600`} />
            <span className={`${s.title} font-bold text-gray-900`}>BookMaster</span>
          </div>
        )}
        <div className="flex justify-center">
          <div className={`animate-spin rounded-full ${s.spinner} border-b-2 border-blue-600`} />
        </div>
        <p className={`text-gray-600 ${s.message} animate-pulse`}>{message}</p>
        <div className="flex justify-center space-x-1">
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" />
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
        </div>
      </div>
    </div>
  );
};

export default LoadingPage;

// A tiny inline spinner for ad-hoc use without clash:
export const InlineSpinner: React.FC<{ size?: 'sm' | 'md' | 'lg'; className?: string }> = ({ size = 'md', className = '' }) => {
  const s = { sm: 'h-4 w-4', md: 'h-8 w-8', lg: 'h-12 w-12' }[size];
  return <div className={`animate-spin rounded-full border-b-2 border-blue-600 ${s} ${className}`} />;
};
