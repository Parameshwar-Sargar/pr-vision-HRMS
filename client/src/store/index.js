import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import masterDataReducer from './slices/masterDataSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    masterData: masterDataReducer,
  },
});

export default store;

