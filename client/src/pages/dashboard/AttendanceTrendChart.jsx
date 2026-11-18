import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

/**
 * Isolated 7-day attendance trend chart loaded lazily only for Admin/HR dashboards.
 */
export default function AttendanceTrendChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
        <XAxis dataKey="_id" tick={{ fontSize: 11, fill: '#64748B' }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748B' }} />
        <Tooltip
          contentStyle={{
            backgroundColor: '#FFFFFF',
            borderRadius: '10px',
            border: '1px solid #E2E8F0',
            fontSize: '11px',
          }}
        />
        <Legend wrapperStyle={{ fontSize: '11px' }} />
        <Bar dataKey="present" fill="#2563EB" name="Present" radius={[4, 4, 0, 0]} />
        <Bar dataKey="late" fill="#F59E0B" name="Late Arrivals" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
