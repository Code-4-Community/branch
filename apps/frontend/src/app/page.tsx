'use client';
import Header from "./components/Header";
import LoginPage from "./components/LoginPage";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* 1. Default Header - Verify this matches Figma */}
      <Header />
      <div className="flex flex-1 min-h-[calc(100vh-4rem)]">
        <div className="w-1/2">
          {/*Tree image */}
        </div>
        <div className="w-1/2 flex items-center justify-center">
          <LoginPage />
        </div>
      </div>
    </div>
  );
}
