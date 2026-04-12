"use client";

import NavBar from "./components/Navbar";

export default function Home() {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <NavBar role="admin" />
      <main style={{ flex: 1, backgroundColor: "#f9fafb" }}>
        {/* page content goes here */}
      </main>
    </div>
  );
}