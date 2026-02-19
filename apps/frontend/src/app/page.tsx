import Header from "./components/Header";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* 1. Default Header - Verify this matches Figma */}
      <Header />

      <main className="p-10 flex flex-col gap-8">
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Visual Verification
          </h2>
          <p className="text-gray-600">
            The header above should show <strong>"BRANCH Accounting Platform"</strong> and the 
            profile icon on the far right.
          </p>
        </section>
              </main>
    </div>
  );
}
