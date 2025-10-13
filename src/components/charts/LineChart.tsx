import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

type Props = {
  data: Array<{
    month: string;
    total?: number;
    profit?: number;
    [key: string]: any;
  }>;
  dataKey1: string;
  dataKey2?: string;
  label1?: string;
  label2?: string;
  color1?: string;
  color2?: string;
};

export default function LineChart({
  data,
  dataKey1,
  dataKey2,
  label1 = 'Value 1',
  label2 = 'Value 2',
  color1 = '#3b82f6',
  color2 = '#10b981',
}: Props) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <RechartsLineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="month" tick={{fontSize: 12}} stroke="#6b7280" />
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
          formatter={(value: number) =>
            `Rs. ${value.toLocaleString('en-PK', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`
          }
        />
        <Legend />
        <Line
          type="monotone"
          dataKey={dataKey1}
          stroke={color1}
          strokeWidth={2}
          name={label1}
          dot={{r: 4}}
          activeDot={{r: 6}}
        />
        {dataKey2 && (
          <Line
            type="monotone"
            dataKey={dataKey2}
            stroke={color2}
            strokeWidth={2}
            name={label2}
            dot={{r: 4}}
            activeDot={{r: 6}}
          />
        )}
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}
