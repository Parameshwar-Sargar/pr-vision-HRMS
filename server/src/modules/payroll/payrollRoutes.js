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
import { enforceTenant } from '../../middleware/tenantMiddleware.js';
import { requireRoles } from '../../middleware/roleMiddleware.js';
import { ROLES } from '../../config/constants.js';

const router = Router();

router.use(authenticate, enforceTenant);

// Salary structures (Admin/HR)
router.get(
  '/structures/:employeeId',
  requireRoles(ROLES.COMPANY_ADMIN, ROLES.HR_MANAGER),
  getSalaryStructure
);
router.post(
  '/structures',
  requireRoles(ROLES.COMPANY_ADMIN, ROLES.HR_MANAGER),
  saveSalaryStructure
);

// Payroll runs (Admin/HR)
router.get(
  '/runs',
  requireRoles(ROLES.COMPANY_ADMIN, ROLES.HR_MANAGER),
  getPayrollRuns
);
router.post(
  '/runs/generate',
  requireRoles(ROLES.COMPANY_ADMIN, ROLES.HR_MANAGER),
  generatePayrollRun
);
router.patch(
  '/runs/:id/pay',
  requireRoles(ROLES.COMPANY_ADMIN, ROLES.HR_MANAGER),
  markPayrollPaid
);

// Payslips (Accessible by owner employee + HR/Admin)
router.get('/payslips', getPayslips);
router.get('/payslips/:id/pdf', downloadPayslipPDF);

export default router;

