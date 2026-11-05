import Document from '../../models/Document.js';
import Employee from '../../models/Employee.js';
import { ROLES } from '../../config/constants.js';
import { sendSuccess, sendError } from '../../utils/responseUtils.js';
import path from 'path';
import fs from 'fs';

export const getDocuments = async (req, res, next) => {
  try {
    const { employeeId, category } = req.query;
    const query = {};

    if (req.user.role === ROLES.EMPLOYEE) {
      const myEmp = await Employee.findOne({ userId: req.user._id, isDeleted: false });
      query.$or = [
        { employeeId: myEmp ? myEmp._id : null },
        { employeeId: null },
      ];
    } else if (employeeId) {
      query.employeeId = employeeId;
    }

    if (category) query.category = category;

    const documents = await Document.find(query)
      .populate('employeeId', 'firstName lastName employeeId')
      .populate('uploadedBy', 'email')
      .sort({ createdAt: -1 });

    return sendSuccess(res, 'Documents retrieved.', { documents });
  } catch (error) {
    next(error);
  }
};

export const uploadDocument = async (req, res, next) => {
  try {
    if (!req.file) {
      return sendError(res, 'No file was uploaded.', [], 400);
    }

    const { title, category, employeeId } = req.body;

    const doc = await Document.create({
      employeeId: employeeId || null,
      title: title || req.file.originalname,
      category: category || 'Other',
      fileName: req.file.filename,
      fileUrl: `/uploads/${req.file.filename}`,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      uploadedBy: req.user._id,
    });

    return sendSuccess(res, 'Document uploaded successfully.', { document: doc }, 201);
  } catch (error) {
    next(error);
  }
};

export const downloadDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const doc = await Document.findById(id);
    if (!doc) {
      return sendError(res, 'Document not found.', [], 404);
    }

    const filePath = path.join(process.cwd(), 'uploads', doc.fileName);
    if (fs.existsSync(filePath)) {
      return res.download(filePath, doc.title || doc.fileName);
    }
    return sendError(res, 'File not found on server.', [], 404);
  } catch (error) {
    next(error);
  }
};

export const deleteDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const doc = await Document.findById(id);

    if (!doc) {
      return sendError(res, 'Document not found.', [], 404);
    }

    const filePath = path.join(process.cwd(), 'uploads', doc.fileName);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        console.error('File cleanup error:', e);
      }
    }

    await Document.findByIdAndDelete(id);
    return sendSuccess(res, 'Document deleted successfully.');
  } catch (error) {
    next(error);
  }
};
