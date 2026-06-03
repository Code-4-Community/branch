import React from 'react';

interface HeaderProps {
  text?: string;
  icon?: React.ReactNode;
}

const Header: React.FC<HeaderProps> = ({ 
  text = "BRANCH Accounting Platform", 
  icon 
}) => {
  return (
    <header
      className="flex h-16 w-full items-center justify-between border-b border-gray-200 bg-white"
      style={{ paddingLeft: 40, paddingRight: 40 }}
    >
      {/* Dynamic Text Section */}
      <span className="text-sm font-bold text-gray-800" style={{ marginLeft: 16 }}>
        {text}
      </span>
      
      {/* Flexible Icon Section */}
      <div className="flex items-center">
        {icon || (
          // Default Profile Icon matching Figma
          <div className="h-8 w-8 rounded-full border border-gray-300 flex items-center justify-center">
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;