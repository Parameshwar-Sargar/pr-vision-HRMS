import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Employee from '../models/Employee.js';

dotenv.config({ path: '.env' });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB Atlas pr_vision_hrms');

  const users = await User.find({});
  const employees = await Employee.find({ isDeleted: false });

  console.log(`Users: ${users.length}, Employees: ${employees.length}`);

  for (const u of users) {
    const linkedEmp = employees.find(
      (e) => e.userId && e.userId.toString() === u._id.toString()
    );
    console.log(
      `User: ${u.email.padEnd(25)} | Role: ${u.role.padEnd(14)} | user.employeeId: ${
        u.employeeId || 'null'
      } | Matched: ${linkedEmp ? `${linkedEmp.firstName} ${linkedEmp.lastName} (${linkedEmp._id})` : 'None'}`
    );

    if (linkedEmp && (!u.employeeId || u.employeeId.toString() !== linkedEmp._id.toString())) {
      console.log(`  ==> Linking user ${u.email} to employee ${linkedEmp._id}`);
      u.employeeId = linkedEmp._id;
      await u.save();
    }
  }

  // Also ensure Employee has userId linked back
  for (const e of employees) {
    if (!e.userId) {
      const matchedUser = users.find((u) => u.email.toLowerCase() === e.email.toLowerCase());
      if (matchedUser) {
        console.log(`  ==> Linking employee ${e.firstName} ${e.lastName} to user ${matchedUser.email}`);
        e.userId = matchedUser._id;
        await e.save();
      }
    }
  }

  console.log('User-Employee linkage audit complete.');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

