import {FiX} from 'react-icons/fi';

type ProfileTabProps = {
  profile: {
    id: string;
    name: string;
  };
  isActive: boolean;
  onSwitch: () => void;
  onClose: () => void;
  canClose: boolean;
};

export default function ProfileTab({
  profile,
  isActive,
  onSwitch,
  onClose,
  canClose,
}: ProfileTabProps) {
  return (
    <div
      className={`
        group flex items-center gap-2 px-3 py-1.5 rounded-t-lg border-t border-x 
        transition-all cursor-pointer min-w-[120px] max-w-[200px]
        ${
          isActive
            ? 'bg-white border-neutral-200 shadow-sm'
            : 'bg-neutral-100 border-transparent hover:bg-neutral-50'
        }
      `}>
      {/* Profile Name */}
      <button
        onClick={onSwitch}
        className="flex-1 text-left text-sm truncate"
        title={profile.name}>
        <span
          className={`
          ${isActive ? 'text-neutral-900 font-medium' : 'text-neutral-600'}
        `}>
          {profile.name}
        </span>
      </button>

      {/* Close Button */}
      {canClose && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className={`
            flex items-center justify-center size-5 rounded hover:bg-neutral-200
            transition-opacity
            ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
          `}
          title="Close profile">
          <FiX className="size-3" />
        </button>
      )}
    </div>
  );
}
