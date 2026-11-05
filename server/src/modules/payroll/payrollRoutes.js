import { Router } from 'express';
import {
  getSalaryStructure,
  saveSalaryStructure,
  generatePayrollRun,
  getPayrollRuns,
  markPayrollPaid,
  getPayslips,
  downloadPayslipPDF,
} from './payrollController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { requireRoles } from '../../middleware/roleMiddleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate);

// Salary structures (Admin/HR/Payroll)
router.get(
  '/structures/:employeeId',
  requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.PAYROLL_ADMIN),
  getSalaryStructure
);
router.post(
  '/structures',
  requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.PAYROLL_ADMIN),
  saveSalaryStructure
);

// Payroll runs (Admin/HR/Payroll)
router.get(
  '/runs',
  requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.PAYROLL_ADMIN),
  getPayrollRuns
);
router.post(
  '/runs/generate',
  requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.PAYROLL_ADMIN),
  generatePayrollRun
);
router.patch(
  '/runs/:id/pay',
  requireRoles(ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.PAYROLL_ADMIN),
  markPayrollPaid
);

// Payslips (Employees see own; Admin/HR/Payroll see all)
router.get('/payslips', getPayslips);
router.get('/payslips/:id/pdf', downloadPayslipPDF);

export default router;
