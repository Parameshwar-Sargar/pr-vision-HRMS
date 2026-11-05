import Announcement from '../../models/Announcement.js';
import { ROLES } from '../../config/constants.js';
import { sendSuccess, sendError } from '../../utils/responseUtils.js';

export const getAnnouncements = async (req, res, next) => {
  try {
    const { branchId, priority } = req.query;
    const query = { isActive: true };

    if (priority) query.priority = priority;
    if (branchId) {
      query.$or = [{ targetBranchId: null }, { targetBranchId: branchId }];
    }

    const announcements = await Announcement.find(query)
      .populate('publishedBy', 'name email')
      .populate('targetBranchId', 'name code')
      .populate('targetDepartmentId', 'name')
      .sort({ isPinned: -1, createdAt: -1 });

    return sendSuccess(res, 'Announcements retrieved.', { announcements });
  } catch (error) {
    next(error);
  }
};

export const createAnnouncement = async (req, res, next) => {
  try {
    const { title, content, priority, category, targetBranchId, targetDepartmentId, isPinned, expiresAt } = req.body;

    const announcement = await Announcement.create({
      title,
      content,
      priority: priority || 'Normal',
      category: category || 'General',
      publishedBy: req.user._id,
      targetBranchId: targetBranchId || null,
      targetDepartmentId: targetDepartmentId || null,
      isPinned: isPinned || false,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });

    return sendSuccess(res, 'Announcement broadcasted successfully.', { announcement }, 201);
  } catch (error) {
    next(error);
  }
};

export const deleteAnnouncement = async (req, res, next) => {
  try {
    const { id } = req.params;
    const item = await Announcement.findById(id);
    if (!item) return sendError(res, 'Announcement not found.', [], 404);

    item.isActive = false;
    await item.save();

    return sendSuccess(res, 'Announcement archived.');
  } catch (error) {
    next(error);
  }
};
