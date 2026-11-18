import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import api, { downloadAuthenticatedFile } from '../../services/api';
import useEmployeeOptions from '../../hooks/useEmployeeOptions';
import EmployeeOptionPicker from '../../components/common/EmployeeOptionPicker';
import toast from 'react-hot-toast';
import { FileText, Upload, Download, Trash2, X } from 'lucide-react';

const DOCUMENT_CATEGORIES = [
  'Company Policy',
  'Offer Letter',
  'Appointment Letter',
  'ID Proof',
  'Certificate',
  'Tax Document',
  'Experience Letter',
  'Relieving Letter',
  'Payslip Archive',
  'Other',
];

const MIME_TO_EXT = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'text/csv': 'csv',
  'application/csv': 'csv',
};

const getDownloadFilename = (doc) => {
  const fileExtMatch = doc.fileName?.match(/\.([a-zA-Z0-9]+)$/);
  const ext = fileExtMatch?.[1] || MIME_TO_EXT[doc.mimeType] || 'pdf';
  const baseTitle = (doc.title || 'document').replace(/\.[^/.]+$/, '');
  return `${baseTitle}.${ext}`;
};

export default function DocumentsPage() {
  const { user } = useSelector((state) => state.auth);
  const canManage = ['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER'].includes(user?.role);

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Company Policy');
  const [targetEmployeeId, setTargetEmployeeId] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const empOptions = useEmployeeOptions({
    enabled: Boolean(showUploadModal && canManage),
    limit: 20,
  });

  useEffect(() => {
    const controller = new AbortController();
    fetchDocuments(controller.signal);
    return () => controller.abort();
  }, [categoryFilter]);

  const fetchDocuments = async (signal = null) => {
    try {
      setLoading(true);
      const params = {};
      if (categoryFilter) params.category = categoryFilter;
      const res = await api.get('/documents', { params, signal, cacheTtl: 15000 });
      setDocuments(res.data?.documents || res.documents || []);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      toast.error(err.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadDocument = async (doc) => {
    try {
      toast.loading(`Downloading "${doc.title}"...`, { id: 'doc-dl' });
      const url = `/documents/${doc._id}/download`;
      await downloadAuthenticatedFile(url, getDownloadFilename(doc));
      toast.success('Download complete!', { id: 'doc-dl' });
    } catch (err) {
      toast.error(err.message || 'Download failed', { id: 'doc-dl' });
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      toast.error('Please select a file to upload');
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('category', category);
      if (canManage && targetEmployeeId) {
        formData.append('employeeId', targetEmployeeId);
      }
      formData.append('file', file);

      await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      toast.success('Document uploaded successfully!');
      setShowUploadModal(false);
      setTitle('');
      setTargetEmployeeId('');
      setFile(null);
      empOptions.clearSearch();
      fetchDocuments();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDocument = async (doc) => {
    if (!window.confirm(`Delete document "${doc.title}"?`)) return;
    try {
      await api.delete(`/documents/${doc._id}`);
      setDocuments((prev) => prev.filter((d) => d._id !== doc._id));
      toast.success('Document deleted.');
      fetchDocuments();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to delete document');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Document Repository</h2>
          <p className="text-xs text-slate-500">Corporate policies, letters, employee records & forms</p>
        </div>

        <button
          onClick={() => setShowUploadModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm shadow-blue-200"
        >
          <Upload className="w-4 h-4" />
          <span>Upload Document</span>
        </button>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-2">
        {['', 'Company Policy', 'Offer Letter', 'Appointment Letter', 'ID Proof', 'Tax Document', 'Certificate', 'Other'].map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              categoryFilter === cat
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {cat || 'All Documents'}
          </button>
        ))}
      </div>

      {/* Document Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading ? (
          <div className="p-8 text-center col-span-3">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
        ) : documents.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 col-span-3 bg-white rounded-2xl border border-slate-200">
            No documents in this category.
          </div>
        ) : (
          documents.map((doc) => (
            <div
              key={doc._id}
              className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <span className="p-2.5 rounded-xl bg-blue-50 text-blue-600 mb-2">
                    <FileText className="w-5 h-5" />
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600">
                      {doc.category}
                    </span>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => handleDeleteDocument(doc)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded"
                        title="Delete Document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <h3 className="text-sm font-bold text-slate-900 mt-2">{doc.title}</h3>
                <p className="text-[11px] text-slate-500 mt-1">
                  {doc.employeeId
                    ? `Employee: ${doc.employeeId.firstName} ${doc.employeeId.lastName} (${doc.employeeId.employeeId})`
                    : 'Scope: Company-Wide Shared'}
                </p>
                <p className="text-[11px] text-slate-400 font-mono mt-1">
                  Size: {((doc.fileSize || 0) / 1024).toFixed(1)} KB
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  {new Date(doc.createdAt).toLocaleDateString()}
                </span>
                <button
                  type="button"
                  onClick={() => handleDownloadDocument(doc)}
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-bold"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Upload New File</h3>
              <button onClick={() => setShowUploadModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpload} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700">Document Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Employee Code of Conduct 2026"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700">Category *</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {DOCUMENT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              {canManage && (
                <EmployeeOptionPicker
                  mode="single"
                  label="Assign to Employee (Optional)"
                  emptyOptionLabel="Company-Wide Policy / Shared Document"
                  value={targetEmployeeId}
                  onChange={setTargetEmployeeId}
                  employeeOptions={empOptions}
                />
              )}
              <div>
                <label className="block font-bold text-slate-700">Select File *</label>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.csv"
                  required
                  onChange={(e) => setFile(e.target.files[0])}
                  className="mt-1 block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-3 py-1.5 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg font-bold disabled:opacity-50"
                >
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

