import { z } from 'zod';
import Announcement from '../../models/Announcement.js';
import { isAdminOrHR, isValidObjectId } from '../../utils/securityUtils.js';
import { sendSuccess, sendError, parsePagination, buildPaginationMeta } from '../../utils/responseUtils.js';

const ANNOUNCEMENT_CATEGORIES = [
  'Company News',
  'HR Policy Update',
  'Holiday Notice',
  'Team Event',
  'Urgent Alert',
  'Company Update',
  'Events',
];

const ANNOUNCEMENT_PRIORITIES = ['Normal', 'Important', 'Critical', 'High', 'Low'];

const baseAnnouncementSchema = z.object({
  title: z.string().trim().min(2, 'Announcement title must be at least 2 characters').max(200),
  message: z.string().trim().min(2, 'Announcement content is required').max(5000).optional(),
  content: z.string().trim().min(2, 'Announcement content is required').max(5000).optional(),
  priority: z.enum(ANNOUNCEMENT_PRIORITIES).optional().default('Normal'),
  category: z.enum(ANNOUNCEMENT_CATEGORIES).optional().default('Company News'),
  targetBranchId: z.string().nullable().optional(),
  targetDepartmentId: z.string().nullable().optional(),
  isPinned: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  expiresAt: z.string().nullable().optional(),
});

const serializeAnnouncement = (doc) => {
  const plain = typeof doc?.toObject === 'function' ? doc.toObject() : { ...doc };
  return {
    ...plain,
    message: plain.message ?? plain.content ?? '',
    content: plain.content ?? plain.message ?? '',
  };
};

export const getAnnouncements = async (req, res, next) => {
  try {
    const { branchId, departmentId, priority, category, includeInactive } = req.query;
    const isPrivileged = isAdminOrHR(req.user.role);
    const now = new Date();
    const andConditions = [];

    if (!(isPrivileged && includeInactive === 'true')) {
      andConditions.push({ isActive: true });
      andConditions.push({ $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] });
    }

    if (priority) andConditions.push({ priority });
    if (category) andConditions.push({ category });

    if (isPrivileged) {
      if (branchId && isValidObjectId(branchId)) {
        andConditions.push({ $or: [{ targetBranchId: null }, { targetBranchId: branchId }] });
      }
      if (departmentId && isValidObjectId(departmentId)) {
        andConditions.push({ $or: [{ targetDepartmentId: null }, { targetDepartmentId: departmentId }] });
      }
    } else {
      // Non-Admin/HR employees only see org-wide or notices targeting their own branch/department
      const empBranchId = req.employee?.branchId || null;
      const empDeptId = req.employee?.departmentId || null;

      if (empBranchId) {
        andConditions.push({ $or: [{ targetBranchId: null }, { targetBranchId: empBranchId }] });
      } else {
        andConditions.push({ targetBranchId: null });
      }

      if (empDeptId) {
        andConditions.push({ $or: [{ targetDepartmentId: null }, { targetDepartmentId: empDeptId }] });
      } else {
        andConditions.push({ targetDepartmentId: null });
      }
    }

    const query = andConditions.length > 0 ? { $and: andConditions } : {};
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });

    const [rawAnnouncements, total] = await Promise.all([
      Announcement.find(query)
        .populate('publishedBy', 'name email')
        .populate('targetBranchId', 'name code')
        .populate('targetDepartmentId', 'name')
        .sort({ isPinned: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Announcement.countDocuments(query),
    ]);

    const announcements = rawAnnouncements.map(serializeAnnouncement);

    return sendSuccess(res, 'Announcements retrieved.', {
      announcements,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

export const createAnnouncement = async (req, res, next) => {
  try {
    const parsed = baseAnnouncementSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 'Validation failed.', parsed.error.flatten().fieldErrors, 400);
    }

    const data = parsed.data;
    const messageBody = (data.message ?? data.content ?? '').trim();
    if (messageBody.length < 2) {
      return sendError(res, 'Announcement message/content must be at least 2 characters.', [], 400);
    }

    if (data.targetBranchId && !isValidObjectId(data.targetBranchId)) {
      return sendError(res, 'Invalid target branch ID.', [], 400);
    }
    if (data.targetDepartmentId && !isValidObjectId(data.targetDepartmentId)) {
      return sendError(res, 'Invalid target department ID.', [], 400);
    }

    let parsedExpiresAt = null;
    if (data.expiresAt) {
      parsedExpiresAt = new Date(data.expiresAt);
      if (Number.isNaN(parsedExpiresAt.getTime())) {
        return sendError(res, 'Invalid expiration date.', [], 400);
      }
    }

    const created = await Announcement.create({
      title: data.title,
      message: messageBody,
      priority: data.priority,
      category: data.category,
      publishedBy: req.user._id,
      targetBranchId: data.targetBranchId || null,
      targetDepartmentId: data.targetDepartmentId || null,
      isPinned: !!data.isPinned,
      isActive: data.isActive ?? true,
      expiresAt: parsedExpiresAt,
    });

    const populated = await Announcement.findById(created._id)
      .populate('publishedBy', 'name email')
      .populate('targetBranchId', 'name code')
      .populate('targetDepartmentId', 'name')
      .lean();

    return sendSuccess(
      res,
      'Announcement broadcasted successfully.',
      { announcement: serializeAnnouncement(populated) },
      201
    );
  } catch (error) {
    next(error);
  }
};

export const updateAnnouncement = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid announcement ID.', [], 400);
    }

    const updateSchema = baseAnnouncementSchema.partial();
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 'Validation failed.', parsed.error.flatten().fieldErrors, 400);
    }

    const announcement = await Announcement.findById(id);
    if (!announcement) {
      return sendError(res, 'Announcement not found.', [], 404);
    }

    const data = parsed.data;
    if (data.title !== undefined) announcement.title = data.title;
    if (data.message !== undefined || data.content !== undefined) {
      const nextMsg = (data.message ?? data.content ?? '').trim();
      if (nextMsg.length < 2) {
        return sendError(res, 'Announcement message/content must be at least 2 characters.', [], 400);
      }
      announcement.message = nextMsg;
    }
    if (data.category !== undefined) announcement.category = data.category;
    if (data.priority !== undefined) announcement.priority = data.priority;
    if (data.isPinned !== undefined) announcement.isPinned = data.isPinned;
    if (data.isActive !== undefined) announcement.isActive = data.isActive;

    if (data.targetBranchId !== undefined) {
      if (data.targetBranchId && !isValidObjectId(data.targetBranchId)) {
        return sendError(res, 'Invalid target branch ID.', [], 400);
      }
      announcement.targetBranchId = data.targetBranchId || null;
    }
    if (data.targetDepartmentId !== undefined) {
      if (data.targetDepartmentId && !isValidObjectId(data.targetDepartmentId)) {
        return sendError(res, 'Invalid target department ID.', [], 400);
      }
      announcement.targetDepartmentId = data.targetDepartmentId || null;
    }
    if (data.expiresAt !== undefined) {
      if (data.expiresAt === null || data.expiresAt === '') {
        announcement.expiresAt = null;
      } else {
        const parsedExp = new Date(data.expiresAt);
        if (Number.isNaN(parsedExp.getTime())) {
          return sendError(res, 'Invalid expiration date.', [], 400);
        }
        announcement.expiresAt = parsedExp;
      }
    }

    await announcement.save();

    const populated = await Announcement.findById(announcement._id)
      .populate('publishedBy', 'name email')
      .populate('targetBranchId', 'name code')
      .populate('targetDepartmentId', 'name')
      .lean();

    return sendSuccess(res, 'Announcement updated successfully.', {
      announcement: serializeAnnouncement(populated),
    });
  } catch (error) {
    next(error);
  }
};

export const deleteAnnouncement = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid announcement ID.', [], 400);
    }
    const item = await Announcement.findById(id);
    if (!item) return sendError(res, 'Announcement not found.', [], 404);

    item.isActive = false;
    await item.save();

    return sendSuccess(res, 'Announcement archived.');
  } catch (error) {
    next(error);
  }
};

