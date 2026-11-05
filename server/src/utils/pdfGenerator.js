import PDFDocument from 'pdfkit';

/**
 * Generate PDF buffer for an employee payslip
 */
export const generatePayslipPDF = async ({ payslip, employee, tenant }) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      // Header Banner
      doc
        .fillColor('#1E3A8A')
        .fontSize(20)
        .font('Helvetica-Bold')
        .text(tenant?.name || 'PR VISION HRMS', 40, 40);

      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#64748B')
        .text('PR VISION INNOVATIONS SaaS Platform', 40, 65)
        .text(`${tenant?.address?.city || ''} ${tenant?.address?.state || ''} ${tenant?.address?.country || 'India'}`)
        .text(`Email: ${tenant?.contactEmail || 'hr@prvision.com'}`);

      doc
        .fillColor('#2563EB')
        .fontSize(14)
        .font('Helvetica-Bold')
        .text('MONTHLY PAYSLIP', 400, 40, { align: 'right' });

      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#334155')
        .text(`Payslip #: ${payslip.payslipNumber}`, 400, 60, { align: 'right' })
        .text(`Month / Year: ${payslip.month} / ${payslip.year}`, 400, 75, { align: 'right' })
        .text(`Status: ${payslip.paymentStatus}`, 400, 90, { align: 'right' });

      // Horizontal Divider
      doc.moveTo(40, 115).lineTo(555, 115).strokeColor('#E2E8F0').lineWidth(1).stroke();

      // Employee Information Box
      let y = 130;
      doc.rect(40, y, 515, 65).fillColor('#F8FAFC').fill();
      doc.rect(40, y, 515, 65).strokeColor('#E2E8F0').stroke();

      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(10);
      doc.text(`Employee Name: ${employee?.firstName || ''} ${employee?.lastName || ''}`, 55, y + 12);
      doc.text(`Employee Code: ${employee?.employeeId || 'N/A'}`, 55, y + 28);
      doc.text(`Department: ${employee?.departmentId?.name || 'General'}`, 55, y + 44);

      doc.text(`Designation: ${employee?.designationId?.title || 'Team Member'}`, 300, y + 12);
      doc.text(`Bank Account: ${employee?.bankDetails?.accountNumber ? '••••' + employee.bankDetails.accountNumber.slice(-4) : 'N/A'}`, 300, y + 28);
      doc.text(`Days Worked: ${payslip.presentDays} / ${payslip.workingDays}`, 300, y + 44);

      // Earnings & Deductions Tables
      y = 215;
      const colWidth = 250;

      // Earnings Header
      doc.rect(40, y, colWidth, 24).fillColor('#2563EB').fill();
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10).text('EARNINGS', 50, y + 7);
      doc.text('AMOUNT (INR)', 210, y + 7);

      // Deductions Header
      doc.rect(305, y, colWidth, 24).fillColor('#DC2626').fill();
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10).text('DEDUCTIONS', 315, y + 7);
      doc.text('AMOUNT (INR)', 475, y + 7);

      y += 28;
      const startTableY = y;

      // Render Earnings
      let earY = startTableY;
      doc.fillColor('#0F172A').font('Helvetica').fontSize(9);
      doc.text('Basic Salary', 50, earY);
      doc.text(`₹ ${payslip.basicSalary.toLocaleString('en-IN')}`, 210, earY);
      earY += 20;

      for (const earn of payslip.earnings || []) {
        doc.text(earn.name, 50, earY);
        doc.text(`₹ ${earn.amount.toLocaleString('en-IN')}`, 210, earY);
        earY += 20;
      }

      // Render Deductions
      let dedY = startTableY;
      for (const ded of payslip.deductions || []) {
        doc.text(ded.name, 315, dedY);
        doc.text(`₹ ${ded.amount.toLocaleString('en-IN')}`, 475, dedY);
        dedY += 20;
      }

      const maxY = Math.max(earY, dedY, startTableY + 80);

      // Subtotals
      doc.moveTo(40, maxY + 5).lineTo(290, maxY + 5).strokeColor('#E2E8F0').stroke();
      doc.moveTo(305, maxY + 5).lineTo(555, maxY + 5).strokeColor('#E2E8F0').stroke();

      doc.font('Helvetica-Bold').fontSize(10).fillColor('#0F172A');
      doc.text('Gross Earnings', 50, maxY + 12);
      doc.text(`₹ ${payslip.grossSalary.toLocaleString('en-IN')}`, 210, maxY + 12);

      doc.text('Total Deductions', 315, maxY + 12);
      doc.text(`₹ ${payslip.totalDeductions.toLocaleString('en-IN')}`, 475, maxY + 12);

      // Net Salary Highlight Box
      const netY = maxY + 40;
      doc.rect(40, netY, 515, 45).fillColor('#EFF6FF').fill();
      doc.rect(40, netY, 515, 45).strokeColor('#93C5FD').lineWidth(1.5).stroke();

      doc.fillColor('#1E3A8A').font('Helvetica-Bold').fontSize(12);
      doc.text('NET TAKE-HOME SALARY:', 55, netY + 16);
      doc.fontSize(14).fillColor('#2563EB').text(`₹ ${payslip.netSalary.toLocaleString('en-IN')}`, 350, netY + 15, { align: 'right' });

      // Footer Notes
      const footerY = 720;
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#94A3B8')
        .text('This is a computer-generated payslip authorized by PR VISION HRMS SaaS Platform. No physical signature required.', 40, footerY, { align: 'center', width: 515 })
        .text('Statutory contributions (PF/ESI/PT) subject to regulatory rules as verified by employer.', 40, footerY + 14, { align: 'center', width: 515 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

