import Document from '../../models/Document.js';
import Employee from '../../models/Employee.js';
import { ROLES } from '../../config/constants.js';
import { sendSuccess, sendError } from '../../utils/responseUtils.js';
import path from 'path';
import fs from 'fs';

export const getDocuments = async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const { employeeId, category } = req.query;

    const query = { tenantId };

    if (req.user.role === ROLES.EMPLOYEE) {
      const myEmp = await Employee.findOne({ tenantId, userId: req.user._id });
      // Employees see their own documents plus company-wide policy documents (employeeId: null)
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
      .populate('uploadedBy', 'name email')
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
      tenantId: req.tenantId,
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
    const doc = await Document.findOne({ _id: id, tenantId: req.tenantId });
    if (!doc) {
      return sendError(res, 'Document not found.', [], 404);
    }

    // Role check for employee
    if (req.user.role === ROLES.EMPLOYEE && doc.employeeId) {
      const myEmp = await Employee.findOne({ tenantId: req.tenantId, userId: req.user._id });
      if (!myEmp || doc.employeeId.toString() !== myEmp._id.toString()) {
        return sendError(res, 'Access denied.', [], 403);
      }
    }

    const filePath = path.resolve('uploads', doc.fileName);
    if (!fs.existsSync(filePath)) {
      return sendError(res, 'File physical asset missing from server.', [], 404);
    }

    return res.download(filePath, doc.title || doc.fileName);
  } catch (error) {
    next(error);
  }
};

