// components/LoadingPage.tsx
import React from 'react';
import { Book } from 'lucide-react';

interface LoadingPageProps {
  message?: string;
  showLogo?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const LoadingPage: React.FC<LoadingPageProps> = ({ 
  message = 'Loading...', 
  showLogo = true,
  size = 'md'
}) => {
  const sizeClasses = {
    sm: {
      container: 'min-h-64',
      logo: 'h-8 w-8',
      spinner: 'h-8 w-8',
      title: 'text-lg',
      message: 'text-sm'
    },
    md: {
      container: 'min-h-screen',
      logo: 'h-12 w-12',
      spinner: 'h-12 w-12',
      title: 'text-2xl',
      message: 'text-base'
    },
    lg: {
      container: 'min-h-screen',
      logo: 'h-16 w-16',
      spinner: 'h-16 w-16',
      title: 'text-3xl',
      message: 'text-lg'
    }
  };

  const currentSize = sizeClasses[size];

  return (
    <div className={`flex items-center justify-center bg-gray-50 ${currentSize.container}`}>
      <div className="text-center space-y-4">
        {showLogo && (
          <div className="flex items-center justify-center space-x-3 mb-6">
            <Book className={`${currentSize.logo} text-blue-600`} />
            <span className={`${currentSize.title} font-bold text-gray-900`}>
              BookMaster
            </span>
          </div>
        )}
        
        {/* Custom Loading Spinner */}
        <div className="flex justify-center">
          <div className={`animate-spin rounded-full ${currentSize.spinner} border-b-2 border-blue-600`}></div>
        </div>
        
        <p className={`text-gray-600 ${currentSize.message} animate-pulse`}>
          {message}
        </p>
        
        {/* Optional loading dots animation */}
        <div className="flex justify-center space-x-1">
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
        </div>
      </div>
    </div>
  );
};

export default LoadingPage;

// Alternative minimal version for specific use cases
export const LoadingSpinner: React.FC<{ 
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ size = 'md', className = '' }) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  };

  return (
    <div className={`animate-spin rounded-full border-b-2 border-blue-600 ${sizeClasses[size]} ${className}`}></div>
  );
};

// Page-level loading component with backdrop
export const PageLoader: React.FC<LoadingPageProps> = ({ 
  message = 'Loading...', 
  showLogo = true 
}) => {
  return (
    <div className="fixed inset-0 bg-white bg-opacity-90 backdrop-blur-sm z-50 flex items-center justify-center">
      <LoadingPage message={message} showLogo={showLogo} size="md" />
    </div>
  );
};