import {useState, useRef, useEffect} from 'react';
import {FiCalendar} from 'react-icons/fi';

export type DateRange = {
  start: string;
  end: string;
  label: string;
};

type Props = {
  value: DateRange | null;
  onChange: (range: DateRange | null) => void;
};

export default function DateRangeSelector({value, onChange}: Props) {
  const [showMenu, setShowMenu] = useState(false);
  const [selectedDay, setSelectedDay] = useState(value?.start || '');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDateChange = (date: string) => {
    setSelectedDay(date);
    if (!date) {
      onChange(null);
    } else {
      onChange({
        start: date,
        end: date,
        label: formatDateLabel(date),
      });
    }
    setShowMenu(false);
  };

  const handleClear = () => {
    setSelectedDay('');
    onChange(null);
    setShowMenu(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        className="flex items-center gap-2 px-4 py-2 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
        onClick={() => {
          setSelectedDay(value?.start || '');
          setShowMenu(!showMenu);
        }}>
        <FiCalendar className="size-4" />
        <span className="text-sm font-medium">
          {value?.label || 'Select date'}
        </span>
      </button>

      {showMenu && (
        <div className="absolute right-0 mt-2 w-56 bg-white border border-neutral-200 rounded-lg shadow-lg z-10 p-4">
          <h3 className="text-sm font-semibold mb-3">Select Date</h3>
          <input
            type="date"
            value={selectedDay}
            onChange={(e) => handleDateChange(e.target.value)}
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg"
            max={new Date().toISOString().split('T')[0]}
          />
          <button
            type="button"
            onClick={handleClear}
            className="mt-3 w-full px-3 py-2 bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300 text-sm">
            Clear filter
          </button>
        </div>
      )}
    </div>
  );
}

function formatDateLabel(dateString: string): string {
  const [year, month, day] = dateString.split('-').map(Number);
  return `${getMonthName(month)} ${String(day).padStart(2, '0')}, ${year}`;
}

function getMonthName(month: number): string {
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return months[month - 1];
}
