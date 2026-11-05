import { Router } from 'express';
import authRoutes from '../modules/auth/authRoutes.js';
import superAdminRoutes from '../modules/superAdmin/superAdminRoutes.js';
import tenantRoutes from '../modules/tenants/tenantRoutes.js';
import dashboardRoutes from '../modules/dashboard/dashboardRoutes.js';
import employeeRoutes from '../modules/employees/employeeRoutes.js';
import departmentRoutes from '../modules/departments/departmentRoutes.js';
import designationRoutes from '../modules/designations/designationRoutes.js';
import attendanceRoutes from '../modules/attendance/attendanceRoutes.js';
import shiftRoutes from '../modules/shifts/shiftRoutes.js';
import leaveRoutes from '../modules/leaves/leaveRoutes.js';
import holidayRoutes from '../modules/holidays/holidayRoutes.js';
import payrollRoutes from '../modules/payroll/payrollRoutes.js';
import recruitmentRoutes from '../modules/recruitment/recruitmentRoutes.js';
import performanceRoutes from '../modules/performance/performanceRoutes.js';
import documentRoutes from '../modules/documents/documentRoutes.js';
import notificationRoutes from '../modules/notifications/notificationRoutes.js';
import reportRoutes from '../modules/reports/reportRoutes.js';
import subscriptionRoutes from '../modules/subscriptions/subscriptionRoutes.js';

const router = Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'PR VISION HRMS API Gateway',
    version: '1.0.0',
  });
});

router.use('/auth', authRoutes);
router.use('/super-admin', superAdminRoutes);
router.use('/tenants', tenantRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/employees', employeeRoutes);
router.use('/departments', departmentRoutes);
router.use('/designations', designationRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/shifts', shiftRoutes);
router.use('/leaves', leaveRoutes);
router.use('/holidays', holidayRoutes);
router.use('/payroll', payrollRoutes);
router.use('/recruitment', recruitmentRoutes);
router.use('/performance', performanceRoutes);
router.use('/documents', documentRoutes);
router.use('/notifications', notificationRoutes);
router.use('/reports', reportRoutes);
router.use('/subscriptions', subscriptionRoutes);

export default router;

