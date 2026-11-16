import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

const MASTER_DATA_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const fetchMasterData = createAsyncThunk(
  'masterData/fetchAll',
  async (force = false, { getState, rejectWithValue }) => {
    const { masterData } = getState();
    const now = Date.now();

    if (!force && masterData.isLoaded && masterData.lastFetchedAt && now - masterData.lastFetchedAt < MASTER_DATA_TTL_MS) {
      return {
        departments: masterData.departments,
        designations: masterData.designations,
        branches: masterData.branches,
        shifts: masterData.shifts,
        leaveTypes: masterData.leaveTypes,
        fromCache: true,
      };
    }

    try {
      const [deptRes, desigRes, branchRes, shiftRes, leaveTypesRes] = await Promise.all([
        api.get('/departments', { cacheTtl: MASTER_DATA_TTL_MS }),
        api.get('/designations', { cacheTtl: MASTER_DATA_TTL_MS }),
        api.get('/organization/branches', { cacheTtl: MASTER_DATA_TTL_MS }).catch(() => ({ data: { branches: [] } })),
        api.get('/shifts', { cacheTtl: MASTER_DATA_TTL_MS }).catch(() => ({ data: { shifts: [] } })),
        api.get('/leaves/types', { cacheTtl: MASTER_DATA_TTL_MS }).catch(() => ({ data: { leaveTypes: [] } })),
      ]);

      const departments = deptRes.data?.departments || deptRes.departments || [];
      const designations = desigRes.data?.designations || desigRes.designations || [];
      const branches = branchRes.data?.branches || branchRes.branches || [];
      const shifts = shiftRes.data?.shifts || shiftRes.shifts || [];
      const leaveTypes = leaveTypesRes.data?.leaveTypes || leaveTypesRes.leaveTypes || [];

      return {
        departments,
        designations,
        branches,
        shifts,
        leaveTypes,
        fromCache: false,
      };
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to load master metadata');
    }
  }
);

const initialState = {
  departments: [],
  designations: [],
  branches: [],
  shifts: [],
  leaveTypes: [],
  loading: false,
  isLoaded: false,
  lastFetchedAt: null,
  error: null,
};

const masterDataSlice = createSlice({
  name: 'masterData',
  initialState,
  reducers: {
    addDepartment: (state, action) => {
      const dept = action.payload;
      if (dept && !state.departments.some((d) => d._id === dept._id)) {
        state.departments.push(dept);
        state.departments.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      }
    },
    updateDepartment: (state, action) => {
      const dept = action.payload;
      if (dept) {
        state.departments = state.departments.map((d) => (d._id === dept._id ? { ...d, ...dept } : d));
      }
    },
    removeDepartment: (state, action) => {
      const id = action.payload;
      state.departments = state.departments.filter((d) => d._id !== id);
    },
    addDesignation: (state, action) => {
      const desig = action.payload;
      if (desig && !state.designations.some((d) => d._id === desig._id)) {
        state.designations.push(desig);
      }
    },
    updateDesignation: (state, action) => {
      const desig = action.payload;
      if (desig) {
        state.designations = state.designations.map((d) => (d._id === desig._id ? { ...d, ...desig } : d));
      }
    },
    removeDesignation: (state, action) => {
      const id = action.payload;
      state.designations = state.designations.filter((d) => d._id !== id);
    },
    addShift: (state, action) => {
      const shift = action.payload;
      if (shift && !state.shifts.some((s) => s._id === shift._id)) {
        state.shifts.push(shift);
      }
    },
    updateShift: (state, action) => {
      const shift = action.payload;
      if (shift) {
        state.shifts = state.shifts.map((s) => (s._id === shift._id ? { ...s, ...shift } : s));
      }
    },
    removeShift: (state, action) => {
      const id = action.payload;
      state.shifts = state.shifts.filter((s) => s._id !== id);
    },
    invalidateMasterData: (state) => {
      state.lastFetchedAt = null;
      state.isLoaded = false;
    },
    clearMasterData: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMasterData.pending, (state) => {
        if (!state.isLoaded) {
          state.loading = true;
        }
        state.error = null;
      })
      .addCase(fetchMasterData.fulfilled, (state, action) => {
        state.loading = false;
        state.isLoaded = true;
        state.lastFetchedAt = Date.now();
        state.departments = action.payload.departments;
        state.designations = action.payload.designations;
        state.branches = action.payload.branches;
        state.shifts = action.payload.shifts;
        state.leaveTypes = action.payload.leaveTypes;
      })
      .addCase(fetchMasterData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const {
  addDepartment,
  updateDepartment,
  removeDepartment,
  addDesignation,
  updateDesignation,
  removeDesignation,
  addShift,
  updateShift,
  removeShift,
  invalidateMasterData,
  clearMasterData,
} = masterDataSlice.actions;

export default masterDataSlice.reducer;
