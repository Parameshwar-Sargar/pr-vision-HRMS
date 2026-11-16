import Notification from '../../models/Notification.js';
import { sendSuccess, parsePagination, buildPaginationMeta } from '../../utils/responseUtils.js';

export const getNotifications = async (req, res, next) => {
  try {
    const query = { recipientId: req.user._id };
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 30, maxLimit: 100 });

    const [notifications, unreadCount, total] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments({
        recipientId: req.user._id,
        isRead: false,
      }),
      Notification.countDocuments(query),
    ]);

    return sendSuccess(res, 'Notifications retrieved.', {
      notifications,
      unreadCount,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

export const markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    await Notification.findOneAndUpdate({ _id: id, recipientId: req.user._id }, { isRead: true });
    return sendSuccess(res, 'Notification marked as read.');
  } catch (error) {
    next(error);
  }
};

export const markAllAsRead = async (req, res, next) => {
  try {
    await Notification.updateMany({ recipientId: req.user._id, isRead: false }, { isRead: true });
    return sendSuccess(res, 'All notifications marked as read.');
  } catch (error) {
    next(error);
  }
};

