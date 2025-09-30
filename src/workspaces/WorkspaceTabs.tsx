import {useWorkspaceStore} from './store';

export default function WorkspaceTabs() {
  const {workspaces, activeId, setActiveId} = useWorkspaceStore();
  if (workspaces.length === 0) return null;

  return (
    <div className="flex items-center gap-1 px-2 py-1 border-b border-neutral-200 bg-white">
      {workspaces.map((w) => {
        const isActive = w.id === activeId;
        return (
          <div
            key={w.id}
            className={`flex items-center gap-2 px-3 py-1 rounded-t-md cursor-pointer border ${
              isActive
                ? 'bg-neutral-100 border-neutral-300 border-b-white font-semibold'
                : 'border-transparent hover:bg-neutral-50'
            }`}
            onClick={() => setActiveId(w.id)}>
            <span className="text-sm">{w.name}</span>
          </div>
        );
      })}
    </div>
  );
}
