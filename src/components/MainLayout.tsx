import { Outlet } from "react-router-dom";
import Navbar from "./layout/Navbar";
import ProfileTabs from "./profile/ProfileTabs";

export default function MainLayout() {
  return (
    // FIX: Use h-full to fill the parent container (which is h-screen minus TitleBar)
    <div className="flex h-full w-full bg-neutral-50 overflow-hidden">
      {/* Left: Collapsible Navigation */}
      <Navbar />

      {/* Right: Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top: Profile Tabs */}
        <ProfileTabs />

        {/* Main Content */}
        <main className="flex-1 overflow-auto relative">
          <div className="p-6 min-h-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
