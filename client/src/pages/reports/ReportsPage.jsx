import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { BarChart3, Download, Users, CalendarCheck, DollarSign } from 'lucide-react';

export default function ReportsPage() {
  const [activeReport, setActiveReport] = useState('employees'); // 'employees' | 'attendance' | 'payroll'
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReportData();
  }, [activeReport]);

  const fetchReportData = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/reports/${activeReport}`);
      if (activeReport === 'employees') setReportData(res.data.employees || []);
      if (activeReport === 'attendance') setReportData(res.data.attendance || []);
      if (activeReport === 'payroll') setReportData(res.data.payslips || []);
    } catch (err) {
      toast.error('Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    const url = `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'}/reports/${activeReport}?format=csv`;
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Reports & Analytical Exports</h2>
          <p className="text-xs text-slate-500">Live data summaries and compliant CSV format exports</p>
        </div>

        <button
          onClick={handleExportCSV}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm shadow-emerald-200"
        >
          <Download className="w-4 h-4" />
          <span>Export {activeReport.toUpperCase()} CSV</span>
        </button>
      </div>

      {/* Switcher */}
      <div className="flex p-1 bg-slate-200/70 rounded-xl text-xs font-semibold w-fit">
        <button
          onClick={() => setActiveReport('employees')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
            activeReport === 'employees' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Employees</span>
        </button>
        <button
          onClick={() => setActiveReport('attendance')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
            activeReport === 'attendance' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
          }`}
        >
          <CalendarCheck className="w-4 h-4" />
          <span>Attendance</span>
        </button>
        <button
          onClick={() => setActiveReport('payroll')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
            activeReport === 'payroll' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>Payroll</span>
        </button>
      </div>

      {/* Report Table */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
        {loading ? (
          <div className="p-8 text-center">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
        ) : reportData.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">No records found.</div>
        ) : (
          <div className="overflow-x-auto">
            {activeReport === 'employees' && (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-y border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Designation</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.map((e) => (
                    <tr key={e._id}>
                      <td className="py-3 px-4 font-mono font-bold text-blue-600">{e.employeeId}</td>
                      <td className="py-3 px-4 font-bold text-slate-800">{e.firstName} {e.lastName}</td>
                      <td className="py-3 px-4 text-slate-600">{e.email}</td>
                      <td className="py-3 px-4 text-slate-700">{e.departmentId?.name || 'N/A'}</td>
                      <td className="py-3 px-4 text-slate-700">{e.designationId?.title || 'N/A'}</td>
                      <td className="py-3 px-4 font-bold text-emerald-600">{e.employmentStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {activeReport === 'attendance' && (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-y border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Clock In</th>
                    <th className="py-3 px-4">Clock Out</th>
                    <th className="py-3 px-4">Total Hours</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.map((a) => (
                    <tr key={a._id}>
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {new Date(a.date).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-800">
                        {a.employeeId?.firstName} {a.employeeId?.lastName}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {a.checkInTime ? new Date(a.checkInTime).toLocaleTimeString() : '--:--'}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {a.checkOutTime ? new Date(a.checkOutTime).toLocaleTimeString() : '--:--'}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-800">{a.totalHours} hrs</td>
                      <td className="py-3 px-4 font-bold text-blue-600">{a.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {activeReport === 'payroll' && (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-y border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Payslip #</th>
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Period</th>
                    <th className="py-3 px-4">Gross Earnings</th>
                    <th className="py-3 px-4">Total Deductions</th>
                    <th className="py-3 px-4">Net Take-Home</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.map((p) => (
                    <tr key={p._id}>
                      <td className="py-3 px-4 font-mono font-bold text-blue-600">{p.payslipNumber}</td>
                      <td className="py-3 px-4 font-bold text-slate-800">
                        {p.employeeId?.firstName} {p.employeeId?.lastName}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{p.month}/{p.year}</td>
                      <td className="py-3 px-4 text-slate-700">₹ {p.grossSalary?.toLocaleString('en-IN')}</td>
                      <td className="py-3 px-4 text-red-600">₹ {p.totalDeductions?.toLocaleString('en-IN')}</td>
                      <td className="py-3 px-4 font-black text-emerald-700">₹ {p.netSalary?.toLocaleString('en-IN')}</td>
                      <td className="py-3 px-4 font-bold text-emerald-600">{p.paymentStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

