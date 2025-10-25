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
  const [showCustomMonth, setShowCustomMonth] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
        setShowCustomMonth(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const presets = [
    {label: 'All Time', value: null},
    {label: 'This Month', value: getThisMonth()},
    {label: 'Last Month', value: getLastMonth()},
    {label: 'Last 3 Months', value: getLast3Months()},
    {label: 'This Year', value: getThisYear()},
    {label: 'Custom Month', value: 'custom'},
  ];

  const handlePresetClick = (preset: {label: string; value: any}) => {
    if (preset.value === 'custom') {
      setShowCustomMonth(true);
    } else {
      setShowCustomMonth(false);
      setShowMenu(false);
      // ✅ Pass null for "All Time", otherwise pass the DateRange
      onChange(preset.value);
    }
  };

  const handleCustomMonthSelect = () => {
    if (!selectedMonth) return;

    const [year, month] = selectedMonth.split('-');
    const start = `${year}-${month}-01`;
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    const end = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;

    onChange({
      start,
      end,
      label: `${getMonthName(Number(month))} ${year}`,
    });
    setShowCustomMonth(false);
    setShowMenu(false);
    setSelectedMonth('');
  };

  const handleCancelCustomMonth = () => {
    setShowCustomMonth(false);
    setSelectedMonth('');
  };

  // ✅ Helper to check if current selection matches a preset
  const isPresetSelected = (preset: {label: string; value: any}) => {
    if (preset.value === null && value === null) return true;
    if (preset.value === 'custom') return false;
    if (preset.value === null || value === null) return false;
    return value.label === preset.label;
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        className="flex items-center gap-2 px-4 py-2 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
        onClick={() => setShowMenu(!showMenu)}>
        <FiCalendar className="size-4" />
        <span className="text-sm font-medium">
          {/* ✅ Show "All Time" when value is null */}
          {value?.label || 'All Time'}
        </span>
      </button>

      {showMenu && showCustomMonth && (
        <div className="absolute right-0 mt-2 w-64 bg-white border border-neutral-200 rounded-lg shadow-lg z-10 p-4">
          <h3 className="text-sm font-semibold mb-3">Select Month</h3>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg mb-3"
            max={new Date().toISOString().slice(0, 7)}
          />
          <div className="flex gap-2">
            <button
              onClick={handleCustomMonthSelect}
              disabled={!selectedMonth}
              className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:bg-blue-300 disabled:cursor-not-allowed">
              Apply
            </button>
            <button
              onClick={handleCancelCustomMonth}
              className="flex-1 px-3 py-2 bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {showMenu && !showCustomMonth && (
        <div className="absolute right-0 mt-2 w-48 bg-white border border-neutral-200 rounded-lg shadow-lg z-10 py-1">
          {presets.map((preset, idx) => (
            <button
              key={idx}
              onClick={() => handlePresetClick(preset)}
              className={`w-full px-4 py-2 text-left text-sm hover:bg-neutral-100 transition-colors ${
                isPresetSelected(preset)
                  ? 'bg-blue-50 text-blue-600 font-medium'
                  : 'text-neutral-700'
              }`}>
              {preset.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function getThisMonth(): DateRange {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return {
    start: `${year}-${month}-01`,
    end: `${year}-${month}-${new Date(year, now.getMonth() + 1, 0).getDate()}`,
    label: 'This Month',
  };
}

function getLastMonth(): DateRange {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year = lastMonth.getFullYear();
  const month = String(lastMonth.getMonth() + 1).padStart(2, '0');
  return {
    start: `${year}-${month}-01`,
    end: `${year}-${month}-${new Date(year, lastMonth.getMonth() + 1, 0).getDate()}`,
    label: 'Last Month',
  };
}

function getLast3Months(): DateRange {
  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const year = threeMonthsAgo.getFullYear();
  const month = String(threeMonthsAgo.getMonth() + 1).padStart(2, '0');
  return {
    start: `${year}-${month}-01`,
    end: new Date().toISOString().split('T')[0],
    label: 'Last 3 Months',
  };
}

function getThisYear(): DateRange {
  const year = new Date().getFullYear();
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
    label: 'This Year',
  };
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
