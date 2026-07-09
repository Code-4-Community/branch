import React from 'react';
import Image from "next/image";
import { assetPath } from "@/lib/asset";

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
      className="flex w-full h-12 items-center justify-between border-b border-gray-200 bg-white"
      style={{paddingLeft: 32, paddingRight: 32, paddingTop: 20, paddingBottom: 12}}
    >
      {/* Dynamic Text Section */}
      <h5 className="text-core-black">
        {text}
      </h5>
      
      {/* Flexible Icon Section */}
      <div className="flex items-center">
        {icon || (
          // Default Profile Icon matching Figma
          <div className="h-8 w-8 rounded-full border border-gray-300 flex items-center justify-center">
             <Image src={assetPath("/profile-icon.svg")} alt="Profile Icon" width={24} height={24} />
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;