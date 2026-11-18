import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import api from '../../services/api';
import { fetchMasterData } from '../../store/slices/masterDataSlice';
import toast from 'react-hot-toast';
import {
  Briefcase,
  UserPlus,
  Plus,
  Edit2,
  Calendar,
  UserCheck,
  X,
} from 'lucide-react';

const getInitialJobForm = () => ({
  title: '',
  departmentId: '',
  designationId: '',
  branchId: '',
  openingsCount: 1,
  location: 'Bengaluru / Hybrid',
  type: 'Full-Time',
  experienceRequired: '2-4 years',
  status: 'Open',
  description: '',
});

const getInitialCandForm = () => ({
  jobOpeningId: '',
  fullName: '',
  email: '',
  phone: '',
  currentCompany: '',
  currentCtc: 0,
  expectedCtc: 0,
  noticePeriodDays: 30,
  notes: '',
  interviewScheduledAt: '',
  interviewerName: '',
  interviewMode: 'Video',
  meetingLink: '',
});

const toLocalInputDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export default function RecruitmentPage() {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const { departments, designations, branches } = useSelector((state) => state.masterData);

  const canManageRecruitment = ['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER', 'RECRUITER'].includes(user?.role);
  const canViewCandidates = ['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER', 'RECRUITER', 'MANAGER'].includes(user?.role);
  const canConvert = ['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER'].includes(user?.role);

  const [jobs, setJobs] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showJobModal, setShowJobModal] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [showCandidateModal, setShowCandidateModal] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState(null);
  const [convertingCandidate, setConvertingCandidate] = useState(null);

  // Forms
  const [jobForm, setJobForm] = useState(getInitialJobForm);
  const [candForm, setCandForm] = useState(getInitialCandForm);
  const [convertForm, setConvertForm] = useState({
    branchId: '',
    departmentId: '',
    designationId: '',
    joiningDate: new Date().toISOString().split('T')[0],
    probationPeriodMonths: 3,
    password: 'Welcome@123',
  });

  useEffect(() => {
    dispatch(fetchMasterData(false));
    const controller = new AbortController();
    fetchRecruitmentData(controller.signal);
    return () => controller.abort();
  }, [dispatch, canViewCandidates]);

  const fetchRecruitmentData = async (signal = null) => {
    try {
      setLoading(true);
      const requests = [api.get('/recruitment/jobs', { signal, cacheTtl: 10000 })];
      if (canViewCandidates) {
        requests.push(api.get('/recruitment/candidates', { signal, cacheTtl: 10000 }));
      }
      const [jobsRes, candRes] = await Promise.all(requests);
      setJobs(jobsRes.data?.jobs || jobsRes.jobs || []);
      setCandidates(candRes ? candRes.data?.candidates || candRes.candidates || [] : []);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      toast.error(err.response?.data?.message || err.message || 'Failed to load recruitment data');
    } finally {
      setLoading(false);
    }
  };

  const closeJobModal = () => {
    setShowJobModal(false);
    setEditingJob(null);
    setJobForm(getInitialJobForm());
  };

  const openEditJob = (job) => {
    setEditingJob(job);
    setJobForm({
      title: job.title || '',
      departmentId: job.departmentId?._id || job.departmentId || '',
      designationId: job.designationId?._id || job.designationId || '',
      branchId: job.branchId?._id || job.branchId || '',
      openingsCount: job.openingsCount || 1,
      location: job.location || 'Hybrid / On-site',
      type: job.type || 'Full-Time',
      experienceRequired: job.experienceRequired || '1-3 years',
      status: job.status || 'Open',
      description: job.description || '',
    });
    setShowJobModal(true);
  };

  const handleSaveJob = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...jobForm,
        designationId: jobForm.designationId || null,
        branchId: jobForm.branchId || null,
        openingsCount: Number(jobForm.openingsCount),
      };
      if (editingJob) {
        await api.put(`/recruitment/jobs/${editingJob._id}`, payload);
        toast.success('Job requisition updated!');
      } else {
        await api.post('/recruitment/jobs', payload);
        toast.success('Job requisition posted!');
      }
      closeJobModal();
      fetchRecruitmentData();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to save job requisition');
    }
  };

  const closeCandidateModal = () => {
    setShowCandidateModal(false);
    setEditingCandidate(null);
    setCandForm(getInitialCandForm());
  };

  const openEditCandidate = (cand) => {
    setEditingCandidate(cand);
    setCandForm({
      jobOpeningId: cand.jobOpeningId?._id || cand.jobOpeningId || '',
      fullName: cand.fullName || '',
      email: cand.email || '',
      phone: cand.phone || '',
      currentCompany: cand.currentCompany || '',
      currentCtc: cand.currentCtc || 0,
      expectedCtc: cand.expectedCtc || 0,
      noticePeriodDays: cand.noticePeriodDays ?? 30,
      notes: cand.notes || '',
      interviewScheduledAt: toLocalInputDateTime(cand.interviewSchedule?.scheduledAt),
      interviewerName: cand.interviewSchedule?.interviewerName || '',
      interviewMode: cand.interviewSchedule?.mode || 'Video',
      meetingLink: cand.interviewSchedule?.meetingLink || '',
    });
    setShowCandidateModal(true);
  };

  const handleSaveCandidate = async (e) => {
    e.preventDefault();
    try {
      const interviewSchedule = candForm.interviewScheduledAt || candForm.interviewerName || candForm.meetingLink
        ? {
            scheduledAt: candForm.interviewScheduledAt ? new Date(candForm.interviewScheduledAt).toISOString() : null,
            interviewerName: candForm.interviewerName || '',
            mode: candForm.interviewMode || 'Video',
            meetingLink: candForm.meetingLink || '',
          }
        : undefined;

      const payload = {
        jobOpeningId: candForm.jobOpeningId,
        fullName: candForm.fullName,
        email: candForm.email,
        phone: candForm.phone,
        currentCompany: candForm.currentCompany,
        currentCtc: Number(candForm.currentCtc || 0),
        expectedCtc: Number(candForm.expectedCtc || 0),
        noticePeriodDays: Number(candForm.noticePeriodDays ?? 30),
        notes: candForm.notes,
        ...(interviewSchedule ? { interviewSchedule } : {}),
      };

      if (editingCandidate) {
        await api.put(`/recruitment/candidates/${editingCandidate._id}`, payload);
        toast.success('Candidate profile updated!');
      } else {
        await api.post('/recruitment/candidates', payload);
        toast.success('Candidate registered!');
      }
      closeCandidateModal();
      fetchRecruitmentData();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to save candidate');
    }
  };

  const handleStatusChange = async (candidateId, newStatus) => {
    try {
      await api.patch(`/recruitment/candidates/${candidateId}/status`, { status: newStatus });
      toast.success(`Candidate status: ${newStatus}`);
      fetchRecruitmentData();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Status update failed');
    }
  };

  const openConvertModal = (cand) => {
    setConvertingCandidate(cand);
    setConvertForm({
      branchId: cand.jobOpeningId?.branchId?._id || cand.jobOpeningId?.branchId || '',
      departmentId: cand.jobOpeningId?.departmentId?._id || cand.jobOpeningId?.departmentId || '',
      designationId: cand.jobOpeningId?.designationId?._id || cand.jobOpeningId?.designationId || '',
      joiningDate: new Date().toISOString().split('T')[0],
      probationPeriodMonths: 3,
      password: 'Welcome@123',
    });
  };

  const handleConvertCandidate = async (e) => {
    e.preventDefault();
    if (!convertingCandidate) return;
    try {
      const res = await api.post(`/recruitment/candidates/${convertingCandidate._id}/convert`, {
        branchId: convertForm.branchId || null,
        departmentId: convertForm.departmentId || null,
        designationId: convertForm.designationId || null,
        joiningDate: convertForm.joiningDate,
        probationPeriodMonths: Number(convertForm.probationPeriodMonths || 3),
        password: convertForm.password || 'Welcome@123',
      });
      const empId = res?.data?.employee?.employeeId || res?.employee?.employeeId;
      toast.success(empId ? `Candidate onboarded as Employee (${empId})!` : 'Candidate onboarded as Employee!');
      setConvertingCandidate(null);
      fetchRecruitmentData();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Onboarding failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Recruitment & Hiring Pipeline</h2>
          <p className="text-xs text-slate-500">Manage requisitions, applicant profiles, and interview rounds</p>
        </div>

        {canManageRecruitment && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEditingCandidate(null);
                setCandForm(getInitialCandForm());
                setShowCandidateModal(true);
              }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-sm"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add Candidate</span>
            </button>
            <button
              onClick={() => {
                setEditingJob(null);
                setJobForm(getInitialJobForm());
                setShowJobModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm shadow-blue-200"
            >
              <Plus className="w-4 h-4" />
              <span>Post Job</span>
            </button>
          </div>
        )}
      </div>

      {/* Active Requisitions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {jobs.map((job) => (
          <div key={job._id} className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
                <Briefcase className="w-5 h-5" />
              </span>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    job.status === 'Open'
                      ? 'bg-emerald-100 text-emerald-800'
                      : job.status === 'Closed'
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {job.status}
                </span>
                {canManageRecruitment && (
                  <button
                    type="button"
                    onClick={() => openEditJob(job)}
                    className="p-1 text-slate-400 hover:text-blue-600 rounded"
                    title="Edit job requisition"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <h3 className="text-base font-bold text-slate-900 mt-3">{job.title}</h3>
            <p className="text-xs text-blue-700 font-semibold">
              {job.departmentId?.name || 'Department'}
              {job.designationId?.title ? ` • ${job.designationId.title}` : ''}
            </p>
            <div className="mt-3 text-xs text-slate-500 space-y-1">
              <p>Location: {job.location} {job.branchId?.name ? `(${job.branchId.name})` : ''}</p>
              <p>Type: {job.type} • Openings: {job.openingsCount} position(s)</p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-600">
              <span>{job.candidateCount || 0} Candidates Applied</span>
            </div>
          </div>
        ))}
      </div>

      {/* Candidate Pipeline */}
      {canViewCandidates && (
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
                    <th className="py-3 px-4">Notice / Interview</th>
                    <th className="py-3 px-4">Stage Status</th>
                    {(canManageRecruitment || canConvert) && <th className="py-3 px-4 text-right">Actions</th>}
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
                        {cand.expectedCtc !== undefined ? `₹ ${cand.expectedCtc?.toLocaleString('en-IN') || 0}` : 'Restricted'}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">
                        <div>{cand.noticePeriodDays} Days</div>
                        {cand.interviewSchedule?.scheduledAt && (
                          <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-semibold">
                            <Calendar className="w-3 h-3" />
                            <span>
                              {new Date(cand.interviewSchedule.scheduledAt).toLocaleString()} ({cand.interviewSchedule.mode})
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <select
                          value={cand.status}
                          disabled={!canManageRecruitment || Boolean(cand.convertedToEmployeeId)}
                          onChange={(e) => handleStatusChange(cand._id, e.target.value)}
                          className="px-2 py-1 border border-slate-300 rounded text-xs font-bold bg-white disabled:opacity-60"
                        >
                          <option value="Applied">Applied</option>
                          <option value="Screening">Screening</option>
                          <option value="Interviewing">Interviewing</option>
                          <option value="Offered">Offered</option>
                          <option value="Hired">Hired</option>
                          <option value="Rejected">Rejected</option>
                        </select>
                      </td>
                      {(canManageRecruitment || canConvert) && (
                        <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                          {canManageRecruitment && (
                            <button
                              type="button"
                              onClick={() => openEditCandidate(cand)}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-blue-600"
                            >
                              <Edit2 className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                          )}
                          {cand.convertedToEmployeeId ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                              <UserCheck className="w-3 h-3" />
                              <span>Onboarded ({cand.convertedToEmployeeId.employeeId || 'Emp'})</span>
                            </span>
                          ) : (
                            canConvert &&
                            ['Offered', 'Hired'].includes(cand.status) && (
                              <button
                                type="button"
                                onClick={() => openConvertModal(cand)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold"
                              >
                                <UserCheck className="w-3 h-3" />
                                <span>Convert</span>
                              </button>
                            )
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Post / Edit Job Modal */}
      {showJobModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">
                {editingJob ? 'Edit Job Requisition' : 'Post Job Requisition'}
              </h3>
              <button type="button" onClick={closeJobModal} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveJob} className="mt-4 space-y-3 text-xs">
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
              <div className="grid grid-cols-2 gap-3">
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
                <div>
                  <label className="block font-bold text-slate-700">Designation</label>
                  <select
                    value={jobForm.designationId}
                    onChange={(e) => setJobForm({ ...jobForm, designationId: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">Any / Optional</option>
                    {designations.map((d) => (
                      <option key={d._id} value={d._id}>
                        {d.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700">Branch</label>
                  <select
                    value={jobForm.branchId}
                    onChange={(e) => setJobForm({ ...jobForm, branchId: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">All / Hybrid</option>
                    {branches.map((b) => (
                      <option key={b._id} value={b._id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700">Employment Type</label>
                  <select
                    value={jobForm.type}
                    onChange={(e) => setJobForm({ ...jobForm, type: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Full-Time">Full-Time</option>
                    <option value="Part-Time">Part-Time</option>
                    <option value="Contract">Contract</option>
                    <option value="Internship">Internship</option>
                    <option value="Remote">Remote</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
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
                <div>
                  <label className="block font-bold text-slate-700">Status</label>
                  <select
                    value={jobForm.status}
                    onChange={(e) => setJobForm({ ...jobForm, status: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Open">Open</option>
                    <option value="Draft">Draft</option>
                    <option value="On Hold">On Hold</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700">Location</label>
                <input
                  type="text"
                  value={jobForm.location}
                  onChange={(e) => setJobForm({ ...jobForm, location: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
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
                  onClick={closeJobModal}
                  className="px-3 py-1.5 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg font-bold"
                >
                  {editingJob ? 'Update Job' : 'Post Job'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Candidate Modal */}
      {showCandidateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">
                {editingCandidate ? 'Edit Candidate & Interview' : 'Add Candidate to Pipeline'}
              </h3>
              <button type="button" onClick={closeCandidateModal} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveCandidate} className="mt-4 space-y-3 text-xs">
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
                      {j.title} ({j.status})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
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
                <div>
                  <label className="block font-bold text-slate-700">Current Company</label>
                  <input
                    type="text"
                    value={candForm.currentCompany}
                    onChange={(e) => setCandForm({ ...candForm, currentCompany: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
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
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700">Current CTC (INR)</label>
                  <input
                    type="number"
                    min="0"
                    value={candForm.currentCtc}
                    onChange={(e) => setCandForm({ ...candForm, currentCtc: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700">Expected CTC (INR)</label>
                  <input
                    type="number"
                    min="0"
                    value={candForm.expectedCtc}
                    onChange={(e) => setCandForm({ ...candForm, expectedCtc: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700">Notice Period (Days)</label>
                  <input
                    type="number"
                    min="0"
                    value={candForm.noticePeriodDays}
                    onChange={(e) => setCandForm({ ...candForm, noticePeriodDays: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <p className="text-[11px] font-bold text-slate-700">Interview Schedule (Optional)</p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="datetime-local"
                    value={candForm.interviewScheduledAt}
                    onChange={(e) => setCandForm({ ...candForm, interviewScheduledAt: e.target.value })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-white"
                  />
                  <select
                    value={candForm.interviewMode}
                    onChange={(e) => setCandForm({ ...candForm, interviewMode: e.target.value })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Video">Video</option>
                    <option value="In-Person">In-Person</option>
                    <option value="Phone">Phone</option>
                    <option value="Technical Round">Technical Round</option>
                    <option value="HR Round">HR Round</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Interviewer Name"
                    value={candForm.interviewerName}
                    onChange={(e) => setCandForm({ ...candForm, interviewerName: e.target.value })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-white"
                  />
                  <input
                    type="text"
                    placeholder="Meeting Link / Room"
                    value={candForm.meetingLink}
                    onChange={(e) => setCandForm({ ...candForm, meetingLink: e.target.value })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700">Notes</label>
                <textarea
                  rows={2}
                  value={candForm.notes}
                  onChange={(e) => setCandForm({ ...candForm, notes: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeCandidateModal}
                  className="px-3 py-1.5 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg font-bold"
                >
                  {editingCandidate ? 'Update Candidate' : 'Save Candidate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Convert Candidate to Employee Modal */}
      {convertingCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">
                Onboard {convertingCandidate.fullName} as Employee
              </h3>
              <button
                type="button"
                onClick={() => setConvertingCandidate(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleConvertCandidate} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700">Department *</label>
                <select
                  required
                  value={convertForm.departmentId}
                  onChange={(e) => setConvertForm({ ...convertForm, departmentId: e.target.value })}
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
                  <label className="block font-bold text-slate-700">Designation</label>
                  <select
                    value={convertForm.designationId}
                    onChange={(e) => setConvertForm({ ...convertForm, designationId: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">Optional</option>
                    {designations.map((d) => (
                      <option key={d._id} value={d._id}>
                        {d.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700">Branch</label>
                  <select
                    value={convertForm.branchId}
                    onChange={(e) => setConvertForm({ ...convertForm, branchId: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">Default / HQ</option>
                    {branches.map((b) => (
                      <option key={b._id} value={b._id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700">Joining Date *</label>
                  <input
                    type="date"
                    required
                    value={convertForm.joiningDate}
                    onChange={(e) => setConvertForm({ ...convertForm, joiningDate: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700">Probation (Months)</label>
                  <input
                    type="number"
                    min="0"
                    max="24"
                    value={convertForm.probationPeriodMonths}
                    onChange={(e) => setConvertForm({ ...convertForm, probationPeriodMonths: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700">Temporary Portal Password *</label>
                <input
                  type="text"
                  required
                  minLength={6}
                  value={convertForm.password}
                  onChange={(e) => setConvertForm({ ...convertForm, password: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setConvertingCandidate(null)}
                  className="px-3 py-1.5 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg font-bold"
                >
                  Confirm & Onboard
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

