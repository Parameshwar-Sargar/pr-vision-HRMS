import Document from '../../models/Document.js';
import Employee from '../../models/Employee.js';
import { ROLES } from '../../config/constants.js';
import { sendSuccess, sendError, parsePagination, buildPaginationMeta } from '../../utils/responseUtils.js';
import {
  isAdminOrHR,
  isValidObjectId,
  resolveSafeUploadPath,
  safeDeleteFile,
  sanitizeDownloadFilename,
  validateUploadedFileMagicBytes,
} from '../../utils/securityUtils.js';
import fs from 'fs';

export const getDocuments = async (req, res, next) => {
  try {
    const { employeeId, category } = req.query;
    const query = {};
    const adminOrHR = isAdminOrHR(req.user.role);

    if (req.user.role === ROLES.MANAGER) {
      if (!req.verifiedEmployeeId) {
        if (employeeId) {
          return sendError(res, 'Access denied: No manager employee profile found.', [], 403);
        }
        query.employeeId = null;
      } else {
        const teamEmployees = await Employee.find({
          managerId: req.verifiedEmployeeId,
          isDeleted: false,
        })
          .select('_id')
          .lean();
        const allowedIds = [...teamEmployees.map((t) => t._id), req.verifiedEmployeeId];
        if (employeeId) {
          if (!allowedIds.some((id) => id.toString() === String(employeeId))) {
            return sendError(
              res,
              'Access denied: You can only view documents for yourself or your direct reporting team.',
              [],
              403
            );
          }
          query.employeeId = employeeId;
        } else {
          query.$or = [{ employeeId: { $in: allowedIds } }, { employeeId: null }];
        }
      }
    } else if (!adminOrHR) {
      if (employeeId && (!req.verifiedEmployeeId || String(employeeId) !== req.verifiedEmployeeId.toString())) {
        return sendError(res, "Access denied: You cannot view another employee's documents.", [], 403);
      }
      if (!req.verifiedEmployeeId) {
        query.employeeId = null; // shared company docs only
      } else {
        query.$or = [{ employeeId: req.verifiedEmployeeId }, { employeeId: null }];
      }
    } else if (employeeId) {
      if (!isValidObjectId(employeeId)) {
        return sendError(res, 'Invalid employee ID format.', [], 400);
      }
      query.employeeId = employeeId;
    }

    if (category) query.category = category;

    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });

    const [documents, total] = await Promise.all([
      Document.find(query)
        .populate('employeeId', 'firstName lastName employeeId')
        .populate('uploadedBy', 'email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Document.countDocuments(query),
    ]);

    return sendSuccess(res, 'Documents retrieved.', {
      documents,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

export const uploadDocument = async (req, res, next) => {
  const uploadedPath = req.file?.path;
  try {
    if (!req.file) {
      return sendError(res, 'No file was uploaded.', [], 400);
    }

    // Verify true file content via magic-byte header signature check
    const magicCheck = validateUploadedFileMagicBytes(
      req.file.path,
      req.file.mimetype,
      req.file.originalname
    );
    if (!magicCheck.valid) {
      safeDeleteFile(uploadedPath);
      return sendError(res, magicCheck.reason || 'Invalid or unsafe uploaded file content.', [], 400);
    }

    const { title, category, employeeId } = req.body;
    const adminOrHR = isAdminOrHR(req.user.role);

    // Ownership check on document upload: Non-Admin/HR can only upload documents for themselves
    let targetEmployeeId = null;
    if (adminOrHR) {
      if (employeeId) {
        if (!isValidObjectId(employeeId)) {
          safeDeleteFile(uploadedPath);
          return sendError(res, 'Invalid employee ID format.', [], 400);
        }
        const targetEmp = await Employee.findOne({ _id: employeeId, isDeleted: false })
          .select('_id')
          .lean();
        if (!targetEmp) {
          safeDeleteFile(uploadedPath);
          return sendError(res, 'Target employee not found.', [], 404);
        }
        targetEmployeeId = targetEmp._id;
      }
    } else {
      if (!req.verifiedEmployeeId) {
        safeDeleteFile(uploadedPath);
        return sendError(res, 'Access denied: No active employee profile linked to your account.', [], 403);
      }
      if (employeeId && String(employeeId) !== req.verifiedEmployeeId.toString()) {
        safeDeleteFile(uploadedPath);
        return sendError(res, 'Access denied: You can only upload documents for your own profile.', [], 403);
      }
      targetEmployeeId = req.verifiedEmployeeId;
    }

    const doc = await Document.create({
      employeeId: targetEmployeeId,
      title: title || req.file.originalname,
      category: category || 'Other',
      fileName: req.file.filename,
      fileUrl: '/api/v1/documents/pending/download',
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      uploadedBy: req.user._id,
    });

    doc.fileUrl = `/api/v1/documents/${doc._id}/download`;
    await doc.save();

    return sendSuccess(res, 'Document uploaded successfully.', { document: doc }, 201);
  } catch (error) {
    safeDeleteFile(uploadedPath);
    next(error);
  }
};

export const downloadDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid document ID format.', [], 400);
    }

    const doc = await Document.findById(id).lean();
    if (!doc) {
      return sendError(res, 'Document not found.', [], 404);
    }

    // Role verification for private employee documents
    if (doc.employeeId) {
      const isOwner = req.verifiedEmployeeId && doc.employeeId.toString() === req.verifiedEmployeeId.toString();
      const adminOrHR = isAdminOrHR(req.user.role);

      if (!adminOrHR && !isOwner) {
        if (req.user.role === ROLES.MANAGER && req.verifiedEmployeeId) {
          const targetEmp = await Employee.findOne({
            _id: doc.employeeId,
            managerId: req.verifiedEmployeeId,
            isDeleted: false,
          })
            .select('_id')
            .lean();
          if (!targetEmp) {
            return sendError(
              res,
              'Access denied: This document belongs to an employee outside your direct reporting line.',
              [],
              403
            );
          }
        } else {
          return sendError(res, "Access denied: You cannot download another employee's private document.", [], 403);
        }
      }
    }

    const filePath = resolveSafeUploadPath(doc.fileName);
    if (!filePath) {
      return sendError(res, 'Access denied: Path traversal detected.', [], 403);
    }

    if (fs.existsSync(filePath)) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-store');
      const safeName = sanitizeDownloadFilename(doc.title || doc.fileName, 'document');
      return res.download(filePath, safeName);
    }
    return sendError(res, 'File not found on server.', [], 404);
  } catch (error) {
    next(error);
  }
};

export const deleteDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid document ID format.', [], 400);
    }

    const doc = await Document.findById(id);
    if (!doc) {
      return sendError(res, 'Document not found.', [], 404);
    }

    if (!isAdminOrHR(req.user.role)) {
      return sendError(res, 'Access denied: Only HR Manager or Admin can delete documents.', [], 403);
    }

    const filePath = resolveSafeUploadPath(doc.fileName);
    if (filePath && fs.existsSync(filePath)) {
      safeDeleteFile(filePath);
    }

    await Document.findByIdAndDelete(id);
    return sendSuccess(res, 'Document deleted successfully.');
  } catch (error) {
    next(error);
  }
};
