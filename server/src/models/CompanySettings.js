import mongoose from 'mongoose';

const companySettingsSchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      required: true,
      default: 'PR VISION INNOVATIONS',
      trim: true,
    },
    tagline: {
      type: String,
      default: 'People. Process. Performance.',
    },
    logo: {
      type: String,
      default: '',
    },
    favicon: {
      type: String,
      default: '',
    },
    primaryColor: {
      type: String,
      default: '#2563EB',
    },
    contactEmail: {
      type: String,
      required: true,
      default: 'contact@prvision.com',
    },
    contactPhone: {
      type: String,
      default: '+91 9876543210',
    },
    website: {
      type: String,
      default: 'https://prvision.com',
    },
    address: {
      street: { type: String, default: 'Tech Park Blvd, Suite 400' },
      city: { type: String, default: 'Bengaluru' },
      state: { type: String, default: 'Karnataka' },
      country: { type: String, default: 'India' },
      postalCode: { type: String, default: '560001' },
    },
    businessInfo: {
      taxId: { type: String, default: 'GSTIN29AAACP1234F1Z5' }, // GSTIN
      registrationNumber: { type: String, default: 'CIN-U72200KA2024PTC189000' }, // CIN
      panNumber: { type: String, default: 'AAACP1234F' },
      industry: { type: String, default: 'Software & Technology' },
    },
    settings: {
      timezone: { type: String, default: 'Asia/Kolkata' },
      currency: { type: String, default: 'INR' },
      currencySymbol: { type: String, default: '₹' },
      dateFormat: { type: String, default: 'DD/MM/YYYY' },
      workingDays: {
        type: [String],
        default: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      },
      standardWorkHoursPerDay: { type: Number, default: 8 },
    },
    modules: {
      recruitment: { type: Boolean, default: true },
      training: { type: Boolean, default: true },
      expenses: { type: Boolean, default: true },
      assets: { type: Boolean, default: true },
      grievances: { type: Boolean, default: true },
      performance: { type: Boolean, default: true },
      documents: { type: Boolean, default: true },
    },
    biometricConfig: {
      enabled: { type: Boolean, default: false },
      deviceType: { type: String, default: 'ZKTeco / eSSL' },
      serverIp: { type: String, default: '' },
      port: { type: Number, default: 4370 },
      autoSyncIntervalMinutes: { type: Number, default: 15 },
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('CompanySettings', companySettingsSchema);
