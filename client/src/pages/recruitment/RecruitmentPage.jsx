import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import {
  Briefcase,
  UserPlus,
  Users,
  Plus,
  CheckCircle,
  Clock,
  X,
} from 'lucide-react';

export default function RecruitmentPage() {
  const [jobs, setJobs] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showJobModal, setShowJobModal] = useState(false);
  const [showCandidateModal, setShowCandidateModal] = useState(false);

  // Forms
  const [jobForm, setJobForm] = useState({
    title: '',
    departmentId: '',
    openingsCount: 1,
    location: 'Bengaluru / Hybrid',
    type: 'Full-Time',
    experienceRequired: '2-4 years',
    description: '',
  });

  const [candForm, setCandForm] = useState({
    jobOpeningId: '',
    fullName: '',
    email: '',
    phone: '',
    currentCompany: '',
    currentCtc: 0,
    expectedCtc: 0,
    noticePeriodDays: 30,
    notes: '',
  });

  useEffect(() => {
    fetchRecruitmentData();
  }, []);

  const fetchRecruitmentData = async () => {
    try {
      setLoading(true);
      const [jobsRes, candRes, deptRes] = await Promise.all([
        api.get('/recruitment/jobs'),
        api.get('/recruitment/candidates'),
        api.get('/departments'),
      ]);
      setJobs(jobsRes.data.jobs || []);
      setCandidates(candRes.data.candidates || []);
      setDepartments(deptRes.data.departments || []);
    } catch (err) {
      toast.error('Failed to load recruitment data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateJob = async (e) => {
    e.preventDefault();
    try {
      await api.post('/recruitment/jobs', {
        ...jobForm,
        openingsCount: Number(jobForm.openingsCount),
      });
      toast.success('Job requisition posted!');
      setShowJobModal(false);
      setJobForm({
        title: '',
        departmentId: '',
        openingsCount: 1,
        location: 'Bengaluru / Hybrid',
        type: 'Full-Time',
        experienceRequired: '2-4 years',
        description: '',
      });
      fetchRecruitmentData();
    } catch (err) {
      toast.error(err.message || 'Job creation failed');
    }
  };

  const handleAddCandidate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/recruitment/candidates', {
        ...candForm,
        currentCtc: Number(candForm.currentCtc),
        expectedCtc: Number(candForm.expectedCtc),
        noticePeriodDays: Number(candForm.noticePeriodDays),
      });
      toast.success('Candidate registered!');
      setShowCandidateModal(false);
      setCandForm({
        jobOpeningId: '',
        fullName: '',
        email: '',
        phone: '',
        currentCompany: '',
        currentCtc: 0,
        expectedCtc: 0,
        noticePeriodDays: 30,
        notes: '',
      });
      fetchRecruitmentData();
    } catch (err) {
      toast.error(err.message || 'Registration failed');
    }
  };

  const handleStatusChange = async (candidateId, newStatus) => {
    try {
      await api.patch(`/recruitment/candidates/${candidateId}/status`, { status: newStatus });
      toast.success(`Candidate status: ${newStatus}`);
      fetchRecruitmentData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Recruitment & Hiring Pipeline</h2>
          <p className="text-xs text-slate-500">Manage requisitions, applicant profiles, and interview rounds</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCandidateModal(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Candidate</span>
          </button>
          <button
            onClick={() => setShowJobModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm shadow-blue-200"
          >
            <Plus className="w-4 h-4" />
            <span>Post Job</span>
          </button>
        </div>
      </div>

      {/* Active Requisitions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {jobs.map((job) => (
          <div key={job._id} className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
                <Briefcase className="w-5 h-5" />
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">
                {job.status}
              </span>
            </div>
            <h3 className="text-base font-bold text-slate-900 mt-3">{job.title}</h3>
            <p className="text-xs text-blue-700 font-semibold">{job.departmentId?.name || 'Department'}</p>
            <div className="mt-3 text-xs text-slate-500 space-y-1">
              <p>Location: {job.location}</p>
              <p>Openings: {job.openingsCount} position(s)</p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-600">
              <span>{job.candidateCount || 0} Candidates Applied</span>
            </div>
          </div>
        ))}
      </div>

      {/* Candidate Pipeline */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 mb-4">Applicant Pipeline</h3>

        {loading ? (
          <div className="p-8 text-center">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
        ) : candidates.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">No applicants in pipeline yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-y border-slate-200">
                <tr>
                  <th className="py-3 px-4">Candidate</th>
                  <th className="py-3 px-4">Applied Role</th>
                  <th className="py-3 px-4">Current Company</th>
                  <th className="py-3 px-4">Expected CTC</th>
                  <th className="py-3 px-4">Notice Period</th>
                  <th className="py-3 px-4">Stage Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {candidates.map((cand) => (
                  <tr key={cand._id} className="hover:bg-slate-50">
                    <td className="py-3.5 px-4 font-bold text-slate-800">
                      {cand.fullName}
                      <span className="block text-[11px] font-normal text-slate-500">{cand.email}</span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-blue-700">
                      {cand.jobOpeningId?.title || 'Open Position'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">{cand.currentCompany || 'N/A'}</td>
                    <td className="py-3.5 px-4 font-bold text-slate-800">
                      ₹ {cand.expectedCtc?.toLocaleString('en-IN') || 0}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">{cand.noticePeriodDays} Days</td>
                    <td className="py-3.5 px-4">
                      <select
                        value={cand.status}
                        onChange={(e) => handleStatusChange(cand._id, e.target.value)}
                        className="px-2 py-1 border border-slate-300 rounded text-xs font-bold bg-white"
                      >
                        <option value="Applied">Applied</option>
                        <option value="Screening">Screening</option>
                        <option value="Interviewing">Interviewing</option>
                        <option value="Offered">Offered</option>
                        <option value="Hired">Hired</option>
                        <option value="Rejected">Rejected</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Post Job Modal */}
      {showJobModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Post Job Requisition</h3>
              <button onClick={() => setShowJobModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateJob} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700">Job Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Senior Frontend Engineer"
                  value={jobForm.title}
                  onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700">Department *</label>
                <select
                  required
                  value={jobForm.departmentId}
                  onChange={(e) => setJobForm({ ...jobForm, departmentId: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Select Department</option>
                  {departments.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700">Positions Open</label>
                  <input
                    type="number"
                    min="1"
                    value={jobForm.openingsCount}
                    onChange={(e) => setJobForm({ ...jobForm, openingsCount: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700">Experience</label>
                  <input
                    type="text"
                    value={jobForm.experienceRequired}
                    onChange={(e) => setJobForm({ ...jobForm, experienceRequired: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700">Job Description *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Responsibilities, technical prerequisites & goals"
                  value={jobForm.description}
                  onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowJobModal(false)}
                  className="px-3 py-1.5 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg font-bold"
                >
                  Post Job
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Candidate Modal */}
      {showCandidateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Add Candidate to Pipeline</h3>
              <button onClick={() => setShowCandidateModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddCandidate} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700">Target Requisition *</label>
                <select
                  required
                  value={candForm.jobOpeningId}
                  onChange={(e) => setCandForm({ ...candForm, jobOpeningId: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Select Job Opening</option>
                  {jobs.map((j) => (
                    <option key={j._id} value={j._id}>
                      {j.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700">Candidate Name *</label>
                <input
                  type="text"
                  required
                  value={candForm.fullName}
                  onChange={(e) => setCandForm({ ...candForm, fullName: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700">Email *</label>
                  <input
                    type="email"
                    required
                    value={candForm.email}
                    onChange={(e) => setCandForm({ ...candForm, email: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700">Phone</label>
                  <input
                    type="tel"
                    value={candForm.phone}
                    onChange={(e) => setCandForm({ ...candForm, phone: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700">Expected CTC (INR)</label>
                  <input
                    type="number"
                    value={candForm.expectedCtc}
                    onChange={(e) => setCandForm({ ...candForm, expectedCtc: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700">Notice Period (Days)</label>
                  <input
                    type="number"
                    value={candForm.noticePeriodDays}
                    onChange={(e) => setCandForm({ ...candForm, noticePeriodDays: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCandidateModal(false)}
                  className="px-3 py-1.5 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg font-bold"
                >
                  Save Candidate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

