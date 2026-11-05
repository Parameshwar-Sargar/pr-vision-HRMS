import Notification from '../../models/Notification.js';
import { sendSuccess } from '../../utils/responseUtils.js';

export const getNotifications = async (req, res, next) => {
  try {
    const notifications = await Notification.find({
      recipientId: req.user._id,
    })
      .sort({ createdAt: -1 })
      .limit(30);

    const unreadCount = await Notification.countDocuments({
      recipientId: req.user._id,
      isRead: false,
    });

    return sendSuccess(res, 'Notifications retrieved.', { notifications, unreadCount });
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

