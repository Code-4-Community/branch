"use client";
import ProjectCard from "./components/ProjectCard";
import NavBar from "./components/Navbar";

export default function Home() {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <NavBar role="admin" />
      <main style={{ flex: 1, backgroundColor: "#f9fafb" }}>
        <ProjectCard variant="active" name="p1" total_budget={100} budget_used={50} members={10}/>
        <ProjectCard variant="archive" name="p1" total_budget={100} members={10} start_date="2024-01-01" end_date="2024-12-31" />
      </main>
    </div>
  );
}