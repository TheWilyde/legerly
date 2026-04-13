import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

type Props = {
  data: Array<{name: string; value: number; [key: string]: any}>;
  dataKey?: string;
  nameKey?: string;
  color?: string;
  label?: string;
};

export default function BarChart({
  data,
  dataKey = 'value',
  nameKey = 'name',
  color = '#3b82f6',
  label = 'Value',
}: Props) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <RechartsBarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey={nameKey} tick={{fontSize: 12}} stroke="#6b7280" />
        <YAxis
          tick={{fontSize: 12}}
          stroke="#6b7280"
          tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
          }}
          formatter={(value) => {
            if (typeof value === 'number') {
              return `Rs. ${value.toLocaleString('en-PK', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`;
            }
            if (typeof value === 'string') {
              const num = Number(value);
              if (!isNaN(num)) {
                return `Rs. ${num.toLocaleString('en-PK', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`;
              }
            }
            return 'Rs. 0.00';
          }}
        />
        <Legend />
        <Bar
          dataKey={dataKey}
          fill={color}
          name={label}
          radius={[8, 8, 0, 0]}
        />
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}
