import {Outlet} from 'react-router-dom';
import Navbar from './layout/Navbar';
import ProfileTabs from '././profile/ProfileTabs';

export default function MainLayout() {
  return (
    <div className="flex h-screen bg-neutral-50">
      {/* Left: Collapsible Navigation */}
      <Navbar />

      {/* Right: Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top: Profile Tabs */}
        <ProfileTabs />

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          <div className="p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
